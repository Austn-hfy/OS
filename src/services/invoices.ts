import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { Resend } from "resend";
import { getDb } from "@/db/client";
import { attentionItems, auditLog, invoiceDeliveries, invoiceLineItems, invoices, residencies, shifts } from "@/db/schema";
import { addDays } from "@/domain/airtable-parity";
import { createInvoiceDocumentSnapshot, type InvoiceDocumentSnapshot } from "@/domain/invoice-document";
import type { InternalActor } from "@/lib/auth";
import { requiredEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getInvoiceBrandingSettings, loadInvoiceLogoDataUrl } from "@/services/invoice-branding";
import { renderHtmlToPdf } from "@/services/invoice-pdf/runtime";
import { renderInvoiceHtml } from "@/services/invoice-pdf/template";

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

export async function approveInvoice(actor: InternalActor, invoiceId: string) {
  let uploadedStoragePath: string | null = null;
  try {
    const { source, snapshot } = await buildInvoiceSnapshot(invoiceId);
    const sourceHash = invoiceSourceHash(snapshot);
    const logoDataUrl = await loadInvoiceLogoDataUrl(snapshot.issuer.logo);
    const pdf = await renderHtmlToPdf(renderInvoiceHtml(snapshot, { logoDataUrl }));
    if (pdf.length <= 0 || pdf.length > MAX_INVOICE_PDF_BYTES || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("Native Invoice PDF generation returned an invalid document.");
    }
    const pdfSha256 = createHash("sha256").update(pdf).digest("hex");
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
    const resend = new Resend(requiredEnv("RESEND_API_KEY"));
    const result = await resend.emails.send({
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
