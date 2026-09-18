import { describe, expect, it } from "vitest";
import { annualSwitchPaymentPath, calculateAnnualSwitchComparison } from "./platform-annual-switch";

describe("annual switch comparison", () => {
  it("shows the real monthly comparison, upfront charge, and dollar savings", () => {
    expect(calculateAnnualSwitchComparison({ talentBucketSize: 20, houseBucketSize: 10 })).toEqual({
      currentMonthlyAmountCents: 90_000,
      annualEffectiveMonthlyAmountCents: 67_500,
      annualUpfrontAmountCents: 810_000,
      annualSavingsAmountCents: 270_000,
      annualSavingsPercent: 25,
    });
  });

  it("branches from the persisted Stripe and card state", () => {
    expect(annualSwitchPaymentPath({ stripeSubscriptionId: "sub_123", cardLast4: "4242" })).toBe("charge_card_immediately");
    expect(annualSwitchPaymentPath({ stripeSubscriptionId: null, cardLast4: "" })).toBe("collect_card_and_start_annual");
    expect(annualSwitchPaymentPath({ stripeSubscriptionId: "sub_123", cardLast4: "" })).toBe("collect_card_then_charge_immediately");
  });
});
