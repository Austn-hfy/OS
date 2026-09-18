import "server-only";

import { and, desc, eq, gt, gte, lte } from "drizzle-orm";
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
import { annualSwitchPaymentPath } from "@/domain/platform-annual-switch";
import type { AuditActor, InternalActor, ResidencyActor } from "@/lib/auth";
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
  deferActivationUntilRenewal?: boolean;
};

type CurrentPlan = typeof platformSubscriptions.$inferSelect;

function annualRenewalDate(startsOn: string) {
  const date = new Date(`${startsOn}T12:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export function annualPlanChangeInput(
  current: Pick<CurrentPlan, "residencyId" | "talentBucketSize" | "houseBucketSize" | "startsOn" | "renewsOn">,
  startsAt = new Date(),
): CommittedPlanInput {
  const startsOn = startsAt.toISOString().slice(0, 10);
  return {
    residencyId: current.residencyId,
    term: "annual",
    talentBucketSize: current.talentBucketSize,
    houseBucketSize: current.houseBucketSize,
    startsOn,
    renewsOn: annualRenewalDate(startsOn),
    changeReason: "Residency manager switched to annual billing",
  };
}

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

function annualPreviewPriceData(plan: CurrentPlan, productId: string, comped: boolean) {
  return {
    currency: "usd",
    product: productId,
    recurring: { interval: "year" as const, interval_count: 1 },
    unit_amount: platformPlanAmount({
      term: "annual",
      talentBucketSize: plan.talentBucketSize,
      houseBucketSize: plan.houseBucketSize,
    }, comped).termChargeAmountCents,
  };
}

async function previewConnectedAnnualSwitch(
  plan: CurrentPlan,
  productId: string,
  comped: boolean,
  prorationDate: number,
) {
  if (!plan.stripeSubscriptionId) throw new Error("Stripe subscription is not connected.");
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(plan.stripeSubscriptionId);
  if (subscription.livemode) throw new Error("A live-mode Stripe Subscription cannot be used by staging.");
  const item = subscription.items.data[0];
  if (!item) throw new Error("Stripe subscription has no subscription item to update.");
  const preview = await stripe.invoices.createPreview({
    subscription: subscription.id,
    subscription_details: {
      items: [{
        id: item.id,
        price_data: annualPreviewPriceData(plan, productId, comped),
        quantity: 1,
      }],
      proration_behavior: "always_invoice",
      proration_date: prorationDate,
    },
  });
  if (preview.livemode) throw new Error("Stripe returned a live-mode invoice preview; staging billing stopped.");
  if (preview.currency.toLowerCase() !== "usd") throw new Error("Stripe returned an annual-switch preview in an unexpected currency.");
  return { amountDueCents: preview.amount_due, subscription, item };
}

async function nextPlanRevision(plan: CurrentPlan) {
  const [latest] = await getDb().select({ revision: platformSubscriptionRevisions.revision })
    .from(platformSubscriptionRevisions)
    .where(eq(platformSubscriptionRevisions.platformSubscriptionId, plan.id))
    .orderBy(desc(platformSubscriptionRevisions.revision))
    .limit(1);
  return Math.max(plan.revision, latest?.revision ?? 0) + 1;
}

async function stripePriceHasActiveReferences(priceId: string) {
  const stripe = getStripe();
  const subscriptions = await stripe.subscriptions.list({ price: priceId, status: "all", limit: 1 });
  if (subscriptions.data.length > 0) return true;
  for await (const schedule of stripe.subscriptionSchedules.list({ limit: 100 })) {
    if (!["active", "not_started"].includes(schedule.status)) continue;
    if (schedule.phases.some((phase) => phase.items.some((item) => stripeId(item.price) === priceId))) return true;
  }
  return false;
}

async function retireDeferredAnnualState(
  actor: Pick<AuditActor, "userId" | "email">,
  plan: CurrentPlan,
  subscription: Stripe.Subscription,
) {
  const database = getDb();
  const stripe = getStripe();
  const pending = await database.select().from(platformSubscriptionRevisions).where(and(
    eq(platformSubscriptionRevisions.platformSubscriptionId, plan.id),
    gt(platformSubscriptionRevisions.revision, plan.revision),
    eq(platformSubscriptionRevisions.term, "annual"),
    eq(platformSubscriptionRevisions.stripeSyncStatus, "pending"),
  )).orderBy(desc(platformSubscriptionRevisions.revision));
  const scheduleId = stripeId(subscription.schedule);
  if (scheduleId) {
    const released = await stripe.subscriptionSchedules.release(scheduleId);
    if (released.status !== "released" || stripeId(released.released_subscription) !== subscription.id) {
      throw new Error("Stripe did not confirm release of the deferred annual schedule from this subscription.");
    }
  }
  if (!pending.length) return;

  const reason = "Deferred annual schedule retired in favor of an immediate prorated annual switch.";
  for (const revision of pending) {
    await database.update(platformSubscriptionRevisions).set({
      stripeSyncStatus: "failed",
      stripeSyncError: reason,
      syncedAt: null,
    }).where(eq(platformSubscriptionRevisions.id, revision.id));
    await database.insert(auditLog).values({
      residencyId: plan.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "platform_deferred_annual_revision_retired",
      entityType: "platform_subscription_revision",
      entityId: revision.id,
      details: {
        revision: revision.revision,
        stripeScheduleId: scheduleId,
        stripePriceId: revision.stripePriceId,
        reason,
      },
    });
  }

  for (const priceId of new Set(pending.flatMap((revision) => revision.stripePriceId ? [revision.stripePriceId] : []))) {
    if (!await stripePriceHasActiveReferences(priceId)) await stripe.prices.update(priceId, { active: false });
  }
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

async function applyCommittedPlanUpdate(actor: Pick<AuditActor, "userId" | "email">, input: CommittedPlanInput, options: UpdateCommittedPlanOptions = {}) {
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
  const defersActivation = Boolean(options.deferActivationUntilRenewal && stripeUpdate && current.term !== planInput.term);
  const scheduledStartsOn = defersActivation ? effectiveRenewsOn : planInput.startsOn;
  const scheduledRenewsOn = defersActivation ? annualRenewalDate(effectiveRenewsOn) : effectiveRenewsOn;
  return database.transaction(async (tx) => {
    const activatedPlanValues = defersActivation ? {} : {
      term: planInput.term,
      revision,
      talentBucketSize: planInput.talentBucketSize,
      houseBucketSize: planInput.houseBucketSize,
      slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
      startsOn: planInput.startsOn,
      renewsOn: effectiveRenewsOn,
      stripePriceId: stripeUpdate?.stripePriceId ?? current.stripePriceId,
    };
    const [updated] = await tx.update(platformSubscriptions).set({
      ...activatedPlanValues,
      stripeSubscriptionItemId: stripeUpdate?.stripeSubscriptionItemId ?? current.stripeSubscriptionItemId,
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
      startsOn: scheduledStartsOn,
      renewsOn: scheduledRenewsOn,
      stripeSyncStatus: stripeUpdate && !defersActivation ? "synced" : stripeUpdate ? "pending" : "not_connected",
      stripePriceId: stripeUpdate?.stripePriceId ?? null,
      stripeSyncError: "",
      syncedAt: stripeUpdate && !defersActivation ? now : null,
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
        effectiveAt: defersActivation ? scheduledStartsOn : planInput.startsOn,
        billingBehavior: "committed_plan_only_no_usage_autobilling",
      },
    });
    return updated;
  });
}

export async function updateCommittedPlan(actor: InternalActor, input: CommittedPlanInput, options: UpdateCommittedPlanOptions = {}) {
  return applyCommittedPlanUpdate(actor, input, options);
}

function assertRecentProrationDate(value: number | null) {
  const now = Math.floor(Date.now() / 1_000);
  if (!value || !Number.isInteger(value) || value < now - 30 * 60 || value > now + 60) {
    throw new Error("The Stripe charge preview expired. Reopen the confirmation to refresh the exact amount.");
  }
  return value;
}

async function residencyAnnualSwitchPlan(residencyId: string) {
  const [row] = await getDb().select({
    plan: platformSubscriptions,
    residency: {
      name: residencies.name,
      comped: residencies.comped,
      billingContactEmail: residencies.billingContactEmail,
      primaryContactEmail: residencies.primaryContactEmail,
    },
  }).from(platformSubscriptions)
    .innerJoin(residencies, eq(platformSubscriptions.residencyId, residencies.id))
    .where(eq(platformSubscriptions.residencyId, residencyId))
    .limit(1);
  if (!row) throw new Error("Your Platform subscription is not ready yet.");
  return row;
}

export async function previewResidencyAnnualSwitch(actor: ResidencyActor) {
  if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
  assertCurrentPlatformBillingStaging();
  const { plan, residency } = await residencyAnnualSwitchPlan(actor.residencyId);
  if (plan.term === "annual") return { kind: "already_annual" as const };

  const paymentPath = annualSwitchPaymentPath(plan);
  if (!plan.stripeSubscriptionId) {
    return {
      kind: "preview" as const,
      paymentPath,
      amountDueCents: platformPlanAmount({ ...plan, term: "annual" }, residency.comped).termChargeAmountCents,
      prorationDate: null,
    };
  }
  await requireResidencyLiveBillingApproval({
    residencyId: plan.residencyId,
    action: "stripe_subscription_update",
    actor,
    entityType: "platform_subscription",
    entityId: plan.id,
    details: { source: "annual_switch_proration_preview" },
  });
  const { productId } = await ensureStripeCustomerAndProduct(plan, residency);
  const prorationDate = Math.floor(Date.now() / 1_000);
  const preview = await previewConnectedAnnualSwitch(plan, productId, residency.comped, prorationDate);
  return { kind: "preview" as const, paymentPath, amountDueCents: preview.amountDueCents, prorationDate };
}

export async function switchResidencyCommittedPlanToAnnualImmediately(
  actor: Pick<AuditActor, "userId" | "email"> & { residencyId: string },
  prorationDate: number,
) {
  assertCurrentPlatformBillingStaging();
  const database = getDb();
  const { plan: current, residency } = await residencyAnnualSwitchPlan(actor.residencyId);
  if (current.term === "annual") return {
    plan: current,
    amountChargedCents: 0,
    invoiceId: null,
  };
  if (!current.stripeSubscriptionId) throw new Error("Add a card through Checkout to complete the annual switch.");
  await requireResidencyLiveBillingApproval({
    residencyId: current.residencyId,
    action: "stripe_subscription_update",
    actor,
    entityType: "platform_subscription",
    entityId: current.id,
    details: { source: "immediate_annual_switch", prorationDate },
  });
  const { productId } = await ensureStripeCustomerAndProduct(current, residency);
  const preview = await previewConnectedAnnualSwitch(current, productId, residency.comped, prorationDate);
  await retireDeferredAnnualState(actor, current, preview.subscription);
  const revision = await nextPlanRevision(current);
  const planInput = annualPlanChangeInput(current, new Date(prorationDate * 1_000));
  const [pendingRevision] = await database.insert(platformSubscriptionRevisions).values({
    platformSubscriptionId: current.id,
    residencyId: current.residencyId,
    revision,
    term: "annual",
    talentBucketSize: current.talentBucketSize,
    houseBucketSize: current.houseBucketSize,
    slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
    startsOn: planInput.startsOn,
    renewsOn: planInput.renewsOn,
    changeReason: planInput.changeReason,
    changedByUserId: actor.userId,
    stripeSyncStatus: "pending",
  }).returning({ id: platformSubscriptionRevisions.id });

  const stripe = getStripe();
  let price: Stripe.Price | null = null;
  let updatedSubscription: Stripe.Subscription;
  try {
    price = await createPlanPrice(current, planInput, revision, productId, residency.comped);
    await database.update(platformSubscriptionRevisions).set({ stripePriceId: price.id })
      .where(eq(platformSubscriptionRevisions.id, pendingRevision.id));
    updatedSubscription = await stripe.subscriptions.update(preview.subscription.id, {
      items: [{ id: preview.item.id, price: price.id, quantity: 1 }],
      proration_behavior: "always_invoice",
      proration_date: prorationDate,
      payment_behavior: "error_if_incomplete",
      off_session: true,
      metadata: {
        ...preview.subscription.metadata,
        hfy_residency_id: current.residencyId,
        hfy_platform_subscription_id: current.id,
        committed_plan_revision: String(revision),
        annual_switch: "true",
        environment: "staging-test",
      },
      expand: ["latest_invoice"],
    }, { idempotencyKey: `platform-immediate-annual/${current.id}/r${revision}/${prorationDate}` });
    const updatedItem = updatedSubscription.items.data.find((item) => item.id === preview.item.id);
    if (updatedItem?.price.id !== price.id || updatedSubscription.pending_update) {
      throw new Error("Stripe did not confirm the immediate annual Price update.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe annual plan update failed.";
    await database.update(platformSubscriptionRevisions).set({ stripeSyncStatus: "failed", stripeSyncError: message })
      .where(eq(platformSubscriptionRevisions.id, pendingRevision.id));
    await database.insert(attentionItems).values({
      residencyId: current.residencyId,
      entityType: "platform_subscription",
      entityId: current.id,
      code: "platform_plan_sync_failed",
      message: "The annual switch was not activated because Stripe could not complete the immediate charge.",
      details: { revision, prorationDate, error: message },
    }).onConflictDoUpdate({
      target: [attentionItems.entityType, attentionItems.entityId, attentionItems.code],
      targetWhere: eq(attentionItems.status, "open"),
      set: { message: "The annual switch was not activated because Stripe could not complete the immediate charge.", details: { revision, prorationDate, error: message } },
    });
    throw error;
  }

  const now = new Date();
  const startsOn = dateFromUnix(subscriptionPeriodStart(updatedSubscription));
  const renewsOn = dateFromUnix(subscriptionPeriodEnd(updatedSubscription));
  const activated = await database.transaction(async (tx) => {
    const [updated] = await tx.update(platformSubscriptions).set({
      term: "annual",
      revision,
      startsOn,
      renewsOn,
      stripePriceId: price.id,
      stripeSubscriptionItemId: preview.item.id,
      status: mapStripeSubscriptionStatus(updatedSubscription.status),
      nextChargeAt: new Date(subscriptionPeriodEnd(updatedSubscription) * 1_000),
      lastStripeSyncedAt: now,
      updatedByUserId: actor.userId,
      updatedAt: now,
    }).where(and(eq(platformSubscriptions.id, current.id), eq(platformSubscriptions.revision, current.revision))).returning();
    if (!updated) throw new Error("The Committed Plan changed while Stripe was applying the annual switch. HFY support has been alerted.");
    await tx.update(platformSubscriptionRevisions).set({
      startsOn,
      renewsOn,
      stripeSyncStatus: "synced",
      stripeSyncError: "",
      stripePriceId: price.id,
      syncedAt: now,
    }).where(eq(platformSubscriptionRevisions.id, pendingRevision.id));
    await tx.update(attentionItems).set({ status: "resolved", resolvedAt: now })
      .where(and(eq(attentionItems.entityType, "platform_subscription"), eq(attentionItems.entityId, current.id), eq(attentionItems.code, "platform_plan_sync_failed"), eq(attentionItems.status, "open")));
    await tx.insert(auditLog).values({
      residencyId: current.residencyId,
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
        term: "annual",
        talentBucketSize: current.talentBucketSize,
        houseBucketSize: current.houseBucketSize,
        slotUnitAmountCents: PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
        stripeUpdateMode: "immediate_proration_always_invoice",
        prorationDate,
        previewedAmountDueCents: preview.amountDueCents,
        effectiveAt: startsOn,
      },
    });
    return updated;
  });

  const latestInvoice = updatedSubscription.latest_invoice;
  let invoice: Stripe.Invoice | null = typeof latestInvoice === "string"
    ? await stripe.invoices.retrieve(latestInvoice)
    : latestInvoice;
  if (invoice && "deleted" in invoice && invoice.deleted) invoice = null;
  if (!invoice) {
    const invoices = await stripe.invoices.list({ subscription: updatedSubscription.id, limit: 1 });
    invoice = invoices.data[0] ?? null;
  }
  if (invoice) {
    const { syncStripeInvoice } = await import("@/services/platform-stripe-webhooks");
    await syncStripeInvoice(invoice);
  }
  return {
    plan: activated,
    amountChargedCents: invoice?.amount_due ?? preview.amountDueCents,
    invoiceId: invoice?.id ?? null,
  };
}

export async function beginResidencyAnnualSwitch(actor: ResidencyActor, prorationDate: number | null) {
  if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
  const { plan: current } = await residencyAnnualSwitchPlan(actor.residencyId);
  if (current.term === "annual") return { kind: "already_annual" as const };

  const paymentPath = annualSwitchPaymentPath(current);
  if (paymentPath === "collect_card_and_start_annual") {
    const url = await createPlatformSubscriptionCheckout(actor, actor.residencyId, { term: "annual", annualSwitch: true });
    return { kind: "checkout" as const, url, paymentPath };
  }
  const exactProrationDate = assertRecentProrationDate(prorationDate);
  if (paymentPath === "collect_card_then_charge_immediately") {
    const url = await createPlatformPaymentMethodCheckout(actor, actor.residencyId, { annualSwitch: true, prorationDate: exactProrationDate });
    return { kind: "checkout" as const, url, paymentPath };
  }

  const result = await switchResidencyCommittedPlanToAnnualImmediately(actor, exactProrationDate);
  return {
    kind: "activated" as const,
    amountChargedCents: result.amountChargedCents,
    invoiceId: result.invoiceId,
  };
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

export async function createPlatformSubscriptionCheckout(
  actor: AuditActor,
  residencyId: string,
  options: { term?: PlatformSubscriptionTerm; annualSwitch?: boolean } = {},
) {
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
  const checkoutTerm = options.term ?? row.plan.term;
  const checkoutRevision = checkoutTerm === row.plan.term ? row.plan.revision : row.plan.revision + 1;
  const checkoutPlan = { ...row.plan, term: checkoutTerm };
  await requireResidencyLiveBillingApproval({
    residencyId,
    action: "stripe_checkout_session_create",
    actor,
    entityType: "platform_subscription",
    entityId: row.plan.id,
    details: { checkoutMode: "subscription", planRevision: checkoutRevision, includesSubscriptionCreation: true, annualSwitch: Boolean(options.annualSwitch) },
  });
  const { customerId, productId } = await ensureStripeCustomerAndProduct(row.plan, row.residency);
  const priceMetadata = {
    hfy_residency_id: residencyId,
    hfy_platform_subscription_id: row.plan.id,
    committed_plan_revision: String(checkoutRevision),
    talent_bucket_size: String(row.plan.talentBucketSize),
    house_bucket_size: String(row.plan.houseBucketSize),
    slot_unit_amount_cents: String(row.plan.slotUnitAmountCents),
    subscription_term: checkoutTerm,
    annual_discount_percent: checkoutTerm === "annual" ? "25" : "0",
    annual_switch: options.annualSwitch ? "true" : "false",
    changed_by_user_id: actor.userId,
    changed_by_email: actor.email,
    environment: "staging-test",
  };
  const stripe = getStripe();
  const price = await createPlanPrice(row.plan, checkoutPlan, checkoutRevision, productId, row.residency.comped);
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
    success_url: stagingBillingReturnUrl(options.annualSwitch
      ? "/residency/settings/billing?annualSwitch=checkout-complete"
      : actor.kind === "internal" ? "/app/platform-billing?mode=developer&stripe=success" : "/residency/settings/billing?stripe=success"),
    cancel_url: stagingBillingReturnUrl(options.annualSwitch
      ? "/residency/settings/billing?annualSwitch=cancelled"
      : actor.kind === "internal" ? "/app/platform-billing?mode=developer&stripe=cancelled" : "/residency/settings/billing?stripe=cancelled"),
  }, { idempotencyKey: `platform-checkout/${row.plan.id}/r${checkoutRevision}` });
  if (session.livemode) throw new Error("Stripe returned a live-mode Checkout Session; staging billing stopped.");
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  if (checkoutRevision === row.plan.revision) {
    await database.update(platformSubscriptions).set({ stripePriceId: price.id, updatedAt: new Date() })
      .where(eq(platformSubscriptions.id, row.plan.id));
  }
  await database.insert(auditLog).values({
    residencyId,
    actorUserId: actor.userId,
    actorLabel: actor.email,
    action: "platform_stripe_checkout_created",
    entityType: "platform_subscription",
    entityId: row.plan.id,
    details: { stripeCheckoutSessionId: session.id, mode: "test", planRevision: checkoutRevision, annualSwitch: Boolean(options.annualSwitch) },
  });
  return session.url;
}

export async function createPlatformPaymentMethodCheckout(
  actor: AuditActor,
  residencyId: string,
  options: { annualSwitch?: boolean; prorationDate?: number } = {},
) {
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
    details: { checkoutMode: "setup", purpose: options.annualSwitch ? "update_card_and_switch_annual" : "update_platform_subscription_card" },
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
      purpose: options.annualSwitch ? "update_card_and_switch_annual" : "update_platform_subscription_card",
      annual_switch_proration_date: options.prorationDate ? String(options.prorationDate) : "",
      changed_by_user_id: actor.userId,
      changed_by_email: actor.email,
      environment: "staging-test",
    },
    success_url: stagingBillingReturnUrl(options.annualSwitch ? "/residency/settings/billing?annualSwitch=card-added" : "/residency/settings/billing?card=updated"),
    cancel_url: stagingBillingReturnUrl(options.annualSwitch ? "/residency/settings/billing?annualSwitch=cancelled" : "/residency/settings/billing?card=cancelled"),
  }, { idempotencyKey: `platform-payment-method/${plan.id}/${Date.now()}` });
  if (session.livemode) throw new Error("Stripe returned a live-mode Checkout Session; staging billing stopped.");
  if (!session.url) throw new Error("Stripe did not return a card update URL.");
  return session.url;
}
