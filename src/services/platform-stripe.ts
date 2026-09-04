import "server-only";

import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/db/client";
import {
  attentionItems,
  auditLog,
  platformSubscriptionRevisions,
  platformSubscriptions,
  residencies,
} from "@/db/schema";
import {
  calculatePlatformMonthlyAmountCents,
  platformCadenceChargeCents,
  platformCadenceInterval,
  type PlatformBillingCadence,
} from "@/domain/platform-billing";
import type { AuditActor, InternalActor } from "@/lib/auth";
import { assertCurrentPlatformBillingStaging } from "@/lib/platform-billing-stage";
import { getStripe, stagingBillingReturnUrl } from "@/lib/stripe";

export type CommittedPlanInput = {
  residencyId: string;
  cadence: PlatformBillingCadence;
  talentProgramSessions: number;
  housePrograms: number;
  oneOffAllowance: number;
  unitAmountCents: number;
  startsOn: string;
  renewsOn: string;
  changeReason: string;
};

type CurrentPlan = typeof platformSubscriptions.$inferSelect;

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function planAmount(input: Pick<CommittedPlanInput, "talentProgramSessions" | "housePrograms" | "unitAmountCents" | "cadence">) {
  const monthlyAmountCents = calculatePlatformMonthlyAmountCents({
    talentProgramSessions: input.talentProgramSessions,
    talentSessionUnitAmountCents: input.unitAmountCents,
    housePrograms: input.housePrograms,
    houseProgramUnitAmountCents: input.unitAmountCents,
    unitAmountCents: input.unitAmountCents,
  });
  return {
    monthlyAmountCents,
    cadenceAmountCents: platformCadenceChargeCents(monthlyAmountCents, input.cadence),
  };
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

async function createPlanPrice(plan: CurrentPlan, input: CommittedPlanInput, revision: number, productId: string) {
  const stripe = getStripe();
  const amount = planAmount(input).cadenceAmountCents;
  const recurring = platformCadenceInterval(input.cadence);
  const price = await stripe.prices.create({
    currency: "usd",
    product: productId,
    unit_amount: amount,
    recurring: { interval: recurring.interval, interval_count: recurring.intervalCount },
    nickname: `${input.cadence} committed plan r${revision}`,
    metadata: {
      hfy_residency_id: plan.residencyId,
      hfy_platform_subscription_id: plan.id,
      committed_plan_revision: String(revision),
      environment: "staging-test",
    },
  }, { idempotencyKey: `platform-price/${plan.id}/r${revision}` });
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

async function updateStripeSubscriptionPlan(plan: CurrentPlan, input: CommittedPlanInput, revision: number, productId: string) {
  if (!plan.stripeSubscriptionId) throw new Error("Stripe subscription is not connected.");
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(plan.stripeSubscriptionId);
  if (subscription.livemode) throw new Error("A live-mode Stripe Subscription cannot be used by staging.");
  const item = subscription.items.data[0];
  if (!item) throw new Error("Stripe subscription has no subscription item to update.");
  const price = await createPlanPrice(plan, input, revision, productId);

  if (plan.cadence === input.cadence && !subscription.schedule) {
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
    }, { idempotencyKey: `platform-subscription-update/${plan.id}/r${revision}` });
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

export async function updateCommittedPlan(actor: InternalActor, input: CommittedPlanInput) {
  assertCurrentPlatformBillingStaging();
  const database = getDb();
  const [residency] = await database.select({ id: residencies.id }).from(residencies)
    .where(and(eq(residencies.id, input.residencyId), eq(residencies.operatingMode, "operations"))).limit(1);
  if (!residency) throw new Error("Residency not found.");

  const [current] = await database.select().from(platformSubscriptions)
    .where(eq(platformSubscriptions.residencyId, input.residencyId)).limit(1);
  const now = new Date();
  if (!current) {
    return database.transaction(async (tx) => {
      const [created] = await tx.insert(platformSubscriptions).values({
        residencyId: input.residencyId,
        cadence: input.cadence,
        revision: 1,
        talentProgramSessions: input.talentProgramSessions,
        talentSessionUnitAmountCents: input.unitAmountCents,
        housePrograms: input.housePrograms,
        houseProgramUnitAmountCents: input.unitAmountCents,
        oneOffAllowance: input.oneOffAllowance,
        unitAmountCents: input.unitAmountCents,
        startsOn: input.startsOn,
        renewsOn: input.renewsOn,
        updatedByUserId: actor.userId,
      }).returning();
      await tx.insert(platformSubscriptionRevisions).values({
        platformSubscriptionId: created.id,
        residencyId: created.residencyId,
        revision: 1,
        cadence: input.cadence,
        talentProgramSessions: input.talentProgramSessions,
        housePrograms: input.housePrograms,
        oneOffAllowance: input.oneOffAllowance,
        unitAmountCents: input.unitAmountCents,
        startsOn: input.startsOn,
        renewsOn: input.renewsOn,
        changeReason: input.changeReason,
        changedByUserId: actor.userId,
        stripeSyncStatus: "not_connected",
      });
      await tx.insert(auditLog).values({
        residencyId: input.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "platform_committed_plan_created",
        entityType: "platform_subscription",
        entityId: created.id,
        details: { revision: 1, ...input, billingBehavior: "committed_plan_only_no_usage_autobilling" },
      });
      return created;
    });
  }

  const revision = current.revision + 1;
  const [pendingRevision] = await database.insert(platformSubscriptionRevisions).values({
    platformSubscriptionId: current.id,
    residencyId: current.residencyId,
    revision,
    cadence: input.cadence,
    talentProgramSessions: input.talentProgramSessions,
    housePrograms: input.housePrograms,
    oneOffAllowance: input.oneOffAllowance,
    unitAmountCents: input.unitAmountCents,
    startsOn: input.startsOn,
    renewsOn: input.renewsOn,
    changeReason: input.changeReason,
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
      stripeUpdate = await updateStripeSubscriptionPlan(current, input, revision, productId);
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

  const effectiveRenewsOn = stripeUpdate?.renewsOn ?? input.renewsOn;
  return database.transaction(async (tx) => {
    const [updated] = await tx.update(platformSubscriptions).set({
      cadence: input.cadence,
      revision,
      talentProgramSessions: input.talentProgramSessions,
      talentSessionUnitAmountCents: input.unitAmountCents,
      housePrograms: input.housePrograms,
      houseProgramUnitAmountCents: input.unitAmountCents,
      oneOffAllowance: input.oneOffAllowance,
      unitAmountCents: input.unitAmountCents,
      startsOn: input.startsOn,
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
      residencyId: input.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "platform_committed_plan_updated",
      entityType: "platform_subscription",
      entityId: current.id,
      details: {
        previousRevision: current.revision,
        revision,
        changeReason: input.changeReason,
        stripeSubscriptionId: current.stripeSubscriptionId,
        stripeUpdateMode: current.stripeSubscriptionId ? current.cadence === input.cadence ? "in_place_no_proration" : "same_subscription_scheduled_at_renewal" : "not_connected",
        billingBehavior: "committed_plan_only_no_usage_autobilling",
      },
    });
    return updated;
  });
}

export async function createPlatformSubscriptionCheckout(actor: AuditActor, residencyId: string) {
  assertCurrentPlatformBillingStaging();
  const database = getDb();
  const [row] = await database.select({ plan: platformSubscriptions, residency: {
    name: residencies.name,
    billingContactEmail: residencies.billingContactEmail,
    primaryContactEmail: residencies.primaryContactEmail,
  } }).from(platformSubscriptions)
    .innerJoin(residencies, eq(platformSubscriptions.residencyId, residencies.id))
    .where(eq(platformSubscriptions.residencyId, residencyId)).limit(1);
  if (!row) throw new Error("Create a Committed Plan before connecting Stripe.");
  if (row.plan.stripeSubscriptionId) throw new Error("This Residency already has its continuous Stripe subscription.");
  const { customerId, productId } = await ensureStripeCustomerAndProduct(row.plan, row.residency);
  const amount = planAmount(row.plan).cadenceAmountCents;
  const recurring = platformCadenceInterval(row.plan.cadence);
  const stripe = getStripe();
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
      price_data: {
        currency: "usd",
        product: productId,
        unit_amount: amount,
        recurring: { interval: recurring.interval, interval_count: recurring.intervalCount },
      },
    }],
    metadata: {
      hfy_residency_id: residencyId,
      hfy_platform_subscription_id: row.plan.id,
      committed_plan_revision: String(row.plan.revision),
      environment: "staging-test",
    },
    subscription_data: {
      description: `${row.residency.name} Platform subscription`,
      metadata: {
        hfy_residency_id: residencyId,
        hfy_platform_subscription_id: row.plan.id,
        committed_plan_revision: String(row.plan.revision),
        environment: "staging-test",
      },
      invoice_settings: { issuer: { type: "self" } },
    },
    success_url: stagingBillingReturnUrl(actor.kind === "internal" ? "/app/platform-billing?mode=developer&stripe=success" : "/residency/settings/billing?stripe=success"),
    cancel_url: stagingBillingReturnUrl(actor.kind === "internal" ? "/app/platform-billing?mode=developer&stripe=cancelled" : "/residency/settings/billing?stripe=cancelled"),
  }, { idempotencyKey: `platform-checkout/${row.plan.id}/r${row.plan.revision}` });
  if (session.livemode) throw new Error("Stripe returned a live-mode Checkout Session; staging billing stopped.");
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
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

export async function createPlatformPaymentMethodCheckout(residencyId: string) {
  assertCurrentPlatformBillingStaging();
  const [plan] = await getDb().select().from(platformSubscriptions)
    .where(eq(platformSubscriptions.residencyId, residencyId)).limit(1);
  if (!plan?.stripeCustomerId || !plan.stripeSubscriptionId) throw new Error("This Platform subscription is not connected to Stripe yet.");
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
