import "server-only";

import { and, eq, isNull, lte } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/db/client";
import { accountSetupTokens, auditLog, platformSubscriptionInvoices, platformSubscriptionRevisions, platformSubscriptions, residencies, residencyContacts, residencyMemberships } from "@/db/schema";
import { assertPlatformPlan, calculatePlatformPlanAmounts, platformTermInterval, PLATFORM_SLOT_UNIT_AMOUNT_CENTS, type PlatformSubscriptionTerm } from "@/domain/platform-billing";
import type { ResidencyActor } from "@/lib/auth";
import { assertCurrentPlatformBillingStaging } from "@/lib/platform-billing-stage";
import { getStripe } from "@/lib/stripe";
import { requireResidencyLiveBillingApproval } from "@/services/live-billing-safety";
import { createPlanPrice, nextPlanRevision, scheduleStripePlanAtRenewal } from "@/services/platform-stripe";

type Plan = typeof platformSubscriptions.$inferSelect;
type PlanSelection = { talentBucketSize: number; houseBucketSize: number; term: PlatformSubscriptionTerm };

function requireManager(actor: ResidencyActor) {
  if ((actor.actualAccessRole ?? actor.accessRole) !== "manager") throw new Error("Manager access is required.");
  if (actor.isClientViewAs) throw new Error("Exit View As before making billing changes.");
}

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function periodEnd(subscription: Stripe.Subscription) {
  return subscription.items.data.reduce((latest, item) => Math.max(latest, item.current_period_end), 0);
}

function addBillingPeriods(timestamp: number, term: PlatformSubscriptionTerm, periods: number) {
  const value = new Date(timestamp * 1_000);
  if (term === "annual") value.setUTCFullYear(value.getUTCFullYear() + periods);
  else value.setUTCMonth(value.getUTCMonth() + periods);
  return Math.floor(value.getTime() / 1_000);
}

async function loadConnectedPlan(residencyId: string) {
  const [row] = await getDb().select({ plan: platformSubscriptions, comped: residencies.comped }).from(platformSubscriptions)
    .innerJoin(residencies, eq(platformSubscriptions.residencyId, residencies.id))
    .where(eq(platformSubscriptions.residencyId, residencyId)).limit(1);
  if (!row?.plan.stripeSubscriptionId || !row.plan.stripeProductId) throw new Error("This subscription is not connected to Stripe.");
  if (row.comped) throw new Error("A complimentary plan does not need self-service billing changes.");
  if (row.plan.pendingChangeKind !== "none") throw new Error("A billing change is already scheduled. Cancel that change before scheduling another.");
  return row;
}

async function approvedStripePlan(actor: ResidencyActor, action: string) {
  requireManager(actor);
  assertCurrentPlatformBillingStaging();
  const row = await loadConnectedPlan(actor.residencyId);
  await requireResidencyLiveBillingApproval({
    residencyId: actor.residencyId,
    action: "stripe_subscription_update",
    actor,
    entityType: "platform_subscription",
    entityId: row.plan.id,
    details: { source: action },
  });
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(row.plan.stripeSubscriptionId!);
  if (subscription.livemode) throw new Error("Live-mode Stripe subscriptions are rejected by this test-only billing build.");
  return { ...row, stripe, subscription };
}

function assertDowngrade(current: Plan, selection: PlanSelection) {
  assertPlatformPlan({ ...selection, slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS });
  const capacityReduced = selection.talentBucketSize < current.talentBucketSize || selection.houseBucketSize < current.houseBucketSize;
  const capacityIncreased = selection.talentBucketSize > current.talentBucketSize || selection.houseBucketSize > current.houseBucketSize;
  const termDowngrade = current.term === "annual" && selection.term === "month_to_month";
  if (capacityIncreased) throw new Error("Capacity increases use the immediate upgrade flow and are not part of this downgrade action.");
  if (current.term === "month_to_month" && selection.term === "annual") throw new Error("Use Switch to annual for an immediate annual upgrade.");
  if (!capacityReduced && !termDowngrade) throw new Error("Choose a lower capacity or change annual billing to month-to-month.");
}

function priceData(plan: Plan, selection: PlanSelection, comped: boolean) {
  const amount = calculatePlatformPlanAmounts({ ...selection, slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS }, comped).termChargeAmountCents;
  const recurring = platformTermInterval(selection.term);
  return {
    currency: "usd" as const,
    product: plan.stripeProductId!,
    unit_amount: amount,
    recurring: { interval: recurring.interval, interval_count: recurring.intervalCount },
  };
}

export async function previewResidencyPlanDowngrade(actor: ResidencyActor, selection: PlanSelection) {
  const { plan, comped, stripe, subscription } = await approvedStripePlan(actor, "residency_plan_downgrade_preview");
  assertDowngrade(plan, selection);
  const item = subscription.items.data[0];
  if (!item) throw new Error("Stripe subscription has no item to update.");
  const preview = await stripe.invoices.createPreview({
    subscription: subscription.id,
    subscription_details: {
      items: [{ id: item.id, price_data: priceData(plan, selection, comped), quantity: 1 }],
      billing_cycle_anchor: "unchanged",
      proration_behavior: "none",
    },
  });
  if (preview.livemode || preview.currency.toLowerCase() !== "usd") throw new Error("Stripe returned an invalid plan preview.");
  const effectiveAt = new Date(periodEnd(subscription) * 1_000);
  return {
    effectiveAt: effectiveAt.toISOString(),
    amountDueTodayCents: 0,
    nextStripeInvoiceAmountCents: preview.amount_due,
    current: { term: plan.term, talentBucketSize: plan.talentBucketSize, houseBucketSize: plan.houseBucketSize, ...calculatePlatformPlanAmounts(plan, comped) },
    next: { ...selection, ...calculatePlatformPlanAmounts({ ...selection, slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS }, comped) },
  };
}

export async function scheduleResidencyPlanDowngrade(actor: ResidencyActor, selection: PlanSelection) {
  const { plan, comped, subscription } = await approvedStripePlan(actor, "residency_plan_downgrade_confirm");
  assertDowngrade(plan, selection);
  await previewResidencyPlanDowngrade(actor, selection);
  const revision = await nextPlanRevision(plan);
  const effectiveAtUnix = periodEnd(subscription);
  const effectiveAt = new Date(effectiveAtUnix * 1_000);
  const effectiveDate = effectiveAt.toISOString().slice(0, 10);
  const renewal = new Date(effectiveAt);
  if (selection.term === "annual") renewal.setUTCFullYear(renewal.getUTCFullYear() + 1);
  else renewal.setUTCMonth(renewal.getUTCMonth() + 1);
  const price = await createPlanPrice(plan, selection, revision, plan.stripeProductId!, comped);
  await scheduleStripePlanAtRenewal(subscription, price, revision);
  const [pendingRevision] = await getDb().insert(platformSubscriptionRevisions).values({
    platformSubscriptionId: plan.id,
    residencyId: plan.residencyId,
    revision,
    term: selection.term,
    talentBucketSize: selection.talentBucketSize,
    houseBucketSize: selection.houseBucketSize,
    slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
    startsOn: effectiveDate,
    renewsOn: renewal.toISOString().slice(0, 10),
    changeReason: "Residency manager scheduled a self-service plan downgrade",
    changedByUserId: actor.userId,
    stripeSyncStatus: "pending",
    stripePriceId: price.id,
  }).returning({ id: platformSubscriptionRevisions.id });
  await getDb().transaction(async (tx) => {
    await tx.update(platformSubscriptions).set({
      pendingChangeKind: selection.term !== plan.term ? "term_change" : "downgrade",
      pendingChangeEffectiveAt: effectiveAt,
      pendingRevision: revision,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    }).where(eq(platformSubscriptions.id, plan.id));
    await tx.insert(auditLog).values({
      residencyId: plan.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "platform_plan_downgrade_scheduled",
      entityType: "platform_subscription_revision",
      entityId: pendingRevision.id,
      details: { revision, effectiveAt: effectiveAt.toISOString(), ...selection, stripePriceId: price.id },
    });
  });
  return { effectiveAt: effectiveAt.toISOString() };
}

export async function previewResidencyCancellation(actor: ResidencyActor) {
  const { plan, subscription } = await approvedStripePlan(actor, "residency_subscription_cancellation_preview");
  return { effectiveAt: new Date(periodEnd(subscription) * 1_000).toISOString(), current: calculatePlatformPlanAmounts(plan), amountDueTodayCents: 0 };
}

export async function scheduleResidencyCancellation(actor: ResidencyActor) {
  const { plan, stripe, subscription } = await approvedStripePlan(actor, "residency_subscription_cancellation_confirm");
  const effectiveAt = new Date(periodEnd(subscription) * 1_000);
  await stripe.subscriptions.update(subscription.id, {
    cancel_at_period_end: true,
    proration_behavior: "none",
    cancellation_details: { comment: "Self-service cancellation requested by Residency manager" },
    metadata: { ...subscription.metadata, hfy_pending_change: "cancel", hfy_pending_change_effective_at: effectiveAt.toISOString() },
  });
  await getDb().transaction(async (tx) => {
    await tx.update(platformSubscriptions).set({
      pendingChangeKind: "cancel",
      pendingChangeEffectiveAt: effectiveAt,
      cancelAtPeriodEnd: true,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    }).where(eq(platformSubscriptions.id, plan.id));
    await tx.insert(auditLog).values({
      residencyId: plan.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "platform_subscription_cancellation_scheduled",
      entityType: "platform_subscription",
      entityId: plan.id,
      details: { effectiveAt: effectiveAt.toISOString() },
    });
  });
  return { effectiveAt: effectiveAt.toISOString() };
}

export async function previewResidencyPause(actor: ResidencyActor, periods: 1 | 2 | 3) {
  const { plan, subscription } = await approvedStripePlan(actor, "residency_subscription_pause_preview");
  const effectiveAtUnix = periodEnd(subscription);
  const resumesAtUnix = addBillingPeriods(effectiveAtUnix, plan.term, periods);
  return { periods, effectiveAt: new Date(effectiveAtUnix * 1_000).toISOString(), resumesAt: new Date(resumesAtUnix * 1_000).toISOString(), amountDueTodayCents: 0 };
}

export async function scheduleResidencyPause(actor: ResidencyActor, periods: 1 | 2 | 3) {
  const { plan, stripe, subscription } = await approvedStripePlan(actor, "residency_subscription_pause_confirm");
  const effectiveAtUnix = periodEnd(subscription);
  const resumesAtUnix = addBillingPeriods(effectiveAtUnix, plan.term, periods);
  await stripe.subscriptions.update(subscription.id, {
    pause_collection: { behavior: "void", resumes_at: resumesAtUnix },
    proration_behavior: "none",
    metadata: {
      ...subscription.metadata,
      hfy_pending_change: "pause",
      hfy_pause_effective_at: new Date(effectiveAtUnix * 1_000).toISOString(),
      hfy_pause_resumes_at: new Date(resumesAtUnix * 1_000).toISOString(),
    },
  });
  const effectiveAt = new Date(effectiveAtUnix * 1_000);
  const resumesAt = new Date(resumesAtUnix * 1_000);
  await getDb().transaction(async (tx) => {
    await tx.update(platformSubscriptions).set({
      pendingChangeKind: "pause",
      pendingChangeEffectiveAt: effectiveAt,
      pausePeriods: periods,
      pauseEffectiveAt: effectiveAt,
      pauseResumesAt: resumesAt,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    }).where(eq(platformSubscriptions.id, plan.id));
    await tx.insert(auditLog).values({
      residencyId: plan.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "platform_subscription_pause_scheduled",
      entityType: "platform_subscription",
      entityId: plan.id,
      details: { periods, effectiveAt: effectiveAt.toISOString(), resumesAt: resumesAt.toISOString() },
    });
  });
  return { effectiveAt: effectiveAt.toISOString(), resumesAt: resumesAt.toISOString() };
}

export async function payResidencyInvoiceNow(actor: ResidencyActor, localInvoiceId: string) {
  requireManager(actor);
  assertCurrentPlatformBillingStaging();
  const database = getDb();
  const [record] = await database.select({
    id: platformSubscriptionInvoices.id,
    stripeInvoiceId: platformSubscriptionInvoices.stripeInvoiceId,
    status: platformSubscriptionInvoices.status,
    planId: platformSubscriptions.id,
    stripeSubscriptionId: platformSubscriptions.stripeSubscriptionId,
    stripeCustomerId: platformSubscriptions.stripeCustomerId,
  }).from(platformSubscriptionInvoices)
    .innerJoin(platformSubscriptions, eq(platformSubscriptionInvoices.platformSubscriptionId, platformSubscriptions.id))
    .where(and(
      eq(platformSubscriptionInvoices.id, localInvoiceId),
      eq(platformSubscriptionInvoices.residencyId, actor.residencyId),
      eq(platformSubscriptionInvoices.status, "open"),
    )).limit(1);
  if (!record) throw new Error("This invoice is not outstanding or does not belong to this Residency.");
  await requireResidencyLiveBillingApproval({
    residencyId: actor.residencyId,
    action: "stripe_subscription_update",
    actor,
    entityType: "platform_subscription_invoice",
    entityId: record.id,
    details: { source: "residency_invoice_pay_now" },
  });
  const stripe = getStripe();
  const invoice = await stripe.invoices.retrieve(record.stripeInvoiceId);
  if (invoice.livemode) throw new Error("Live-mode Stripe invoices are rejected by this test-only billing build.");
  if (stripeId(invoice.customer) !== record.stripeCustomerId || stripeId(invoice.parent?.subscription_details?.subscription) !== record.stripeSubscriptionId) {
    throw new Error("Stripe invoice ownership does not match this Residency.");
  }
  if (invoice.status !== "open" || invoice.amount_remaining <= 0) throw new Error("This Stripe invoice is not open for payment.");
  const paid = await stripe.invoices.pay(invoice.id, { off_session: true });
  await database.insert(auditLog).values({
    residencyId: actor.residencyId,
    actorUserId: actor.userId,
    actorLabel: actor.email,
    action: "platform_invoice_manual_payment_attempted",
    entityType: "platform_subscription_invoice",
    entityId: record.id,
    details: { stripeInvoiceId: invoice.id, resultingStatus: paid.status, amountRemainingCents: paid.amount_remaining },
  });
  return { paid: paid.status === "paid", hostedInvoiceUrl: paid.hosted_invoice_url };
}

export async function applyScheduledPlatformLifecycle(now = new Date()) {
  const database = getDb();
  const cancellations = await database.select().from(platformSubscriptions).where(and(
    eq(platformSubscriptions.pendingChangeKind, "cancel"),
    lte(platformSubscriptions.pendingChangeEffectiveAt, now),
  ));
  for (const plan of cancellations) {
    await database.update(platformSubscriptions).set({
      status: "cancelled",
      pendingChangeKind: "none",
      pendingChangeEffectiveAt: null,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    }).where(eq(platformSubscriptions.id, plan.id));
    await revokePendingInvitationsForCancelledResidency(plan.residencyId, now);
  }
  const pauses = await database.select().from(platformSubscriptions).where(and(
    eq(platformSubscriptions.pendingChangeKind, "pause"),
    lte(platformSubscriptions.pauseEffectiveAt, now),
  ));
  for (const plan of pauses) {
    await database.update(platformSubscriptions).set({ status: "paused", pausedAt: plan.pausedAt ?? now, updatedAt: now })
      .where(eq(platformSubscriptions.id, plan.id));
  }
  const resumes = await database.select().from(platformSubscriptions).where(and(
    eq(platformSubscriptions.status, "paused"),
    lte(platformSubscriptions.pauseResumesAt, now),
  ));
  for (const plan of resumes) {
    await database.update(platformSubscriptions).set({
      status: "active",
      pendingChangeKind: "none",
      pendingChangeEffectiveAt: null,
      pausePeriods: null,
      pauseEffectiveAt: null,
      pauseResumesAt: null,
      pausedAt: null,
      updatedAt: now,
    }).where(eq(platformSubscriptions.id, plan.id));
  }
  await database.update(platformSubscriptions).set({ accessRestrictedAt: now, updatedAt: now }).where(and(
    isNull(platformSubscriptions.accessRestrictedAt),
    lte(platformSubscriptions.paymentGraceEndsAt, now),
  ));
  return { cancellations: cancellations.length, pauses: pauses.length, resumes: resumes.length };
}

export async function revokePendingInvitationsForCancelledResidency(residencyId: string, now = new Date()) {
  const database = getDb();
  const pending = await database.select({ id: residencyContacts.id, userId: residencyContacts.userId }).from(residencyContacts).where(and(
    eq(residencyContacts.residencyId, residencyId),
    eq(residencyContacts.active, true),
    eq(residencyContacts.invitationStatus, "invited"),
  ));
  for (const contact of pending) {
    await database.transaction(async (tx) => {
      await tx.update(residencyContacts).set({ active: false, invitationStatus: "revoked", revokedAt: now, updatedAt: now }).where(eq(residencyContacts.id, contact.id));
      if (contact.userId) {
        await tx.update(residencyMemberships).set({ active: false, updatedAt: now }).where(and(eq(residencyMemberships.residencyId, residencyId), eq(residencyMemberships.userId, contact.userId)));
        await tx.update(accountSetupTokens).set({ revokedAt: now }).where(and(eq(accountSetupTokens.userId, contact.userId), isNull(accountSetupTokens.usedAt), isNull(accountSetupTokens.revokedAt)));
      }
      await tx.insert(auditLog).values({ residencyId, actorLabel: "automation:subscription-cancelled", action: "residency_member_invitation_revoked", entityType: "residency_contact", entityId: contact.id, details: { reason: "subscription_cancelled" } });
    });
  }
  return pending.length;
}
