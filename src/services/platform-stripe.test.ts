import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/platform-billing-stage", () => ({ assertCurrentPlatformBillingStaging: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn(), stagingBillingReturnUrl: vi.fn() }));
vi.mock("@/services/live-billing-safety", () => ({ requireResidencyLiveBillingApproval: vi.fn() }));

import { platformPlanAmount } from "./platform-stripe";

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
