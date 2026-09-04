import "server-only";

import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/db/client";
import {
  auditLog,
  platformSubscriptionInvoices,
  platformSubscriptionRevisions,
  platformSubscriptions,
  stripeWebhookEvents,
} from "@/db/schema";
import { queuePlatformPaymentFailedAlerts, resolvePlatformPaymentFailure, sendPendingPlatformBillingAlerts } from "@/services/platform-billing-alerts";
import { getStripe } from "@/lib/stripe";

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function dateFromUnix(value: number) {
  return new Date(value * 1_000).toISOString().slice(0, 10);
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): typeof platformSubscriptions.$inferSelect.status {
  switch (status) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due": return "past_due";
    case "unpaid": return "unpaid";
    case "paused": return "paused";
    case "canceled": return "cancelled";
    case "incomplete":
    case "incomplete_expired":
    default: return "incomplete";
  }
}

function mapInvoiceStatus(status: Stripe.Invoice.Status | null): typeof platformSubscriptionInvoices.$inferSelect.status {
  switch (status) {
    case "paid": return "paid";
    case "void": return "void";
    case "uncollectible": return "uncollectible";
    default: return "open";
  }
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice) {
  return objectId(invoice.parent?.subscription_details?.subscription)
    ?? objectId((invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription);
}

function planRevisionFromInvoice(invoice: Stripe.Invoice, fallback: number) {
  const raw = invoice.parent?.subscription_details?.metadata?.committed_plan_revision;
  const value = raw ? Number(raw) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

async function paymentCard(subscription: Stripe.Subscription) {
  const stripe = getStripe();
  let paymentMethod = subscription.default_payment_method;
  if (!paymentMethod) {
    const customerId = objectId(subscription.customer);
    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] });
      if (!customer.deleted) paymentMethod = customer.invoice_settings.default_payment_method;
    }
  }
  if (typeof paymentMethod === "string") paymentMethod = await stripe.paymentMethods.retrieve(paymentMethod);
  return paymentMethod && "card" in paymentMethod && paymentMethod.card ? {
    brand: paymentMethod.card.brand,
    last4: paymentMethod.card.last4,
  } : { brand: "", last4: "" };
}

export async function syncStripeSubscription(stripeSubscriptionId: string) {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, { expand: ["default_payment_method"] });
  if (subscription.livemode) throw new Error("Live-mode Stripe subscriptions are rejected by the staging webhook.");
  const localPlanId = subscription.metadata.hfy_platform_subscription_id;
  const [plan] = localPlanId
    ? await getDb().select().from(platformSubscriptions).where(eq(platformSubscriptions.id, localPlanId)).limit(1)
    : await getDb().select().from(platformSubscriptions).where(eq(platformSubscriptions.stripeSubscriptionId, subscription.id)).limit(1);
  if (!plan) return null;
  if (subscription.metadata.hfy_residency_id && subscription.metadata.hfy_residency_id !== plan.residencyId) {
    throw new Error("Stripe subscription metadata does not match the local Residency.");
  }
  const item = subscription.items.data[0];
  if (!item) throw new Error("Stripe subscription has no item.");
  const card = await paymentCard(subscription);
  const nextChargeTimestamp = subscription.items.data.reduce((latest, candidate) => Math.max(latest, candidate.current_period_end), 0);
  const now = new Date();
  const [updated] = await getDb().update(platformSubscriptions).set({
    stripeCustomerId: objectId(subscription.customer),
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionItemId: item.id,
    stripeProductId: objectId(item.price.product),
    stripePriceId: item.price.id,
    status: mapSubscriptionStatus(subscription.status),
    cardBrand: card.brand,
    cardLast4: card.last4,
    nextChargeAt: nextChargeTimestamp ? new Date(nextChargeTimestamp * 1_000) : null,
    renewsOn: nextChargeTimestamp ? dateFromUnix(nextChargeTimestamp) : plan.renewsOn,
    lastStripeSyncedAt: now,
    updatedAt: now,
  }).where(eq(platformSubscriptions.id, plan.id)).returning();
  const metadataRevision = Number(subscription.metadata.committed_plan_revision);
  const revision = Number.isInteger(metadataRevision) && metadataRevision > 0 ? metadataRevision : plan.revision;
  await getDb().update(platformSubscriptionRevisions).set({
    stripeSyncStatus: "synced",
    stripeSyncError: "",
    stripePriceId: item.price.id,
    syncedAt: now,
  }).where(and(
    eq(platformSubscriptionRevisions.platformSubscriptionId, plan.id),
    eq(platformSubscriptionRevisions.revision, revision),
  ));
  return updated ?? null;
}

export async function syncStripeInvoice(invoice: Stripe.Invoice) {
  if (invoice.livemode) throw new Error("Live-mode Stripe invoices are rejected by the staging webhook.");
  const stripeSubscriptionId = subscriptionIdFromInvoice(invoice);
  if (!stripeSubscriptionId) return null;
  let [plan] = await getDb().select().from(platformSubscriptions)
    .where(eq(platformSubscriptions.stripeSubscriptionId, stripeSubscriptionId)).limit(1);
  if (!plan) {
    await syncStripeSubscription(stripeSubscriptionId);
    [plan] = await getDb().select().from(platformSubscriptions)
      .where(eq(platformSubscriptions.stripeSubscriptionId, stripeSubscriptionId)).limit(1);
  }
  if (!plan) return null;
  const values = {
    platformSubscriptionId: plan.id,
    residencyId: plan.residencyId,
    stripeInvoiceId: invoice.id,
    invoiceNumber: invoice.number ?? invoice.id,
    planRevision: planRevisionFromInvoice(invoice, plan.revision),
    billingPeriodStart: dateFromUnix(invoice.period_start),
    billingPeriodEnd: dateFromUnix(invoice.period_end),
    invoiceDate: dateFromUnix(invoice.created),
    amountDueCents: invoice.amount_due,
    amountPaidCents: invoice.amount_paid,
    status: mapInvoiceStatus(invoice.status),
    currency: "USD" as const,
    hostedInvoiceUrl: invoice.hosted_invoice_url,
    stripePdfUrl: invoice.invoice_pdf,
    updatedAt: new Date(),
  };
  const [record] = await getDb().insert(platformSubscriptionInvoices).values(values).onConflictDoUpdate({
    target: platformSubscriptionInvoices.stripeInvoiceId,
    set: values,
  }).returning();
  return record ?? null;
}

async function applyCompletedCheckout(session: Stripe.Checkout.Session) {
  if (session.livemode) throw new Error("Live-mode Checkout Sessions are rejected by staging.");
  if (session.mode === "subscription") {
    const subscriptionId = objectId(session.subscription);
    if (subscriptionId) return syncStripeSubscription(subscriptionId);
    return null;
  }
  if (session.mode === "setup" && session.metadata?.purpose === "update_platform_subscription_card") {
    const setupIntentId = objectId(session.setup_intent);
    const customerId = objectId(session.customer);
    const subscriptionId = session.metadata.stripe_subscription_id;
    if (!setupIntentId || !customerId || !subscriptionId) throw new Error("Completed card-update Checkout Session is missing Stripe references.");
    const stripe = getStripe();
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = objectId(setupIntent.payment_method);
    if (!paymentMethodId) throw new Error("Completed card-update Checkout Session has no Payment Method.");
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    await stripe.subscriptions.update(subscriptionId, { default_payment_method: paymentMethodId, proration_behavior: "none" });
    return syncStripeSubscription(subscriptionId);
  }
  return null;
}

async function applyInvoiceEvent(event: Stripe.Event, invoice: Stripe.Invoice) {
  const record = await syncStripeInvoice(invoice);
  if (!record) return;
  if (event.type === "invoice.payment_failed") {
    const message = invoice.last_finalization_error?.message || "Stripe could not collect the Platform subscription payment.";
    await getDb().update(platformSubscriptions).set({
      status: "past_due",
      paymentFailedAt: new Date(),
      paymentFailureMessage: message,
      updatedAt: new Date(),
    }).where(eq(platformSubscriptions.id, record.platformSubscriptionId));
    const alertIds = await queuePlatformPaymentFailedAlerts({
      platformSubscriptionId: record.platformSubscriptionId,
      stripeEventId: event.id,
      failureMessage: message,
    });
    if (alertIds.length) await sendPendingPlatformBillingAlerts(alertIds.length, alertIds);
  }
  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
    await getDb().update(platformSubscriptions).set({
      paymentFailedAt: null,
      paymentFailureMessage: "",
      updatedAt: new Date(),
    }).where(eq(platformSubscriptions.id, record.platformSubscriptionId));
    await resolvePlatformPaymentFailure(record.platformSubscriptionId);
  }
  if (["invoice.finalized", "invoice.payment_succeeded", "invoice.paid"].includes(event.type)) {
    const { generatePlatformInvoicePdfSafely } = await import("@/services/platform-invoices");
    await generatePlatformInvoicePdfSafely(record.id);
  }
}

export async function processStripeTestEvent(event: Stripe.Event) {
  if (event.livemode) throw new Error("Live-mode Stripe events are rejected by staging.");
  const database = getDb();
  const [reserved] = await database.insert(stripeWebhookEvents).values({
    id: event.id,
    type: event.type,
    livemode: false,
    status: "processing",
  }).onConflictDoNothing().returning({ id: stripeWebhookEvents.id });
  if (!reserved) {
    const [existing] = await database.select({ status: stripeWebhookEvents.status }).from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.id, event.id)).limit(1);
    if (existing?.status === "processed" || existing?.status === "processing") return { duplicate: true };
    await database.update(stripeWebhookEvents).set({ status: "processing", error: "", processedAt: null })
      .where(eq(stripeWebhookEvents.id, event.id));
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await applyCompletedCheckout(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncStripeSubscription(event.data.object.id);
        break;
      case "invoice.finalized":
      case "invoice.payment_failed":
      case "invoice.payment_succeeded":
      case "invoice.paid":
      case "invoice.voided":
      case "invoice.marked_uncollectible":
      case "invoice.updated":
        await applyInvoiceEvent(event, event.data.object);
        break;
      default:
        break;
    }
    const processedAt = new Date();
    await database.update(stripeWebhookEvents).set({ status: "processed", processedAt, error: "" })
      .where(eq(stripeWebhookEvents.id, event.id));
    return { duplicate: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe event processing failed.";
    await database.update(stripeWebhookEvents).set({ status: "failed", processedAt: new Date(), error: message })
      .where(eq(stripeWebhookEvents.id, event.id));
    throw error;
  }
}

export async function recordStripeWebhookAudit(event: Stripe.Event) {
  const object = event.data.object as { metadata?: Record<string, string>; id: string };
  const residencyId = object.metadata?.hfy_residency_id ?? null;
  const planId = object.metadata?.hfy_platform_subscription_id ?? null;
  if (!residencyId || !planId) return;
  await getDb().insert(auditLog).values({
    residencyId,
    actorLabel: "automation:stripe-test-webhook",
    action: "stripe_test_event_processed",
    entityType: "platform_subscription",
    entityId: planId,
    details: { stripeEventId: event.id, stripeEventType: event.type, livemode: false },
  });
}
