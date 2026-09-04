import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  attentionItems,
  platformSettings,
  platformSubscriptionInvoices,
  platformSubscriptionRevisions,
  platformSubscriptions,
  residencies,
} from "@/db/schema";
import { createPlatformInvoiceDocumentSnapshot } from "@/domain/platform-invoice-document";
import { renderHtmlToPdf } from "@/services/invoice-pdf/runtime";
import { renderPlatformInvoiceHtml } from "@/services/invoice-pdf/platform-template";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCurrentPlatformBillingStaging } from "@/lib/platform-billing-stage";

const MAX_INVOICE_PDF_BYTES = 8 * 1024 * 1024;

export async function generatePlatformInvoicePdf(platformInvoiceId: string) {
  assertCurrentPlatformBillingStaging();
  const database = getDb();
  const [source] = await database.select({
    invoice: platformSubscriptionInvoices,
    residencyName: residencies.name,
    billingContactName: residencies.billingContactName,
    billingContactEmail: residencies.billingContactEmail,
    billingAddress: residencies.billingAddress,
    currentRevision: platformSubscriptions.revision,
    currentCadence: platformSubscriptions.cadence,
    currentTalentSessions: platformSubscriptions.talentProgramSessions,
    currentHousePrograms: platformSubscriptions.housePrograms,
    currentOneOffAllowance: platformSubscriptions.oneOffAllowance,
    currentUnitAmountCents: platformSubscriptions.unitAmountCents,
    revision: platformSubscriptionRevisions.revision,
    revisionCadence: platformSubscriptionRevisions.cadence,
    revisionTalentSessions: platformSubscriptionRevisions.talentProgramSessions,
    revisionHousePrograms: platformSubscriptionRevisions.housePrograms,
    revisionOneOffAllowance: platformSubscriptionRevisions.oneOffAllowance,
    revisionUnitAmountCents: platformSubscriptionRevisions.unitAmountCents,
  }).from(platformSubscriptionInvoices)
    .innerJoin(platformSubscriptions, eq(platformSubscriptionInvoices.platformSubscriptionId, platformSubscriptions.id))
    .innerJoin(residencies, eq(platformSubscriptionInvoices.residencyId, residencies.id))
    .leftJoin(platformSubscriptionRevisions, and(
      eq(platformSubscriptionRevisions.platformSubscriptionId, platformSubscriptionInvoices.platformSubscriptionId),
      eq(platformSubscriptionRevisions.revision, platformSubscriptionInvoices.planRevision),
    ))
    .where(eq(platformSubscriptionInvoices.id, platformInvoiceId)).limit(1);
  if (!source) throw new Error("Platform subscription invoice not found.");
  if (source.invoice.pdfStoragePath) return { status: "exists" as const, storagePath: source.invoice.pdfStoragePath };

  const [settings] = await database.select({
    companyName: platformSettings.companyName,
    billingEmail: platformSettings.billingEmail,
    billingAddress: platformSettings.billingAddress,
  }).from(platformSettings).limit(1);
  const snapshot = createPlatformInvoiceDocumentSnapshot({
    invoice: {
      id: source.invoice.id,
      stripeInvoiceId: source.invoice.stripeInvoiceId,
      number: source.invoice.invoiceNumber || source.invoice.stripeInvoiceId,
      invoiceDate: source.invoice.invoiceDate,
      billingPeriodStart: source.invoice.billingPeriodStart,
      billingPeriodEnd: source.invoice.billingPeriodEnd,
      currency: "USD",
      amountDueCents: source.invoice.amountDueCents,
      amountPaidCents: source.invoice.amountPaidCents,
      status: source.invoice.status,
    },
    issuer: {
      legalName: process.env.PLATFORM_BILLING_LEGAL_NAME || settings?.companyName || "HFY LLC",
      productName: process.env.PLATFORM_PRODUCT_NAME || "Platform",
      email: process.env.PLATFORM_BILLING_REPLY_TO || settings?.billingEmail || "billing@hearforyou.group",
      address: process.env.PLATFORM_BILLING_ADDRESS || settings?.billingAddress || "",
    },
    billTo: {
      residencyName: source.residencyName,
      contactName: source.billingContactName,
      contactEmail: source.billingContactEmail,
      address: source.billingAddress,
    },
    committedPlan: {
      revision: source.revision ?? source.currentRevision,
      cadence: source.revisionCadence ?? source.currentCadence,
      talentSessions: source.revisionTalentSessions ?? source.currentTalentSessions,
      housePrograms: source.revisionHousePrograms ?? source.currentHousePrograms,
      oneOffAllowance: source.revisionOneOffAllowance ?? source.currentOneOffAllowance,
      unitAmountCents: source.revisionUnitAmountCents ?? source.currentUnitAmountCents,
    },
  });
  const pdf = await renderHtmlToPdf(renderPlatformInvoiceHtml(snapshot));
  if (pdf.length <= 0 || pdf.length > MAX_INVOICE_PDF_BYTES || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Platform Invoice PDF generation returned an invalid document.");
  }
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const storagePath = `platform/${source.invoice.residencyId}/${source.invoice.id}/${sha256.slice(0, 16)}-${randomUUID()}.pdf`;
  const upload = await createSupabaseAdminClient().storage.from("invoice-pdfs").upload(storagePath, pdf, {
    contentType: "application/pdf",
    cacheControl: "31536000",
    upsert: false,
  });
  if (upload.error) throw upload.error;

  const generatedAt = new Date();
  const [updated] = await database.update(platformSubscriptionInvoices).set({
    pdfStoragePath: storagePath,
    pdfSha256: sha256,
    pdfByteSize: pdf.length,
    pdfGeneratedAt: generatedAt,
    pdfSnapshot: snapshot,
    updatedAt: generatedAt,
  }).where(and(
    eq(platformSubscriptionInvoices.id, platformInvoiceId),
    eq(platformSubscriptionInvoices.stripeInvoiceId, source.invoice.stripeInvoiceId),
  )).returning({ id: platformSubscriptionInvoices.id });
  if (!updated) {
    await createSupabaseAdminClient().storage.from("invoice-pdfs").remove([storagePath]);
    throw new Error("Platform Invoice changed while its PDF was being generated.");
  }
  await database.update(attentionItems).set({ status: "resolved", resolvedAt: generatedAt })
    .where(and(
      eq(attentionItems.entityType, "platform_subscription_invoice"),
      eq(attentionItems.entityId, platformInvoiceId),
      eq(attentionItems.code, "platform_invoice_pdf_failed"),
      eq(attentionItems.status, "open"),
    ));
  return { status: "generated" as const, storagePath };
}

export async function generatePlatformInvoicePdfSafely(platformInvoiceId: string) {
  assertCurrentPlatformBillingStaging();
  try {
    return await generatePlatformInvoicePdf(platformInvoiceId);
  } catch (error) {
    const database = getDb();
    const [invoice] = await database.select({
      residencyId: platformSubscriptionInvoices.residencyId,
    }).from(platformSubscriptionInvoices).where(eq(platformSubscriptionInvoices.id, platformInvoiceId)).limit(1);
    if (invoice) {
      const message = error instanceof Error ? error.message : "Platform Invoice PDF generation failed.";
      await database.insert(attentionItems).values({
        residencyId: invoice.residencyId,
        entityType: "platform_subscription_invoice",
        entityId: platformInvoiceId,
        code: "platform_invoice_pdf_failed",
        message: "Platform subscription Invoice PDF could not be generated.",
        details: { error: message },
      }).onConflictDoUpdate({
        target: [attentionItems.entityType, attentionItems.entityId, attentionItems.code],
        targetWhere: eq(attentionItems.status, "open"),
        set: { message: "Platform subscription Invoice PDF could not be generated.", details: { error: message } },
      });
    }
    return { status: "failed" as const, error: error instanceof Error ? error.message : "Platform Invoice PDF generation failed." };
  }
}
