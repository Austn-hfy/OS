import { getInvoiceBrandingSettings, loadInvoiceLogoDataUrl } from "@/services/invoice-branding";
import { requireInternalActor } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireInternalActor();
  const settings = await getInvoiceBrandingSettings();
  if (!settings.logo) return new Response("Invoice logo not found.", { status: 404 });
  const dataUrl = await loadInvoiceLogoDataUrl(settings.logo);
  if (!dataUrl) return new Response("Invoice logo not found.", { status: 404 });
  const comma = dataUrl.indexOf(",");
  return new Response(Buffer.from(dataUrl.slice(comma + 1), "base64"), {
    headers: { "Cache-Control": "private, no-store", "Content-Type": settings.logo.contentType },
  });
}
