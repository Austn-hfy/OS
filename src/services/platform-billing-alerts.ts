import "server-only";

import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  attentionItems,
  platformBillingAlerts,
  platformOverageEvents,
  platformSubscriptions,
  residencies,
} from "@/db/schema";
import { requiredEnv } from "@/lib/env";
import { assertCurrentPlatformBillingStaging } from "@/lib/platform-billing-stage";
import { getOwnerBillingEmail, sendPlatformBillingEmail } from "@/services/platform-billing-email";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function paymentDeadline(value: Date) {
  return `${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(value)} UTC`;
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
    paymentGraceEndsAt: platformSubscriptions.paymentGraceEndsAt,
  }).from(platformSubscriptions)
    .innerJoin(residencies, eq(platformSubscriptions.residencyId, residencies.id))
    .where(eq(platformSubscriptions.id, input.platformSubscriptionId)).limit(1);
  if (!record) return [];
  const ownerEmail = await getOwnerBillingEmail();
  const graceDeadline = record.paymentGraceEndsAt
    ? paymentDeadline(record.paymentGraceEndsAt)
    : "14 days after the first failed payment";
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
    message: `${record.residencyName}'s Platform subscription payment failed. Full access continues through ${graceDeadline}.`,
    details: { stripeEventId: input.stripeEventId, failureMessage: input.failureMessage, accessBehavior: "restrict_operational_writes_after_grace", graceDeadline },
  }).onConflictDoUpdate({
    target: [attentionItems.entityType, attentionItems.entityId, attentionItems.code],
    targetWhere: eq(attentionItems.status, "open"),
    set: {
      message: `${record.residencyName}'s Platform subscription payment failed. Full access continues through ${graceDeadline}.`,
      details: { stripeEventId: input.stripeEventId, failureMessage: input.failureMessage, accessBehavior: "restrict_operational_writes_after_grace", graceDeadline },
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
  const ownerEmail = await getOwnerBillingEmail();
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
  paymentGraceEndsAt: Date | null;
}) {
  if (alert.kind === "payment_failed") {
    const deadline = alert.paymentGraceEndsAt
      ? paymentDeadline(alert.paymentGraceEndsAt)
      : "14 days after the first failed payment";
    return alert.audience === "hotel" ? {
      subject: `Action needed: ${alert.residencyName} Platform payment failed`,
      html: `<p>Hi there,</p><p>We could not process the latest Platform subscription payment for <strong>${escapeHtml(alert.residencyName)}</strong>.</p><p>Full access continues through <strong>${escapeHtml(deadline)}</strong>. After that deadline, operational changes pause until payment succeeds; your data remains available.</p><p>Please sign in and open Settings → Billing to update the card or pay the outstanding invoice.</p><p>Platform Billing</p>`,
    } : {
      subject: `[TEST MODE] ${alert.residencyName} Platform payment failed`,
      html: `<p>The Stripe test-mode Platform payment for <strong>${escapeHtml(alert.residencyName)}</strong> failed.</p><p>The hotel has also been queued for notification. Full access continues through ${escapeHtml(deadline)}, followed by operational-write restriction if unresolved.</p>`,
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
    residencyId: platformBillingAlerts.residencyId,
    residencyName: residencies.name,
    paymentGraceEndsAt: platformSubscriptions.paymentGraceEndsAt,
  }).from(platformBillingAlerts)
    .innerJoin(residencies, eq(platformBillingAlerts.residencyId, residencies.id))
    .innerJoin(platformSubscriptions, eq(platformBillingAlerts.platformSubscriptionId, platformSubscriptions.id))
    .where(alertIds?.length
      ? inArray(platformBillingAlerts.id, alertIds)
      : inArray(platformBillingAlerts.status, ["pending", "failed"]))
    .orderBy(asc(platformBillingAlerts.createdAt))
    .limit(limit);
  const results = [];
  for (const alert of pending) {
    const attemptedAt = new Date();
    try {
      const content = alertContent(alert);
      const result = await sendPlatformBillingEmail({
        residencyId: alert.residencyId,
        idempotencyKey: alert.idempotencyKey,
        emailKind: alert.kind,
        entityId: alert.id,
        email: {
          from: process.env.PLATFORM_BILLING_FROM_EMAIL || requiredEnv("INVOICE_FROM_EMAIL"),
          to: alert.recipientEmail,
          replyTo: process.env.PLATFORM_BILLING_REPLY_TO || process.env.INVOICE_REPLY_TO || "billing@hearforyou.group",
          subject: content.subject,
          html: content.html,
        },
      });
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
