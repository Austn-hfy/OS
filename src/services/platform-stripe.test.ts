import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, platformSubscriptionRevisions, platformSubscriptions } from "@/db/schema";
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
  createPlatformSubscriptionCheckout,
  platformPlanAmount,
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
        const chain = {
          innerJoin: vi.fn(() => chain),
          where: vi.fn(() => chain),
          limit: vi.fn(async () => queued.shift() ?? []),
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
  it("changes only the term while preserving the existing capacities and dates", () => {
    expect(annualPlanChangeInput({
      residencyId,
      talentBucketSize: 40,
      houseBucketSize: 15,
      startsOn: "2026-09-01",
      renewsOn: "2026-10-01",
    })).toEqual({
      residencyId,
      term: "annual",
      talentBucketSize: 40,
      houseBucketSize: 15,
      startsOn: "2026-09-01",
      renewsOn: "2026-10-01",
      changeReason: "Residency manager switched to annual billing",
    });
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
});
