import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { attentionItems, auditLog, invoiceLineItems, invoices, residencies, shifts } from "@/db/schema";
import { createInvoiceDocumentSnapshot, type InvoiceDocumentSnapshot } from "@/domain/invoice-document";
import type { InternalActor } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendApprovedInvoice } from "@/services/invoice-delivery";
import { getInvoiceBrandingSettings, loadInvoiceLogoDataUrl } from "@/services/invoice-branding";
import { renderHtmlToPdf } from "@/services/invoice-pdf/runtime";
import { renderInvoiceHtml } from "@/services/invoice-pdf/template";

export { sendApprovedInvoice } from "@/services/invoice-delivery";

const MAX_INVOICE_PDF_BYTES = 8 * 1024 * 1024;

function invoiceSourceHash(snapshot: InvoiceDocumentSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

async function buildInvoiceSnapshot(invoiceId: string) {
  const database = getDb();
  const [source] = await database.select({
    id: invoices.id,
    residencyId: invoices.residencyId,
    number: invoices.invoiceNumber,
    version: invoices.version,
    invoiceDate: invoices.invoiceDate,
    billingPeriodStart: invoices.billingPeriodStart,
    billingPeriodEnd: invoices.billingPeriodEnd,
    paymentTermsDays: invoices.paymentTermsDays,
    totalCents: invoices.totalCents,
    kind: invoices.kind,
    notes: invoices.notes,
    status: invoices.status,
    residencyName: residencies.name,
    residencyTimezone: residencies.timezone,
    billingContactName: residencies.billingContactName,
    billingContactEmail: residencies.billingContactEmail,
    billingAddress: residencies.billingAddress,
    invoiceLinePresentation: residencies.invoiceLinePresentation,
  }).from(invoices).innerJoin(residencies, eq(invoices.residencyId, residencies.id))
    .where(eq(invoices.id, invoiceId)).limit(1);
  if (!source || source.status !== "draft") throw new Error("Only a Draft Invoice can be approved.");

  const shiftRows = await database.select({
    id: shifts.id,
    name: shifts.name,
    serviceDate: shifts.serviceDate,
    room: shifts.room,
    startsAt: shifts.startsAt,
    endsAt: shifts.endsAt,
    clientRateCents: shifts.clientRateCents,
    billingStatus: shifts.billingStatus,
    invoiceLinkIssue: shifts.invoiceLinkIssue,
    invoiceLinkNote: shifts.invoiceLinkNote,
  }).from(shifts).where(eq(shifts.invoiceId, source.id)).orderBy(asc(shifts.serviceDate), asc(shifts.startsAt));

  const manualLineRows = await database.select({
    sourceShiftId: invoiceLineItems.sourceShiftId,
    type: invoiceLineItems.type,
    serviceDate: invoiceLineItems.serviceDate,
    description: invoiceLineItems.description,
    quantityThousandths: invoiceLineItems.quantityThousandths,
    unitLabel: invoiceLineItems.unitLabel,
    unitAmountCents: invoiceLineItems.unitAmountCents,
    totalCents: invoiceLineItems.totalCents,
  }).from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, source.id)).orderBy(asc(invoiceLineItems.sortOrder));

  const branding = await getInvoiceBrandingSettings();
  const snapshot = createInvoiceDocumentSnapshot({
    invoice: {
      id: source.id,
      number: source.number,
      version: source.version,
      invoiceDate: source.invoiceDate,
      billingPeriodStart: source.billingPeriodStart,
      billingPeriodEnd: source.billingPeriodEnd,
      paymentTermsDays: source.paymentTermsDays,
      totalCents: source.totalCents,
      kind: source.kind,
      notes: source.notes,
    },
    residency: {
      name: source.residencyName,
      timezone: source.residencyTimezone,
      billingContactName: source.billingContactName,
      billingContactEmail: source.billingContactEmail,
      billingAddress: source.billingAddress,
      invoiceLinePresentation: source.invoiceLinePresentation,
    },
    issuer: {
      name: branding.companyName,
      email: branding.billingEmail,
      address: branding.billingAddress,
      logo: branding.logo,
    },
    shifts: shiftRows,
    manualLines: manualLineRows.filter((line) => !line.sourceShiftId).map((line) => ({
      type: line.type,
      serviceDate: line.serviceDate,
      description: line.description,
      quantityThousandths: line.quantityThousandths,
      unitLabel: line.unitLabel,
      unitAmountCents: line.unitAmountCents,
      totalCents: line.totalCents,
    })),
  });
  return { source, snapshot };
}

async function recordInvoicePdfFailure(invoiceId: string, error: unknown) {
  const database = getDb();
  const [invoice] = await database.select({ residencyId: invoices.residencyId, version: invoices.version, status: invoices.status })
    .from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice || invoice.status !== "draft") return;
  const message = error instanceof Error ? error.message : "Invoice PDF generation failed.";
  await database.insert(attentionItems).values({
    residencyId: invoice.residencyId,
    entityType: "invoice",
    entityId: invoiceId,
    code: "invoice_pdf_generation_failed",
    message: "Draft Invoice could not be approved because its client PDF was not generated.",
    details: { error: message, version: invoice.version },
  }).onConflictDoUpdate({
    target: [attentionItems.entityType, attentionItems.entityId, attentionItems.code],
    targetWhere: eq(attentionItems.status, "open"),
    set: {
      message: "Draft Invoice could not be approved because its client PDF was not generated.",
      details: { error: message, version: invoice.version },
    },
  });
}

export async function renderDraftInvoicePdf(invoiceId: string) {
  const { source, snapshot } = await buildInvoiceSnapshot(invoiceId);
  const sourceHash = invoiceSourceHash(snapshot);
  const logoDataUrl = await loadInvoiceLogoDataUrl(snapshot.issuer.logo);
  const pdf = await renderHtmlToPdf(renderInvoiceHtml(snapshot, { logoDataUrl }));
  if (pdf.length <= 0 || pdf.length > MAX_INVOICE_PDF_BYTES || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Native Invoice PDF generation returned an invalid document.");
  }
  return {
    source,
    snapshot,
    sourceHash,
    pdf,
    pdfSha256: createHash("sha256").update(pdf).digest("hex"),
  };
}

export async function approveInvoice(actor: InternalActor, invoiceId: string) {
  let uploadedStoragePath: string | null = null;
  try {
    const { source, snapshot, sourceHash, pdf, pdfSha256 } = await renderDraftInvoicePdf(invoiceId);
    const storagePath = `${source.residencyId}/${source.id}/v${source.version}/${sourceHash.slice(0, 16)}-${randomUUID()}.pdf`;
    const supabase = createSupabaseAdminClient();
    const upload = await supabase.storage.from("invoice-pdfs").upload(storagePath, pdf, {
      contentType: "application/pdf",
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) throw upload.error;
    uploadedStoragePath = storagePath;

    const database = getDb();
    const generatedAt = new Date();
    const approved = await database.transaction(async (tx) => {
      const [updated] = await tx.update(invoices).set({
        status: "approved",
        pdfStoragePath: storagePath,
        pdfSourceHash: sourceHash,
        pdfSha256,
        pdfGeneratedAt: generatedAt,
        pdfGeneratedByUserId: actor.userId,
        pdfByteSize: pdf.length,
        pdfSnapshot: snapshot,
        updatedAt: generatedAt,
      }).where(and(
        eq(invoices.id, source.id),
        eq(invoices.status, "draft"),
        eq(invoices.version, source.version),
      )).returning({ id: invoices.id });
      if (!updated) throw new Error("This Invoice changed while its PDF was being generated. Review it and approve again.");
      await tx.insert(auditLog).values({
        residencyId: source.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "invoice_pdf_generated_and_approved",
        entityType: "invoice",
        entityId: source.id,
        details: {
          version: source.version,
          storagePath,
          sourceHash,
          pdfSha256,
          pdfByteSize: pdf.length,
          serviceLineCount: snapshot.serviceLines.length,
        },
      });
      await tx.update(attentionItems).set({ status: "resolved", resolvedAt: generatedAt })
        .where(and(
          eq(attentionItems.entityType, "invoice"),
          eq(attentionItems.entityId, source.id),
          eq(attentionItems.code, "invoice_pdf_generation_failed"),
          eq(attentionItems.status, "open"),
        ));
      return updated;
    });
    uploadedStoragePath = null;

    try {
      return await sendApprovedInvoice(approved.id);
    } catch {
      return { status: "failed" as const };
    }
  } catch (error) {
    if (uploadedStoragePath) {
      await createSupabaseAdminClient().storage.from("invoice-pdfs").remove([uploadedStoragePath]);
    }
    await recordInvoicePdfFailure(invoiceId, error);
    throw error;
  }
}
