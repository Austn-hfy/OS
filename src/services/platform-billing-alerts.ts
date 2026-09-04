import "server-only";

import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { Resend } from "resend";
import { getDb } from "@/db/client";
import {
  attentionItems,
  platformBillingAlerts,
  platformOverageEvents,
  platformSettings,
  platformSubscriptions,
  residencies,
} from "@/db/schema";
import { requiredEnv } from "@/lib/env";
import { assertCurrentPlatformBillingStaging } from "@/lib/platform-billing-stage";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function ownerBillingEmail() {
  if (process.env.PLATFORM_BILLING_OWNER_EMAIL?.trim()) return process.env.PLATFORM_BILLING_OWNER_EMAIL.trim();
  const [settings] = await getDb().select({ billingEmail: platformSettings.billingEmail }).from(platformSettings).limit(1);
  return settings?.billingEmail || process.env.INVOICE_REPLY_TO || "billing@hearforyou.group";
}

export async function queuePlatformPaymentFailedAlerts(input: {
  platformSubscriptionId: string;
  stripeEventId: string;
  failureMessage: string;
}) {
  assertCurrentPlatformBillingStaging();
  const database = getDb();
  const [record] = await database.select({
    residencyId: residencies.id,
    residencyName: residencies.name,
    billingContactEmail: residencies.billingContactEmail,
    primaryContactEmail: residencies.primaryContactEmail,
  }).from(platformSubscriptions)
    .innerJoin(residencies, eq(platformSubscriptions.residencyId, residencies.id))
    .where(eq(platformSubscriptions.id, input.platformSubscriptionId)).limit(1);
  if (!record) return [];
  const ownerEmail = await ownerBillingEmail();
  const hotelEmail = record.billingContactEmail || record.primaryContactEmail;
  const recipients = [
    { audience: "owner" as const, email: ownerEmail },
    ...(hotelEmail ? [{ audience: "hotel" as const, email: hotelEmail }] : []),
  ];
  const queued = [];
  for (const recipient of recipients) {
    const [alert] = await database.insert(platformBillingAlerts).values({
      residencyId: record.residencyId,
      platformSubscriptionId: input.platformSubscriptionId,
      kind: "payment_failed",
      audience: recipient.audience,
      recipientEmail: recipient.email,
      idempotencyKey: `stripe/${input.stripeEventId}/payment-failed/${recipient.audience}`,
      error: "",
    }).onConflictDoNothing().returning({ id: platformBillingAlerts.id });
    if (alert) queued.push(alert.id);
  }
  await database.insert(attentionItems).values({
    residencyId: record.residencyId,
    entityType: "platform_subscription",
    entityId: input.platformSubscriptionId,
    code: "platform_payment_failed",
    message: `${record.residencyName}'s Platform subscription payment failed. Portal access remains active.`,
    details: { stripeEventId: input.stripeEventId, failureMessage: input.failureMessage, accessBehavior: "never_restrict" },
  }).onConflictDoUpdate({
    target: [attentionItems.entityType, attentionItems.entityId, attentionItems.code],
    targetWhere: eq(attentionItems.status, "open"),
    set: {
      message: `${record.residencyName}'s Platform subscription payment failed. Portal access remains active.`,
      details: { stripeEventId: input.stripeEventId, failureMessage: input.failureMessage, accessBehavior: "never_restrict" },
    },
  });
  return queued;
}

export async function resolvePlatformPaymentFailure(platformSubscriptionId: string) {
  assertCurrentPlatformBillingStaging();
  const now = new Date();
  await getDb().update(attentionItems).set({ status: "resolved", resolvedAt: now })
    .where(and(
      eq(attentionItems.entityType, "platform_subscription"),
      eq(attentionItems.entityId, platformSubscriptionId),
      eq(attentionItems.code, "platform_payment_failed"),
      eq(attentionItems.status, "open"),
    ));
}

export async function queueMonthlyOverageHeadsUps(at = new Date(), force = false) {
  assertCurrentPlatformBillingStaging();
  if (!force && at.getUTCDate() < 25) return [];
  const today = at.toISOString().slice(0, 10);
  const database = getDb();
  const events = await database.select({
    id: platformOverageEvents.id,
    residencyId: platformOverageEvents.residencyId,
    platformSubscriptionId: platformOverageEvents.platformSubscriptionId,
    periodStart: platformOverageEvents.periodStart,
    periodEnd: platformOverageEvents.periodEnd,
    metric: platformOverageEvents.metric,
    committedCount: platformOverageEvents.committedCount,
    liveCount: platformOverageEvents.liveCount,
    overBy: platformOverageEvents.overBy,
  }).from(platformOverageEvents).where(and(
    isNull(platformOverageEvents.notifiedAt),
    isNull(platformOverageEvents.resolvedAt),
    lte(platformOverageEvents.periodStart, today),
  ));
  if (!events.length) return [];
  const ownerEmail = await ownerBillingEmail();
  const queued: string[] = [];
  const monthlyByPlan = new Map<string, typeof events>();
  for (const event of events) {
    const key = `${event.platformSubscriptionId}/${event.periodStart}`;
    monthlyByPlan.set(key, [...(monthlyByPlan.get(key) ?? []), event]);
  }
  for (const monthlyEvents of monthlyByPlan.values()) {
    const event = monthlyEvents[0];
    const [alert] = await database.insert(platformBillingAlerts).values({
      residencyId: event.residencyId,
      platformSubscriptionId: event.platformSubscriptionId,
      kind: "overage_heads_up",
      audience: "owner",
      recipientEmail: ownerEmail,
      idempotencyKey: `overage/${event.platformSubscriptionId}/${event.periodStart}/owner`,
    }).onConflictDoNothing().returning({ id: platformBillingAlerts.id });
    await database.update(platformOverageEvents).set({ notifiedAt: at })
      .where(inArray(platformOverageEvents.id, monthlyEvents.map((item) => item.id)));
    if (alert) queued.push(alert.id);
  }
  return queued;
}

function alertContent(alert: {
  kind: "payment_failed" | "payment_resolved" | "overage_heads_up";
  audience: "owner" | "hotel";
  residencyName: string;
}) {
  if (alert.kind === "payment_failed") {
    return alert.audience === "hotel" ? {
      subject: `Action needed: ${alert.residencyName} Platform payment failed`,
      html: `<p>Hi there,</p><p>We could not process the latest Platform subscription payment for <strong>${escapeHtml(alert.residencyName)}</strong>.</p><p>Your portal remains fully available. Please sign in and open Settings → Billing to update the card on file.</p><p>Platform Billing</p>`,
    } : {
      subject: `[TEST MODE] ${alert.residencyName} Platform payment failed`,
      html: `<p>The Stripe test-mode Platform payment for <strong>${escapeHtml(alert.residencyName)}</strong> failed.</p><p>The hotel has also been queued for notification. Portal access remains active by design.</p>`,
    };
  }
  if (alert.kind === "overage_heads_up") return {
    subject: `[TEST MODE] ${alert.residencyName} monthly Platform usage heads-up`,
    html: `<p><strong>${escapeHtml(alert.residencyName)}</strong> is over at least one Committed Plan allowance this month.</p><p>No charge or plan change was made. Review the Developer Platform billing comparison and confirm any manual plan change with the client for next month.</p>`,
  };
  return {
    subject: `[TEST MODE] ${alert.residencyName} Platform payment resolved`,
    html: `<p>The Platform subscription payment issue for <strong>${escapeHtml(alert.residencyName)}</strong> is resolved.</p>`,
  };
}

export async function sendPendingPlatformBillingAlerts(limit = 25, alertIds?: string[]) {
  assertCurrentPlatformBillingStaging();
  const database = getDb();
  const pending = await database.select({
    id: platformBillingAlerts.id,
    kind: platformBillingAlerts.kind,
    audience: platformBillingAlerts.audience,
    recipientEmail: platformBillingAlerts.recipientEmail,
    idempotencyKey: platformBillingAlerts.idempotencyKey,
    residencyName: residencies.name,
  }).from(platformBillingAlerts)
    .innerJoin(residencies, eq(platformBillingAlerts.residencyId, residencies.id))
    .where(alertIds?.length
      ? inArray(platformBillingAlerts.id, alertIds)
      : inArray(platformBillingAlerts.status, ["pending", "failed"]))
    .orderBy(asc(platformBillingAlerts.createdAt))
    .limit(limit);
  const results = [];
  for (const alert of pending) {
    const attemptedAt = new Date();
    try {
      const resend = new Resend(requiredEnv("RESEND_API_KEY"));
      const content = alertContent(alert);
      const result = await resend.emails.send({
        from: process.env.PLATFORM_BILLING_FROM_EMAIL || requiredEnv("INVOICE_FROM_EMAIL"),
        // Staging is deliberately unable to email a real hotel address. Both
        // owner/hotel notifications remain separate outbox records, but every
        // test delivery is captured by one explicit test inbox.
        to: requiredEnv("PLATFORM_BILLING_TEST_RECIPIENT_EMAIL"),
        replyTo: process.env.PLATFORM_BILLING_REPLY_TO || process.env.INVOICE_REPLY_TO || "billing@hearforyou.group",
        subject: `[STAGING for ${alert.audience}: ${alert.recipientEmail}] ${content.subject}`,
        html: `<p><strong>Staging test delivery.</strong> Intended recipient: ${escapeHtml(alert.recipientEmail)}</p>${content.html}`,
      }, { idempotencyKey: alert.idempotencyKey });
      if (result.error) throw new Error(result.error.message);
      await database.update(platformBillingAlerts).set({
        status: "sent",
        providerMessageId: result.data?.id ?? null,
        attemptedAt,
        sentAt: attemptedAt,
        error: "",
      }).where(eq(platformBillingAlerts.id, alert.id));
      results.push({ id: alert.id, status: "sent" as const });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Platform billing alert failed.";
      await database.update(platformBillingAlerts).set({ status: "failed", attemptedAt, error: message })
        .where(eq(platformBillingAlerts.id, alert.id));
      results.push({ id: alert.id, status: "failed" as const, error: message });
    }
  }
  return results;
}
