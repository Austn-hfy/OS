import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { platformSubscriptionInvoices } from "@/db/schema";
import { requireResidencyActor } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const actor = await requireResidencyActor();
  if (actor.accessRole !== "manager") return new Response("Not found", { status: 404 });
  const { invoiceId } = await context.params;
  const [invoice] = await getDb().select({
    invoiceNumber: platformSubscriptionInvoices.invoiceNumber,
    pdfStoragePath: platformSubscriptionInvoices.pdfStoragePath,
  }).from(platformSubscriptionInvoices).where(and(
    eq(platformSubscriptionInvoices.id, invoiceId),
    eq(platformSubscriptionInvoices.residencyId, actor.residencyId),
  )).limit(1);
  if (!invoice?.pdfStoragePath) return new Response("Platform Invoice PDF not found", { status: 404 });
  const download = await createSupabaseAdminClient().storage.from("invoice-pdfs").download(invoice.pdfStoragePath);
  if (download.error) return new Response("Platform Invoice PDF not found", { status: 404 });
  const bytes = await download.data.arrayBuffer();
  const filename = `${invoice.invoiceNumber || "platform-invoice"}.pdf`.replaceAll(/[^A-Za-z0-9._-]/g, "-");
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
