import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { invoices, residencies, users } from "@/db/schema";
import { approveInvoice, renderDraftInvoicePdf } from "@/services/invoices";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPTANCE_RESIDENCY_ID = "11111111-1111-4111-8111-111111110002";
const ACCEPTANCE_INVOICE_ID = "11111111-1111-4111-8111-111111110004";
const ACCEPTANCE_TOKEN_SHA256 = "79ab41c1a95c2be83e6ae3f4f37e56ec2f0d00dba57d5193e9c683d7847a8aa5";

function hasValidOneTimeToken(request: Request) {
  const supplied = request.headers.get("x-hfy-acceptance-token") ?? "";
  const actual = Buffer.from(createHash("sha256").update(supplied).digest("hex"));
  const expected = Buffer.from(ACCEPTANCE_TOKEN_SHA256);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  if (!hasValidOneTimeToken(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const database = getDb();
  const [candidate] = await database.select({
    invoiceId: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    invoiceStatus: invoices.status,
    residencyId: residencies.id,
    residencySlug: residencies.slug,
    autoSendInvoices: residencies.autoSendInvoices,
  }).from(invoices)
    .innerJoin(residencies, eq(invoices.residencyId, residencies.id))
    .where(and(
      eq(invoices.id, ACCEPTANCE_INVOICE_ID),
      eq(residencies.id, ACCEPTANCE_RESIDENCY_ID),
    ))
    .limit(1);

  if (!candidate
    || candidate.invoiceNumber !== "HFYQA-2026-0904"
    || candidate.residencySlug !== "hfy-invoice-acceptance-2026-08-26"
    || candidate.autoSendInvoices
  ) {
    return Response.json({ error: "Controlled acceptance fixture is missing or unsafe." }, { status: 409 });
  }
  if (candidate.invoiceStatus !== "draft") {
    return Response.json({ error: "Controlled acceptance Invoice is no longer a Draft." }, { status: 409 });
  }

  if (request.headers.get("x-hfy-acceptance-mode") === "render") {
    const rendered = await renderDraftInvoicePdf(candidate.invoiceId);
    return new Response(new Uint8Array(rendered.pdf), {
      headers: {
        "Content-Disposition": `attachment; filename="${candidate.invoiceNumber}.pdf"`,
        "Content-Type": "application/pdf",
        "X-HFY-PDF-Byte-Size": String(rendered.pdf.length),
        "X-HFY-PDF-SHA-256": rendered.pdfSha256,
        "X-HFY-PDF-Source-Hash": rendered.sourceHash,
      },
    });
  }

  const [owner] = await database.select({
    id: users.id,
    email: users.email,
    displayName: users.displayName,
  }).from(users).where(and(
    eq(users.email, "austyn@hearforyou.group"),
    eq(users.role, "internal_admin"),
    eq(users.active, true),
  )).limit(1);
  if (!owner) {
    return Response.json({ error: "Active HFY owner profile not found." }, { status: 409 });
  }

  const delivery = await approveInvoice({
    kind: "internal",
    userId: owner.id,
    email: owner.email,
    displayName: owner.displayName,
  }, candidate.invoiceId);

  const [approved] = await database.select({
    status: invoices.status,
    version: invoices.version,
    pdfStoragePath: invoices.pdfStoragePath,
    pdfSourceHash: invoices.pdfSourceHash,
    pdfSha256: invoices.pdfSha256,
    pdfGeneratedAt: invoices.pdfGeneratedAt,
    pdfByteSize: invoices.pdfByteSize,
  }).from(invoices).where(eq(invoices.id, candidate.invoiceId)).limit(1);

  return Response.json({ ok: true, delivery: delivery.status, invoice: approved });
}
