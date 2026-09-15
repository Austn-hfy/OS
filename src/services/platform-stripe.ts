import "server-only";

import { and, eq, gte, lte } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/db/client";
import {
  attentionItems,
  auditLog,
  platformSubscriptionRefunds,
  platformSubscriptionInvoices,
  platformSubscriptionRevisions,
  platformSubscriptions,
  residencies,
} from "@/db/schema";
import {
  assertPlatformPlan,
  calculatePlatformPlanAmounts,
  PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
  platformTermInterval,
  type PlatformSubscriptionTerm,
} from "@/domain/platform-billing";
import {
  assertCompedResidencyConfirmation,
} from "@/domain/comped-residency";
import {
  annualMonthsUsed,
  calculateAnnualCancellationRefund,
} from "@/domain/platform-subscription-refund";
import type { AuditActor, InternalActor } from "@/lib/auth";
import { assertCurrentPlatformBillingStaging } from "@/lib/platform-billing-stage";
import { getStripe, stagingBillingReturnUrl } from "@/lib/stripe";
import { requireResidencyLiveBillingApproval } from "@/services/live-billing-safety";

export type CommittedPlanInput = {
  residencyId: string;
  term: PlatformSubscriptionTerm;
  talentBucketSize: number;
  houseBucketSize: number;
  startsOn: string;
  renewsOn: string;
  changeReason: string;
};

type UpdateCommittedPlanOptions = {
  now?: Date;
  setComped?: boolean;
};

type CurrentPlan = typeof platformSubscriptions.$inferSelect;

async function annualPaymentDuringTerm(platformSubscriptionId: string, startsOn: string, changedAt: Date) {
  const rows = await getDb().select({
    amountPaidCents: platformSubscriptionInvoices.amountPaidCents,
  }).from(platformSubscriptionInvoices)
    .where(and(
      eq(platformSubscriptionInvoices.platformSubscriptionId, platformSubscriptionId),
      eq(platformSubscriptionInvoices.status, "paid"),
      gte(platformSubscriptionInvoices.invoiceDate, startsOn),
      lte(platformSubscriptionInvoices.invoiceDate, changedAt.toISOString().slice(0, 10)),
    ));
  return rows.reduce((total, row) => total + row.amountPaidCents, 0);
}

export async function queueAnnualCancellationRefund(plan: CurrentPlan, changedAt = new Date()) {
  if (plan.term !== "annual") return null;
  const [residency] = await getDb().select({ comped: residencies.comped }).from(residencies)
    .where(eq(residencies.id, plan.residencyId)).limit(1);
  if (!residency || residency.comped) return null;
  const totalAnnualPaymentCents = await annualPaymentDuringTerm(plan.id, plan.startsOn, changedAt);
  const fullMonthlyAmountCents = calculatePlatformPlanAmounts(plan).baseMonthlyAmountCents;
  const calculation = calculateAnnualCancellationRefund({
    totalAnnualPaymentCents,
    fullMonthlyAmountCents,
    monthsUsed: annualMonthsUsed(plan.startsOn, changedAt),
  });
  if (calculation.refundAmountCents <= 0) return null;
  const [created] = await getDb().insert(platformSubscriptionRefunds).values({
    platformSubscriptionId: plan.id,
    residencyId: plan.residencyId,
    sourceRevision: plan.revision,
    changedAt,
    totalAnnualPaymentCents: calculation.totalAnnualPaymentCents,
    fullMonthlyAmountCents: calculation.fullMonthlyAmountCents,
    monthsUsed: calculation.monthsUsed,
    refundAmountCents: calculation.refundAmountCents,
  }).onConflictDoNothing({
    target: [platformSubscriptionRefunds.platformSubscriptionId, platformSubscriptionRefunds.sourceRevision],
  }).returning();
  return created ?? null;
}

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

export function platformPlanAmount(input: Pick<CommittedPlanInput, "talentBucketSize" | "houseBucketSize" | "term">, comped = false) {
  return calculatePlatformPlanAmounts({ ...input, slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS }, comped);
}

function dateFromUnix(value: number) {
  return new Date(value * 1_000).toISOString().slice(0, 10);
}

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): CurrentPlan["status"] {
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

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  return subscription.items.data.reduce((latest, item) => Math.max(latest, item.current_period_end), 0);
}

function subscriptionPeriodStart(subscription: Stripe.Subscription) {
  return subscription.items.data.reduce((earliest, item) => Math.min(earliest, item.current_period_start), Number.MAX_SAFE_INTEGER);
}

async function ensureStripeCustomerAndProduct(plan: CurrentPlan, residency: { name: string; billingContactEmail: string; primaryContactEmail: string }) {
  const stripe = getStripe();
  let customerId = plan.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: residency.name,
      email: residency.billingContactEmail || residency.primaryContactEmail || undefined,
      metadata: {
        hfy_residency_id: plan.residencyId,
        hfy_platform_subscription_id: plan.id,
        environment: "staging-test",
      },
    }, { idempotencyKey: `platform-customer/${plan.id}` });
    if (customer.livemode) throw new Error("Stripe returned a live-mode Customer; staging billing stopped.");
    customerId = customer.id;
  }

  let productId = plan.stripeProductId;
  if (!productId) {
    const product = await stripe.products.create({
      name: `${residency.name} — Platform subscription`,
      description: "Committed Platform plan. Live usage and overages never change this subscription automatically.",
      metadata: {
        hfy_residency_id: plan.residencyId,
        hfy_platform_subscription_id: plan.id,
        environment: "staging-test",
      },
    }, { idempotencyKey: `platform-product/${plan.id}` });
    if (product.livemode) throw new Error("Stripe returned a live-mode Product; staging billing stopped.");
    productId = product.id;
  }

  if (customerId !== plan.stripeCustomerId || productId !== plan.stripeProductId) {
    await getDb().update(platformSubscriptions).set({
      stripeCustomerId: customerId,
      stripeProductId: productId,
      updatedAt: new Date(),
    }).where(eq(platformSubscriptions.id, plan.id));
  }
  return { customerId, productId };
}

async function createPlanPrice(plan: CurrentPlan, input: Pick<CommittedPlanInput, "term" | "talentBucketSize" | "houseBucketSize">, revision: number, productId: string, comped: boolean) {
  const stripe = getStripe();
  const amount = platformPlanAmount(input, comped).termChargeAmountCents;
  const recurring = platformTermInterval(input.term);
  const price = await stripe.prices.create({
    currency: "usd",
    product: productId,
    unit_amount: amount,
    recurring: { interval: recurring.interval, interval_count: recurring.intervalCount },
    nickname: `${input.term} · ${input.talentBucketSize} Talent + ${input.houseBucketSize} House · r${revision}`,
    metadata: {
      hfy_residency_id: plan.residencyId,
      hfy_platform_subscription_id: plan.id,
      committed_plan_revision: String(revision),
      talent_bucket_size: String(input.talentBucketSize),
      house_bucket_size: String(input.houseBucketSize),
      slot_unit_amount_cents: String(PLATFORM_SLOT_UNIT_AMOUNT_CENTS),
      subscription_term: input.term,
      annual_discount_percent: input.term === "annual" ? "25" : "0",
      environment: "staging-test",
    },
  }, { idempotencyKey: `platform-price/${plan.id}/r${revision}/v14` });
  if (price.livemode) throw new Error("Stripe returned a live-mode Price; staging billing stopped.");
  return price;
}

async function scheduleStripePlanAtRenewal(subscription: Stripe.Subscription, price: Stripe.Price, revision: number) {
  const stripe = getStripe();
  const currentItem = subscription.items.data[0];
  if (!currentItem) throw new Error("Stripe subscription has no subscription item to update.");
  const existingScheduleId = stripeId(subscription.schedule);
  const schedule = existingScheduleId
    ? await stripe.subscriptionSchedules.retrieve(existingScheduleId)
    : await stripe.subscriptionSchedules.create(
      { from_subscription: subscription.id },
      { idempotencyKey: `platform-schedule/${subscription.id}` },
    );
  if (schedule.livemode) throw new Error("Stripe returned a live-mode Subscription Schedule; staging billing stopped.");
  const currentStart = schedule.current_phase?.start_date ?? subscriptionPeriodStart(subscription);
  const currentEnd = schedule.current_phase?.end_date ?? currentItem.current_period_end;
  const nextInterval = price.recurring;
  if (!nextInterval) throw new Error("The replacement Stripe Price is not recurring.");

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    proration_behavior: "none",
    phases: [
      {
        start_date: currentStart,
        end_date: currentEnd,
        items: [{ price: currentItem.price.id, quantity: currentItem.quantity ?? 1 }],
        proration_behavior: "none",
      },
      {
        start_date: currentEnd,
        duration: { interval: nextInterval.interval, interval_count: nextInterval.interval_count },
        items: [{ price: price.id, quantity: 1 }],
        proration_behavior: "none",
        metadata: {
          ...subscription.metadata,
          committed_plan_revision: String(revision),
          environment: "staging-test",
        },
      },
    ],
  }, { idempotencyKey: `platform-schedule-update/${subscription.id}/r${revision}` });
}

async function updateStripeSubscriptionPlan(plan: CurrentPlan, input: CommittedPlanInput, revision: number, productId: string, comped: boolean) {
  if (!plan.stripeSubscriptionId) throw new Error("Stripe subscription is not connected.");
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(plan.stripeSubscriptionId);
  if (subscription.livemode) throw new Error("A live-mode Stripe Subscription cannot be used by staging.");
  const item = subscription.items.data[0];
  if (!item) throw new Error("Stripe subscription has no subscription item to update.");
  const price = await createPlanPrice(plan, input, revision, productId, comped);

  if (plan.term === input.term && !subscription.schedule) {
    await stripe.subscriptions.update(subscription.id, {
      items: [{ id: item.id, price: price.id, quantity: 1 }],
      proration_behavior: "none",
      payment_behavior: "pending_if_incomplete",
      metadata: {
        ...subscription.metadata,
        hfy_residency_id: plan.residencyId,
        hfy_platform_subscription_id: plan.id,
        committed_plan_revision: String(revision),
        environment: "staging-test",
      },
    }, { idempotencyKey: `platform-subscription-update/${plan.id}/r${revision}/v14` });
  } else {
    await scheduleStripePlanAtRenewal(subscription, price, revision);
  }

  return {
    stripePriceId: price.id,
    stripeSubscriptionItemId: item.id,
    status: mapStripeSubscriptionStatus(subscription.status),
    nextChargeAt: new Date(subscriptionPeriodEnd(subscription) * 1_000),
    renewsOn: dateFromUnix(subscriptionPeriodEnd(subscription)),
  };
}

export async function updateCommittedPlan(actor: InternalActor, input: CommittedPlanInput, options: UpdateCommittedPlanOptions = {}) {
  assertCurrentPlatformBillingStaging();
  const database = getDb();
  const now = options.now ?? new Date();
  const [residency] = await database.select({
    id: residencies.id,
    comped: residencies.comped,
  }).from(residencies)
    .where(and(eq(residencies.id, input.residencyId), eq(residencies.operatingMode, "operations"))).limit(1);
  if (!residency) throw new Error("Residency not found.");
  const effectiveComped = options.setComped ?? residency.comped;
  assertPlatformPlan({
    term: input.term,
    talentBucketSize: input.talentBucketSize,
    houseBucketSize: input.houseBucketSize,
    slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
  });

  const [current] = await database.select().from(platformSubscriptions)
    .where(eq(platformSubscriptions.residencyId, input.residencyId)).limit(1);
  const planInput = input;

  if (!current) {
    return database.transaction(async (tx) => {
      const [created] = await tx.insert(platformSubscriptions).values({
        residencyId: planInput.residencyId,
        term: planInput.term,
        revision: 1,
        talentBucketSize: planInput.talentBucketSize,
        houseBucketSize: planInput.houseBucketSize,
        slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
        startsOn: planInput.startsOn,
        renewsOn: planInput.renewsOn,
        updatedByUserId: actor.userId,
      }).returning();
      await tx.insert(platformSubscriptionRevisions).values({
        platformSubscriptionId: created.id,
        residencyId: created.residencyId,
        revision: 1,
        term: planInput.term,
        talentBucketSize: planInput.talentBucketSize,
        houseBucketSize: planInput.houseBucketSize,
        slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
        startsOn: planInput.startsOn,
        renewsOn: planInput.renewsOn,
        changeReason: planInput.changeReason,
        changedByUserId: actor.userId,
        stripeSyncStatus: "not_connected",
      });
      if (options.setComped !== undefined && residency.comped !== options.setComped) {
        const [changed] = await tx.update(residencies).set({
          comped: options.setComped,
          updatedAt: now,
        }).where(and(eq(residencies.id, residency.id), eq(residencies.comped, residency.comped))).returning({ id: residencies.id });
        if (!changed) throw new Error("This Residency's comped status changed while the plan was being saved.");
        await tx.insert(auditLog).values({
          residencyId: residency.id,
          actorUserId: actor.userId,
          actorLabel: actor.email,
          action: "residency_comped_status_updated",
          entityType: "residency",
          entityId: residency.id,
          details: { previousComped: residency.comped, comped: options.setComped },
        });
      }
      await tx.insert(auditLog).values({
        residencyId: planInput.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "platform_committed_plan_created",
        entityType: "platform_subscription",
        entityId: created.id,
        details: { revision: 1, ...planInput, billingBehavior: "committed_plan_only_no_usage_autobilling" },
      });
      return created;
    });
  }

  if (current.stripeSubscriptionId) {
    await requireResidencyLiveBillingApproval({
      residencyId: current.residencyId,
      action: "stripe_subscription_update",
      actor,
      entityType: "platform_subscription",
      entityId: current.id,
      details: { nextRevision: current.revision + 1 },
    });
  }

  const revision = current.revision + 1;
  const [pendingRevision] = await database.insert(platformSubscriptionRevisions).values({
    platformSubscriptionId: current.id,
    residencyId: current.residencyId,
    revision,
    term: planInput.term,
    talentBucketSize: planInput.talentBucketSize,
    houseBucketSize: planInput.houseBucketSize,
    slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
    startsOn: planInput.startsOn,
    renewsOn: planInput.renewsOn,
    changeReason: planInput.changeReason,
    changedByUserId: actor.userId,
    stripeSyncStatus: current.stripeSubscriptionId ? "pending" : "not_connected",
  }).returning({ id: platformSubscriptionRevisions.id });

  let stripeUpdate: Awaited<ReturnType<typeof updateStripeSubscriptionPlan>> | null = null;
  try {
    if (current.stripeSubscriptionId) {
      const [contact] = await database.select({
        name: residencies.name,
        billingContactEmail: residencies.billingContactEmail,
        primaryContactEmail: residencies.primaryContactEmail,
      }).from(residencies).where(eq(residencies.id, current.residencyId)).limit(1);
      const { productId } = await ensureStripeCustomerAndProduct(current, contact);
      stripeUpdate = await updateStripeSubscriptionPlan(current, planInput, revision, productId, effectiveComped);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe plan update failed.";
    await database.update(platformSubscriptionRevisions).set({ stripeSyncStatus: "failed", stripeSyncError: message })
      .where(eq(platformSubscriptionRevisions.id, pendingRevision.id));
    await database.insert(attentionItems).values({
      residencyId: current.residencyId,
      entityType: "platform_subscription",
      entityId: current.id,
      code: "platform_plan_sync_failed",
      message: "Committed Plan was not changed because its Stripe test subscription could not be updated.",
      details: { revision, error: message },
    }).onConflictDoUpdate({
      target: [attentionItems.entityType, attentionItems.entityId, attentionItems.code],
      targetWhere: eq(attentionItems.status, "open"),
      set: { message: "Committed Plan was not changed because its Stripe test subscription could not be updated.", details: { revision, error: message } },
    });
    throw error;
  }

  const effectiveRenewsOn = stripeUpdate?.renewsOn ?? planInput.renewsOn;
  return database.transaction(async (tx) => {
    const [updated] = await tx.update(platformSubscriptions).set({
      term: planInput.term,
      revision,
      talentBucketSize: planInput.talentBucketSize,
      houseBucketSize: planInput.houseBucketSize,
      slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
      startsOn: planInput.startsOn,
      renewsOn: effectiveRenewsOn,
      stripeSubscriptionItemId: stripeUpdate?.stripeSubscriptionItemId ?? current.stripeSubscriptionItemId,
      stripePriceId: stripeUpdate?.stripePriceId ?? current.stripePriceId,
      status: stripeUpdate?.status ?? current.status,
      nextChargeAt: stripeUpdate?.nextChargeAt ?? current.nextChargeAt,
      lastStripeSyncedAt: stripeUpdate ? now : current.lastStripeSyncedAt,
      updatedByUserId: actor.userId,
      updatedAt: now,
    }).where(and(eq(platformSubscriptions.id, current.id), eq(platformSubscriptions.revision, current.revision))).returning();
    if (!updated) throw new Error("The Committed Plan changed while this update was in progress. Review it before retrying.");
    if (options.setComped !== undefined && residency.comped !== options.setComped) {
      const [changed] = await tx.update(residencies).set({
        comped: options.setComped,
        updatedAt: now,
      }).where(and(eq(residencies.id, residency.id), eq(residencies.comped, residency.comped))).returning({ id: residencies.id });
      if (!changed) throw new Error("This Residency's comped status changed while the plan was being saved.");
      await tx.insert(auditLog).values({
        residencyId: residency.id,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "residency_comped_status_updated",
        entityType: "residency",
        entityId: residency.id,
        details: { previousComped: residency.comped, comped: options.setComped },
      });
    }
    await tx.update(platformSubscriptionRevisions).set({
      renewsOn: effectiveRenewsOn,
      stripeSyncStatus: stripeUpdate ? "synced" : "not_connected",
      stripePriceId: stripeUpdate?.stripePriceId ?? null,
      stripeSyncError: "",
      syncedAt: stripeUpdate ? now : null,
    }).where(eq(platformSubscriptionRevisions.id, pendingRevision.id));
    await tx.update(attentionItems).set({ status: "resolved", resolvedAt: now })
      .where(and(eq(attentionItems.entityType, "platform_subscription"), eq(attentionItems.entityId, current.id), eq(attentionItems.code, "platform_plan_sync_failed"), eq(attentionItems.status, "open")));
    await tx.insert(auditLog).values({
      residencyId: planInput.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "platform_committed_plan_updated",
      entityType: "platform_subscription",
      entityId: current.id,
      details: {
        previousRevision: current.revision,
        revision,
        changeReason: planInput.changeReason,
        stripeSubscriptionId: current.stripeSubscriptionId,
        term: planInput.term,
        talentBucketSize: planInput.talentBucketSize,
        houseBucketSize: planInput.houseBucketSize,
        slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
        stripeUpdateMode: current.stripeSubscriptionId ? current.term === planInput.term ? "in_place_no_proration" : "same_subscription_scheduled_at_renewal" : "not_connected",
        billingBehavior: "committed_plan_only_no_usage_autobilling",
      },
    });
    return updated;
  });
}

export async function updateResidencyCompedStatus(
  actor: InternalActor,
  input: { residencyId: string; comped: boolean; confirmation: string },
) {
  assertCurrentPlatformBillingStaging();
  const database = getDb();
  const [residency] = await database.select({
    id: residencies.id,
    name: residencies.name,
    comped: residencies.comped,
  }).from(residencies).where(and(
    eq(residencies.id, input.residencyId),
    eq(residencies.operatingMode, "operations"),
  )).limit(1);
  if (!residency) throw new Error("Residency not found.");
  if (residency.comped === input.comped) return { comped: residency.comped };

  assertCompedResidencyConfirmation({
    residencyName: residency.name,
    comped: input.comped,
    confirmation: input.confirmation,
  });

  const [current] = await database.select().from(platformSubscriptions)
    .where(eq(platformSubscriptions.residencyId, residency.id)).limit(1);
  if (current) {
    await updateCommittedPlan(actor, {
      residencyId: residency.id,
      term: current.term,
      talentBucketSize: current.talentBucketSize,
      houseBucketSize: current.houseBucketSize,
      startsOn: current.startsOn,
      renewsOn: current.renewsOn,
      changeReason: input.comped ? "Permanent comp status enabled" : "Permanent comp status removed",
    }, { setComped: input.comped });
    return { comped: input.comped };
  }

  const now = new Date();
  await database.transaction(async (tx) => {
    const [changed] = await tx.update(residencies).set({
      comped: input.comped,
      updatedAt: now,
    }).where(and(eq(residencies.id, residency.id), eq(residencies.comped, residency.comped))).returning({ id: residencies.id });
    if (!changed) throw new Error("This Residency's comped status changed while the update was in progress.");
    await tx.insert(auditLog).values({
      residencyId: residency.id,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "residency_comped_status_updated",
      entityType: "residency",
      entityId: residency.id,
      details: { previousComped: residency.comped, comped: input.comped },
    });
  });
  return { comped: input.comped };
}

export async function createPlatformSubscriptionCheckout(actor: AuditActor, residencyId: string) {
  assertCurrentPlatformBillingStaging();
  const database = getDb();
  const [row] = await database.select({ plan: platformSubscriptions, residency: {
    name: residencies.name,
    comped: residencies.comped,
    billingContactEmail: residencies.billingContactEmail,
    primaryContactEmail: residencies.primaryContactEmail,
  } }).from(platformSubscriptions)
    .innerJoin(residencies, eq(platformSubscriptions.residencyId, residencies.id))
    .where(eq(platformSubscriptions.residencyId, residencyId)).limit(1);
  if (!row) throw new Error("Create a Committed Plan before connecting Stripe.");
  if (row.residency.comped) throw new Error("A comped Residency does not require Stripe Checkout.");
  if (row.plan.stripeSubscriptionId) throw new Error("This Residency already has its continuous Stripe subscription.");
  await requireResidencyLiveBillingApproval({
    residencyId,
    action: "stripe_checkout_session_create",
    actor,
    entityType: "platform_subscription",
    entityId: row.plan.id,
    details: { checkoutMode: "subscription", planRevision: row.plan.revision, includesSubscriptionCreation: true },
  });
  const { customerId, productId } = await ensureStripeCustomerAndProduct(row.plan, row.residency);
  const priceMetadata = {
    hfy_residency_id: residencyId,
    hfy_platform_subscription_id: row.plan.id,
    committed_plan_revision: String(row.plan.revision),
    talent_bucket_size: String(row.plan.talentBucketSize),
    house_bucket_size: String(row.plan.houseBucketSize),
    slot_unit_amount_cents: String(row.plan.slotUnitAmountCents),
    subscription_term: row.plan.term,
    annual_discount_percent: row.plan.term === "annual" ? "25" : "0",
    environment: "staging-test",
  };
  const stripe = getStripe();
  const price = await createPlanPrice(row.plan, row.plan, row.plan.revision, productId, row.residency.comped);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: row.plan.id,
    payment_method_types: ["card"],
    payment_method_collection: "always",
    billing_address_collection: "auto",
    customer_update: { address: "auto", name: "auto" },
    line_items: [{
      quantity: 1,
      price: price.id,
    }],
    metadata: priceMetadata,
    subscription_data: {
      description: `${row.residency.name} Platform subscription`,
      metadata: priceMetadata,
      invoice_settings: { issuer: { type: "self" } },
    },
    success_url: stagingBillingReturnUrl(actor.kind === "internal" ? "/app/platform-billing?mode=developer&stripe=success" : "/residency/settings/billing?stripe=success"),
    cancel_url: stagingBillingReturnUrl(actor.kind === "internal" ? "/app/platform-billing?mode=developer&stripe=cancelled" : "/residency/settings/billing?stripe=cancelled"),
  }, { idempotencyKey: `platform-checkout/${row.plan.id}/r${row.plan.revision}` });
  if (session.livemode) throw new Error("Stripe returned a live-mode Checkout Session; staging billing stopped.");
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  await database.update(platformSubscriptions).set({ stripePriceId: price.id, updatedAt: new Date() })
    .where(eq(platformSubscriptions.id, row.plan.id));
  await database.insert(auditLog).values({
    residencyId,
    actorUserId: actor.userId,
    actorLabel: actor.email,
    action: "platform_stripe_checkout_created",
    entityType: "platform_subscription",
    entityId: row.plan.id,
    details: { stripeCheckoutSessionId: session.id, mode: "test", planRevision: row.plan.revision },
  });
  return session.url;
}

export async function createPlatformPaymentMethodCheckout(actor: AuditActor, residencyId: string) {
  assertCurrentPlatformBillingStaging();
  const [row] = await getDb().select({ plan: platformSubscriptions, comped: residencies.comped }).from(platformSubscriptions)
    .innerJoin(residencies, eq(platformSubscriptions.residencyId, residencies.id))
    .where(eq(platformSubscriptions.residencyId, residencyId)).limit(1);
  if (row?.comped) throw new Error("A comped Residency does not require a payment method.");
  const plan = row?.plan;
  if (!plan?.stripeCustomerId || !plan.stripeSubscriptionId) throw new Error("This Platform subscription is not connected to Stripe yet.");
  await requireResidencyLiveBillingApproval({
    residencyId,
    action: "stripe_checkout_session_create",
    actor,
    entityType: "platform_subscription",
    entityId: plan.id,
    details: { checkoutMode: "setup", purpose: "update_platform_subscription_card" },
  });
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: plan.stripeCustomerId,
    payment_method_types: ["card"],
    metadata: {
      hfy_residency_id: residencyId,
      hfy_platform_subscription_id: plan.id,
      stripe_subscription_id: plan.stripeSubscriptionId,
      purpose: "update_platform_subscription_card",
      environment: "staging-test",
    },
    success_url: stagingBillingReturnUrl("/residency/settings/billing?card=updated"),
    cancel_url: stagingBillingReturnUrl("/residency/settings/billing?card=cancelled"),
  }, { idempotencyKey: `platform-payment-method/${plan.id}/${Date.now()}` });
  if (session.livemode) throw new Error("Stripe returned a live-mode Checkout Session; staging billing stopped.");
  if (!session.url) throw new Error("Stripe did not return a card update URL.");
  return session.url;
}
