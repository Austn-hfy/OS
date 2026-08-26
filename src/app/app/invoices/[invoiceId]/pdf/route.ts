import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { invoices } from "@/db/schema";
import { requireInternalActor } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export async function GET(_request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  await requireInternalActor();
  const { invoiceId } = await params;
  const [invoice] = await getDb().select({
    invoiceNumber: invoices.invoiceNumber,
    status: invoices.status,
    pdfStoragePath: invoices.pdfStoragePath,
  }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice || invoice.status === "draft" || !invoice.pdfStoragePath) {
    return new Response("Invoice PDF not found.", { status: 404 });
  }

  const download = await createSupabaseAdminClient().storage.from("invoice-pdfs").download(invoice.pdfStoragePath);
  if (download.error) return new Response("Invoice PDF could not be loaded.", { status: 502 });
  return new Response(await download.data.arrayBuffer(), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${safeFilename(invoice.invoiceNumber)}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
