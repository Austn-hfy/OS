import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { attentionItems, auditLog, invoiceDeliveries, invoices, residencies } from "@/db/schema";
import { addDays } from "@/domain/airtable-parity";
import { requiredEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/services/outbound-email";

export async function sendApprovedInvoice(invoiceId: string) {
  const database = getDb();
  const [invoice] = await database.select({
    id: invoices.id,
    residencyId: invoices.residencyId,
    invoiceNumber: invoices.invoiceNumber,
    invoiceDate: invoices.invoiceDate,
    paymentTermsDays: invoices.paymentTermsDays,
    status: invoices.status,
    version: invoices.version,
    totalCents: invoices.totalCents,
    pdfStoragePath: invoices.pdfStoragePath,
    pdfSha256: invoices.pdfSha256,
    residencyName: residencies.name,
    billingContactEmail: residencies.billingContactEmail,
    billingContactName: residencies.billingContactName,
    autoSendInvoices: residencies.autoSendInvoices,
  }).from(invoices).innerJoin(residencies, eq(invoices.residencyId, residencies.id))
    .where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice || invoice.status !== "approved") return { status: "skipped" as const };
  if (!invoice.autoSendInvoices) return { status: "manual" as const };
  if (!invoice.pdfStoragePath || !invoice.billingContactEmail) throw new Error("Approved Invoice is missing its PDF or billing contact.");

  const idempotencyKey = `invoice/${invoice.id}/v${invoice.version}`;
  const [reserved] = await database.insert(invoiceDeliveries).values({
    invoiceId: invoice.id,
    invoiceVersion: invoice.version,
    recipient: invoice.billingContactEmail,
    idempotencyKey,
    status: "pending",
  }).onConflictDoNothing().returning({ id: invoiceDeliveries.id });
  const [delivery] = reserved ? [reserved] : await database.select({ id: invoiceDeliveries.id, status: invoiceDeliveries.status })
    .from(invoiceDeliveries).where(eq(invoiceDeliveries.idempotencyKey, idempotencyKey)).limit(1);
  if (!delivery || ("status" in delivery && delivery.status === "sent")) return { status: "sent" as const };

  try {
    const supabase = createSupabaseAdminClient();
    const download = await supabase.storage.from("invoice-pdfs").download(invoice.pdfStoragePath);
    if (download.error) throw download.error;
    const attachment = Buffer.from(await download.data.arrayBuffer());
    if (invoice.pdfSha256 && createHash("sha256").update(attachment).digest("hex") !== invoice.pdfSha256) {
      throw new Error("Stored Invoice PDF checksum does not match its approved record.");
    }
    const result = await sendEmail({
      from: requiredEnv("INVOICE_FROM_EMAIL"),
      to: invoice.billingContactEmail,
      replyTo: process.env.INVOICE_REPLY_TO || "billing@hearforyou.group",
      subject: `${invoice.residencyName} — Invoice ${invoice.invoiceNumber}`,
      html: `<p>Hi ${invoice.billingContactName || "there"},</p><p>Attached is invoice <strong>${invoice.invoiceNumber}</strong> for ${invoice.residencyName}. Payment is due ${addDays(invoice.invoiceDate, invoice.paymentTermsDays)}.</p><p>Thank you,<br>Hear For You</p>`,
      attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: attachment }],
    }, { idempotencyKey });
    if (result.error) throw new Error(result.error.message);
    const now = new Date();
    await database.transaction(async (tx) => {
      await tx.update(invoiceDeliveries).set({ status: "sent", providerMessageId: result.data?.id ?? null, sentAt: now, error: null, attemptedAt: now })
        .where(eq(invoiceDeliveries.id, delivery.id));
      await tx.update(invoices).set({ status: "sent", sentAt: now, updatedAt: now }).where(eq(invoices.id, invoice.id));
      await tx.insert(auditLog).values({
        residencyId: invoice.residencyId,
        actorLabel: "automation:invoice-send",
        action: "invoice_sent",
        entityType: "invoice",
        entityId: invoice.id,
        details: { version: invoice.version, providerMessageId: result.data?.id ?? null },
      });
    });
    return { status: "sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invoice send failed.";
    await database.transaction(async (tx) => {
      await tx.update(invoiceDeliveries).set({ status: "failed", error: message, attemptedAt: new Date() })
        .where(eq(invoiceDeliveries.id, delivery.id));
      await tx.insert(attentionItems).values({
        residencyId: invoice.residencyId,
        entityType: "invoice",
        entityId: invoice.id,
        code: "invoice_send_failed",
        message: "Approved Invoice could not be sent.",
        details: { error: message, version: invoice.version },
      }).onConflictDoUpdate({
        target: [attentionItems.entityType, attentionItems.entityId, attentionItems.code],
        targetWhere: eq(attentionItems.status, "open"),
        set: { message: "Approved Invoice could not be sent.", details: { error: message, version: invoice.version } },
      });
    });
    throw error;
  }
}
