import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, platformSubscriptionInvoices, platformSubscriptionRevisions, platformSubscriptions } from "@/db/schema";
import { LiveBillingNotApprovedError } from "@/domain/live-billing";
import type { InternalActor } from "@/lib/auth";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getStripe: vi.fn(),
  requireResidencyLiveBillingApproval: vi.fn(),
  stagingBillingReturnUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/stripe", () => ({
  getStripe: mocks.getStripe,
  stagingBillingReturnUrl: mocks.stagingBillingReturnUrl,
}));
vi.mock("@/services/live-billing-safety", () => ({
  requireResidencyLiveBillingApproval: mocks.requireResidencyLiveBillingApproval,
}));

import {
  annualPlanChangeInput,
  beginResidencyAnnualSwitch,
  createPlatformSubscriptionCheckout,
  platformPlanAmount,
  previewResidencyAnnualSwitch,
  switchResidencyCommittedPlanToAnnualImmediately,
  updateCommittedPlan,
  type CommittedPlanInput,
} from "./platform-stripe";

const residencyId = "00000000-0000-4000-8000-000000000001";
const subscriptionId = "00000000-0000-4000-8000-000000000002";
const actor: InternalActor = {
  kind: "internal",
  userId: "00000000-0000-4000-8000-000000000003",
  email: "owner@example.test",
  displayName: "Owner",
};
const planInput: CommittedPlanInput = {
  residencyId,
  term: "month_to_month",
  talentBucketSize: 20,
  houseBucketSize: 10,
  startsOn: "2026-09-01",
  renewsOn: "2026-10-01",
  changeReason: "Production plan setup",
};

function databaseWithSelectResults(results: unknown[][]) {
  const queued = [...results];
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => {
        const take = async () => queued.shift() ?? [];
        const chain = {
          innerJoin: vi.fn(() => chain),
          where: vi.fn(() => chain),
          orderBy: vi.fn(() => chain),
          limit: vi.fn(take),
          then(resolve: (value: unknown[]) => unknown) { return take().then(resolve); },
        };
        return chain;
      }),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_TARGET_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hfy.app");
  mocks.stagingBillingReturnUrl.mockImplementation((path: string) => new URL(path, "https://hfy.app").toString());
});

describe("platform Stripe amount", () => {
  it("uses the complete bucket-derived charge for monthly and annual Prices", () => {
    expect(platformPlanAmount({ talentBucketSize: 10, houseBucketSize: 5, term: "month_to_month" }).termChargeAmountCents).toBe(45_000);
    expect(platformPlanAmount({ talentBucketSize: 60, houseBucketSize: 15, term: "annual" }).termChargeAmountCents).toBe(2_025_000);
  });

  it("uses a zero-dollar Price for a comped overlay without changing bucket inputs", () => {
    const plan = { talentBucketSize: 20, houseBucketSize: 10, term: "annual" as const };
    expect(platformPlanAmount(plan, true)).toMatchObject({
      baseMonthlyAmountCents: 0,
      annualDiscountCents: 0,
      termChargeAmountCents: 0,
    });
    expect(plan).toEqual({ talentBucketSize: 20, houseBucketSize: 10, term: "annual" });
  });
});

describe("Residency annual plan switching", () => {
  it("preserves capacities and starts the annual term immediately", () => {
    expect(annualPlanChangeInput({
      residencyId,
      talentBucketSize: 40,
      houseBucketSize: 15,
      startsOn: "2026-09-01",
      renewsOn: "2026-10-01",
    }, new Date("2026-09-17T18:00:00Z"))).toEqual({
      residencyId,
      term: "annual",
      talentBucketSize: 40,
      houseBucketSize: 15,
      startsOn: "2026-09-17",
      renewsOn: "2027-09-17",
      changeReason: "Residency manager switched to annual billing",
    });
  });

  it("uses Stripe's invoice preview as the exact immediate confirmation amount", async () => {
    const current = {
      id: subscriptionId,
      residencyId,
      revision: 3,
      term: "month_to_month" as const,
      talentBucketSize: 20,
      houseBucketSize: 10,
      slotUnitAmountCents: 3_000,
      startsOn: "2026-09-01",
      renewsOn: "2026-10-01",
      stripeCustomerId: "cus_test",
      stripeProductId: "prod_test",
      stripeSubscriptionId: "sub_test",
      stripeSubscriptionItemId: "si_test",
      stripePriceId: "price_monthly",
      status: "active" as const,
      cardBrand: "visa",
      cardLast4: "4242",
      nextChargeAt: new Date("2026-10-01T00:00:00Z"),
      lastStripeSyncedAt: new Date("2026-09-01T00:00:00Z"),
    };
    const residency = { name: "Test Hotel", comped: false, billingContactEmail: "billing@example.test", primaryContactEmail: "manager@example.test" };
    const database = databaseWithSelectResults([[{ plan: current, residency }]]);
    const createPreview = vi.fn().mockResolvedValue({ id: "upcoming_in", livemode: false, currency: "usd", amount_due: 742_315 });
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_test",
      livemode: false,
      status: "active",
      schedule: null,
      metadata: { committed_plan_revision: "3" },
      items: { data: [{ id: "si_test", price: { id: "price_monthly" }, quantity: 1, current_period_start: 1_789_000_000, current_period_end: 1_791_592_000 }] },
    });
    mocks.getDb.mockReturnValue(database);
    mocks.requireResidencyLiveBillingApproval.mockResolvedValue({ id: residencyId, name: "Test Hotel", liveBillingApproved: true });
    mocks.getStripe.mockReturnValue({
      subscriptions: { retrieve },
      invoices: { createPreview },
    });

    await expect(previewResidencyAnnualSwitch({ ...actor, kind: "residency", residencyId, accessRole: "manager" } as never))
      .resolves.toMatchObject({ kind: "preview", paymentPath: "charge_card_immediately", amountDueCents: 742_315 });

    expect(createPreview).toHaveBeenCalledWith(expect.objectContaining({
      subscription: "sub_test",
      subscription_details: expect.objectContaining({
        proration_behavior: "always_invoice",
        proration_date: expect.any(Number),
        items: [expect.objectContaining({ id: "si_test", price_data: expect.objectContaining({ unit_amount: 810_000, recurring: { interval: "year", interval_count: 1 } }) })],
      }),
    }));
    expect(createPreview.mock.calls[0]?.[0].subscription_details).not.toHaveProperty("billing_cycle_anchor");
  });

  it("updates the existing Stripe subscription immediately with the preview timestamp before activating locally", async () => {
    const current = {
      id: subscriptionId, residencyId, revision: 3, term: "month_to_month" as const,
      talentBucketSize: 20, houseBucketSize: 10, slotUnitAmountCents: 3_000,
      startsOn: "2026-09-01", renewsOn: "2026-10-01", stripeCustomerId: "cus_test",
      stripeProductId: "prod_test", stripeSubscriptionId: "sub_test", stripeSubscriptionItemId: "si_test",
      stripePriceId: "price_monthly", status: "active" as const, cardBrand: "visa", cardLast4: "4242",
      nextChargeAt: new Date("2026-10-01T00:00:00Z"), lastStripeSyncedAt: new Date("2026-09-01T00:00:00Z"),
    };
    const residency = { name: "Test Hotel", comped: false, billingContactEmail: "billing@example.test", primaryContactEmail: "manager@example.test" };
    const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const database = databaseWithSelectResults([
      [{ plan: current, residency }],
      [],
      [{ revision: 3 }],
      [{ ...current, term: "annual", revision: 4, stripePriceId: "price_annual" }],
    ]);
    const updateBuilder = (table: unknown) => ({
      set(values: Record<string, unknown>) {
        updates.push({ table, values });
        const query = {
          where: vi.fn(() => query),
          returning: vi.fn(async () => table === platformSubscriptions ? [{ ...current, ...values }] : []),
          then(resolve: (value: unknown[]) => unknown) { return Promise.resolve([]).then(resolve); },
        };
        return query;
      },
    });
    const insertBuilder = (table: unknown) => ({
      values(values: Record<string, unknown>) {
        inserts.push({ table, values });
        const query = {
          returning: vi.fn(async () => table === platformSubscriptionRevisions
            ? [{ id: "00000000-0000-4000-8000-000000000004" }]
            : table === platformSubscriptionInvoices
              ? [{ id: "00000000-0000-4000-8000-000000000005", ...values }]
              : []),
          onConflictDoUpdate: vi.fn(() => query),
          then(resolve: (value: unknown[]) => unknown) { return Promise.resolve([]).then(resolve); },
        };
        return query;
      },
    });
    const tx = { update: vi.fn(updateBuilder), insert: vi.fn(insertBuilder) };
    Object.assign(database, {
      update: vi.fn(updateBuilder),
      insert: vi.fn(insertBuilder),
      transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    });
    const prorationDate = 1_790_000_000;
    const monthlySubscription = {
      id: "sub_test", livemode: false, status: "active", schedule: null, pending_update: null,
      metadata: { committed_plan_revision: "3" },
      items: { data: [{ id: "si_test", price: { id: "price_monthly" }, quantity: 1, current_period_start: 1_789_000_000, current_period_end: 1_791_592_000 }] },
    };
    const annualSubscription = {
      ...monthlySubscription,
      latest_invoice: {
        id: "in_proration", livemode: false, currency: "usd", amount_due: 742_315, amount_paid: 742_315,
        status: "paid", number: "PRORATION-1", period_start: prorationDate, period_end: 1_821_536_000,
        created: prorationDate, hosted_invoice_url: "https://invoice.stripe.test/in_proration", invoice_pdf: null,
        parent: { subscription_details: { subscription: "sub_test", metadata: { committed_plan_revision: "4" } } },
      },
      metadata: { committed_plan_revision: "4" },
      items: { data: [{ id: "si_test", price: { id: "price_annual" }, quantity: 1, current_period_start: prorationDate, current_period_end: 1_821_536_000 }] },
    };
    const subscriptionUpdate = vi.fn().mockResolvedValue(annualSubscription);
    mocks.getDb.mockReturnValue(database);
    mocks.requireResidencyLiveBillingApproval.mockResolvedValue({ id: residencyId, name: "Test Hotel", liveBillingApproved: true });
    mocks.getStripe.mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(monthlySubscription), update: subscriptionUpdate },
      invoices: { createPreview: vi.fn().mockResolvedValue({ id: "upcoming_in", livemode: false, currency: "usd", amount_due: 742_315 }) },
      prices: { create: vi.fn().mockResolvedValue({ id: "price_annual", livemode: false, recurring: { interval: "year", interval_count: 1 } }) },
    });

    await expect(switchResidencyCommittedPlanToAnnualImmediately({ residencyId, userId: actor.userId, email: actor.email }, prorationDate))
      .resolves.toMatchObject({ amountChargedCents: 742_315, invoiceId: "in_proration" });

    expect(subscriptionUpdate).toHaveBeenCalledWith("sub_test", expect.objectContaining({
      items: [{ id: "si_test", price: "price_annual", quantity: 1 }],
      proration_behavior: "always_invoice",
      proration_date: prorationDate,
      payment_behavior: "error_if_incomplete",
      off_session: true,
    }), expect.anything());
    expect(subscriptionUpdate.mock.calls[0]?.[1]).not.toHaveProperty("billing_cycle_anchor");
    const localActivation = updates.find((entry) => entry.table === platformSubscriptions)?.values;
    expect(localActivation).toMatchObject({ term: "annual", revision: 4, stripePriceId: "price_annual" });
    expect(updates.filter((entry) => entry.table === platformSubscriptions)).toHaveLength(1);
    expect(inserts.find((entry) => entry.table === platformSubscriptionInvoices)?.values).toMatchObject({
      stripeInvoiceId: "in_proration",
      amountDueCents: 742_315,
      amountPaidCents: 742_315,
      status: "paid",
      planRevision: 4,
    });
  });

  it("leaves the local plan month-to-month when Stripe cannot complete the immediate charge", async () => {
    const current = {
      id: subscriptionId, residencyId, revision: 3, term: "month_to_month" as const,
      talentBucketSize: 20, houseBucketSize: 10, slotUnitAmountCents: 3_000,
      startsOn: "2026-09-01", renewsOn: "2026-10-01", stripeCustomerId: "cus_test",
      stripeProductId: "prod_test", stripeSubscriptionId: "sub_test", stripeSubscriptionItemId: "si_test",
      stripePriceId: "price_monthly", status: "active" as const, cardBrand: "visa", cardLast4: "4242",
    };
    const residency = { name: "Test Hotel", comped: false, billingContactEmail: "billing@example.test", primaryContactEmail: "manager@example.test" };
    const database = databaseWithSelectResults([[{ plan: current, residency }], [], [{ revision: 3 }]]);
    const updatedTables: unknown[] = [];
    Object.assign(database, {
      update: vi.fn((table: unknown) => ({
        set: vi.fn(() => {
          updatedTables.push(table);
          const query = { where: vi.fn(() => query), then(resolve: (value: unknown[]) => unknown) { return Promise.resolve([]).then(resolve); } };
          return query;
        }),
      })),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn(() => {
          const query = {
            returning: vi.fn(async () => table === platformSubscriptionRevisions ? [{ id: "00000000-0000-4000-8000-000000000004" }] : []),
            onConflictDoUpdate: vi.fn(() => query),
            then(resolve: (value: unknown[]) => unknown) { return Promise.resolve([]).then(resolve); },
          };
          return query;
        }),
      })),
    });
    const subscription = {
      id: "sub_test", livemode: false, status: "active", schedule: null,
      metadata: { committed_plan_revision: "3" },
      items: { data: [{ id: "si_test", price: { id: "price_monthly" }, quantity: 1, current_period_start: 1_789_000_000, current_period_end: 1_791_592_000 }] },
    };
    mocks.getDb.mockReturnValue(database);
    mocks.requireResidencyLiveBillingApproval.mockResolvedValue({ id: residencyId, name: "Test Hotel", liveBillingApproved: true });
    mocks.getStripe.mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue(subscription),
        update: vi.fn().mockRejectedValue(new Error("Your card was declined.")),
      },
      invoices: { createPreview: vi.fn().mockResolvedValue({ livemode: false, currency: "usd", amount_due: 742_315 }) },
      prices: { create: vi.fn().mockResolvedValue({ id: "price_annual", livemode: false }) },
    });

    await expect(switchResidencyCommittedPlanToAnnualImmediately({ residencyId, userId: actor.userId, email: actor.email }, 1_790_000_000))
      .rejects.toThrow("Your card was declined.");

    expect(updatedTables).not.toContain(platformSubscriptions);
    expect(updatedTables).toContain(platformSubscriptionRevisions);
  });

  it("carries the exact preview timestamp through Setup Checkout for the no-card branch", async () => {
    const prorationDate = Math.floor(Date.now() / 1_000);
    const plan = {
      id: subscriptionId, residencyId, revision: 3, term: "month_to_month" as const,
      talentBucketSize: 20, houseBucketSize: 10, slotUnitAmountCents: 3_000,
      startsOn: "2026-09-01", renewsOn: "2026-10-01", stripeCustomerId: "cus_test",
      stripeProductId: "prod_test", stripeSubscriptionId: "sub_test", stripeSubscriptionItemId: "si_test",
      stripePriceId: "price_monthly", status: "active" as const, cardBrand: "", cardLast4: "",
    };
    const residency = { name: "Test Hotel", comped: false, billingContactEmail: "billing@example.test", primaryContactEmail: "manager@example.test" };
    const database = databaseWithSelectResults([[{ plan, residency }], [{ plan, comped: false }]]);
    const checkoutCreate = vi.fn().mockResolvedValue({ id: "cs_setup", livemode: false, url: "https://checkout.stripe.com/test/setup" });
    mocks.getDb.mockReturnValue(database);
    mocks.requireResidencyLiveBillingApproval.mockResolvedValue({ id: residencyId, name: "Test Hotel", liveBillingApproved: true });
    mocks.getStripe.mockReturnValue({ checkout: { sessions: { create: checkoutCreate } } });

    await expect(beginResidencyAnnualSwitch({ ...actor, kind: "residency", residencyId, accessRole: "manager" } as never, prorationDate))
      .resolves.toMatchObject({ kind: "checkout", paymentPath: "collect_card_then_charge_immediately" });

    expect(checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: "setup",
      metadata: expect.objectContaining({
        purpose: "update_card_and_switch_annual",
        annual_switch_proration_date: String(prorationDate),
      }),
    }), expect.anything());
  });
});

describe("production Committed Plan safety", () => {
  it("saves a non-approved, unconnected plan in production without constructing a Stripe client", async () => {
    const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const database = databaseWithSelectResults([
      [{ id: residencyId, comped: false, liveBillingApproved: false }],
      [],
    ]);
    const transaction = {
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown>) {
            inserted.push({ table, values });
            return {
              returning: async () => table === platformSubscriptions
                ? [{ id: subscriptionId, ...values }]
                : [],
            };
          },
        };
      },
    };
    Object.assign(database, {
      transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    });
    mocks.getDb.mockReturnValue(database);

    await expect(updateCommittedPlan(actor, planInput)).resolves.toMatchObject({
      id: subscriptionId,
      term: "month_to_month",
      talentBucketSize: 20,
      houseBucketSize: 10,
    });

    expect(inserted.find((entry) => entry.table === platformSubscriptions)?.values).toMatchObject({
      term: "month_to_month",
      talentBucketSize: 20,
      houseBucketSize: 10,
      slotUnitAmountCents: 3_000,
    });
    expect(inserted.find((entry) => entry.table === platformSubscriptionRevisions)?.values).toMatchObject({
      revision: 1,
      stripeSyncStatus: "not_connected",
    });
    expect(inserted.find((entry) => entry.table === auditLog)).toBeDefined();
    expect(mocks.requireResidencyLiveBillingApproval).not.toHaveBeenCalled();
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });

  it("blocks an unapproved subscription checkout before constructing a Stripe client", async () => {
    const database = databaseWithSelectResults([[{
      plan: {
        id: subscriptionId,
        residencyId,
        revision: 1,
        term: "month_to_month",
        talentBucketSize: 20,
        houseBucketSize: 10,
        slotUnitAmountCents: 3_000,
        stripeCustomerId: "cus_test",
        stripeProductId: "prod_test",
        stripeSubscriptionId: null,
      },
      residency: {
        name: "Test Hotel",
        comped: false,
        billingContactEmail: "billing@example.test",
        primaryContactEmail: "manager@example.test",
      },
    }]]);
    mocks.getDb.mockReturnValue(database);
    mocks.requireResidencyLiveBillingApproval.mockRejectedValue(new LiveBillingNotApprovedError());

    await expect(createPlatformSubscriptionCheckout(actor, residencyId)).rejects.toThrow("Live billing is not yet approved");

    expect(mocks.requireResidencyLiveBillingApproval).toHaveBeenCalledWith(expect.objectContaining({
      residencyId,
      action: "stripe_checkout_session_create",
    }));
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });

  it("allows an approved Residency to reach the test Stripe checkout path", async () => {
    const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const database = databaseWithSelectResults([[{
      plan: {
        id: subscriptionId,
        residencyId,
        revision: 1,
        term: "month_to_month",
        talentBucketSize: 20,
        houseBucketSize: 10,
        slotUnitAmountCents: 3_000,
        stripeCustomerId: "cus_test",
        stripeProductId: "prod_test",
        stripeSubscriptionId: null,
      },
      residency: {
        name: "Test Hotel",
        comped: false,
        billingContactEmail: "billing@example.test",
        primaryContactEmail: "manager@example.test",
      },
    }]]);
    Object.assign(database, {
      update(table: unknown) {
        return {
          set(values: Record<string, unknown>) {
            updates.push({ table, values });
            return { where: async () => [] };
          },
        };
      },
      insert(table: unknown) {
        return {
          values: async (values: Record<string, unknown>) => {
            inserts.push({ table, values });
            return [];
          },
        };
      },
    });
    const priceCreate = vi.fn().mockResolvedValue({ id: "price_test", livemode: false });
    const checkoutCreate = vi.fn().mockResolvedValue({
      id: "cs_test",
      livemode: false,
      url: "https://checkout.stripe.com/test/session",
    });
    mocks.getDb.mockReturnValue(database);
    mocks.requireResidencyLiveBillingApproval.mockResolvedValue({
      id: residencyId,
      name: "Test Hotel",
      liveBillingApproved: true,
    });
    mocks.getStripe.mockReturnValue({
      prices: { create: priceCreate },
      checkout: { sessions: { create: checkoutCreate } },
    });

    await expect(createPlatformSubscriptionCheckout(actor, residencyId)).resolves.toBe("https://checkout.stripe.com/test/session");

    expect(priceCreate).toHaveBeenCalledOnce();
    expect(checkoutCreate).toHaveBeenCalledOnce();
    expect(mocks.requireResidencyLiveBillingApproval.mock.invocationCallOrder[0]).toBeLessThan(mocks.getStripe.mock.invocationCallOrder[0]);
    expect(updates).toHaveLength(1);
    expect(inserts.find((entry) => entry.table === auditLog)?.values).toMatchObject({
      action: "platform_stripe_checkout_created",
      residencyId,
    });
  });

  it("uses the existing subscription Checkout for a cardless annual switch without changing the active plan first", async () => {
    const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const database = databaseWithSelectResults([[{
      plan: {
        id: subscriptionId,
        residencyId,
        revision: 1,
        term: "month_to_month",
        talentBucketSize: 20,
        houseBucketSize: 10,
        slotUnitAmountCents: 3_000,
        stripeCustomerId: "cus_test",
        stripeProductId: "prod_test",
        stripeSubscriptionId: null,
      },
      residency: {
        name: "Test Hotel",
        comped: false,
        billingContactEmail: "billing@example.test",
        primaryContactEmail: "manager@example.test",
      },
    }]]);
    Object.assign(database, {
      update(table: unknown) {
        return {
          set(values: Record<string, unknown>) {
            updates.push({ table, values });
            return { where: async () => [] };
          },
        };
      },
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown>) {
            inserts.push({ table, values });
            if (table === platformSubscriptionRevisions) return { onConflictDoUpdate: async () => [] };
            return Promise.resolve([]);
          },
        };
      },
    });
    const priceCreate = vi.fn().mockResolvedValue({ id: "price_annual", livemode: false });
    const checkoutCreate = vi.fn().mockResolvedValue({
      id: "cs_annual",
      livemode: false,
      url: "https://checkout.stripe.com/test/annual",
    });
    mocks.getDb.mockReturnValue(database);
    mocks.requireResidencyLiveBillingApproval.mockResolvedValue({ id: residencyId, name: "Test Hotel", liveBillingApproved: true });
    mocks.getStripe.mockReturnValue({
      prices: { create: priceCreate },
      checkout: { sessions: { create: checkoutCreate } },
    });

    await expect(createPlatformSubscriptionCheckout(actor, residencyId, { term: "annual", annualSwitch: true }))
      .resolves.toBe("https://checkout.stripe.com/test/annual");

    expect(priceCreate).toHaveBeenCalledWith(expect.objectContaining({
      unit_amount: 810_000,
      recurring: { interval: "year", interval_count: 1 },
    }), expect.anything());
    expect(checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ subscription_term: "annual", committed_plan_revision: "2", annual_switch: "true" }),
      success_url: "https://hfy.app/residency/settings/billing?annualSwitch=checkout-complete",
      cancel_url: "https://hfy.app/residency/settings/billing?annualSwitch=cancelled",
    }), expect.anything());
    expect(inserts.some((entry) => entry.table === platformSubscriptionRevisions)).toBe(false);
    expect(updates.filter((entry) => entry.table === platformSubscriptions)).toHaveLength(0);
  });
});
