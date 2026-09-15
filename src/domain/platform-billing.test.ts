import { describe, expect, it } from "vitest";
import {
  HOUSE_BUCKET_SIZES,
  PLATFORM_SLOT_UNIT_AMOUNT_CENTS,
  TALENT_BUCKET_SIZES,
  calculatePlatformPlanAmounts,
  platformTermInterval,
  roundLegacyHouseCountToBucket,
  roundLegacyTalentCountToBucket,
} from "./platform-billing";

describe("Business Model v14 Platform pricing", () => {
  it.each(TALENT_BUCKET_SIZES.flatMap((talentBucketSize) => HOUSE_BUCKET_SIZES.map((houseBucketSize) => [talentBucketSize, houseBucketSize] as const)))(
    "prices every standard %i Talent / %i House monthly combination at $30 per slot",
    (talentBucketSize, houseBucketSize) => {
      const expected = (talentBucketSize + houseBucketSize) * PLATFORM_SLOT_UNIT_AMOUNT_CENTS;
      expect(calculatePlatformPlanAmounts({ talentBucketSize, houseBucketSize, term: "month_to_month" })).toEqual({
        baseMonthlyAmountCents: expected,
        effectiveMonthlyAmountCents: expected,
        undiscountedTermAmountCents: expected,
        annualDiscountCents: 0,
        termChargeAmountCents: expected,
      });
    },
  );

  it.each(TALENT_BUCKET_SIZES.flatMap((talentBucketSize) => HOUSE_BUCKET_SIZES.map((houseBucketSize) => [talentBucketSize, houseBucketSize] as const)))(
    "applies exactly 25%% to every standard %i Talent / %i House annual combination",
    (talentBucketSize, houseBucketSize) => {
      const monthly = (talentBucketSize + houseBucketSize) * PLATFORM_SLOT_UNIT_AMOUNT_CENTS;
      const amounts = calculatePlatformPlanAmounts({ talentBucketSize, houseBucketSize, term: "annual" });
      expect(amounts.undiscountedTermAmountCents).toBe(monthly * 12);
      expect(amounts.annualDiscountCents).toBe(monthly * 3);
      expect(amounts.termChargeAmountCents).toBe(monthly * 9);
      expect(amounts.effectiveMonthlyAmountCents).toBe(Math.round(monthly * 0.75));
    },
  );

  it("enforces the House floor, standard buckets, fixed rate, and two terms", () => {
    const base = { talentBucketSize: 10, houseBucketSize: 5, term: "month_to_month" as const };
    expect(() => calculatePlatformPlanAmounts({ ...base, houseBucketSize: 0 })).toThrow(/5-slot minimum/);
    expect(() => calculatePlatformPlanAmounts({ ...base, talentBucketSize: 12 })).toThrow(/Talent bucket/);
    expect(() => calculatePlatformPlanAmounts({ ...base, houseBucketSize: 20 })).toThrow(/House bucket/);
    expect(() => calculatePlatformPlanAmounts({ ...base, slotUnitAmountCents: 9_000 })).toThrow(/exactly \$30/);
    expect(() => calculatePlatformPlanAmounts({ ...base, term: "quarterly" as never })).toThrow(/month-to-month or annual/);
  });

  it("maps legacy counts upward and rejects values requiring custom pricing", () => {
    expect([0, 1, 10, 11, 59, 60].map(roundLegacyTalentCountToBucket)).toEqual([10, 10, 10, 20, 60, 60]);
    expect([0, 1, 5, 6, 14, 15].map(roundLegacyHouseCountToBucket)).toEqual([5, 5, 5, 10, 15, 15]);
    expect(() => roundLegacyTalentCountToBucket(61)).toThrow(/enterprise pricing/);
    expect(() => roundLegacyHouseCountToBucket(16)).toThrow(/custom pricing/);
  });

  it("maps terms to Stripe's matching immutable Price interval", () => {
    expect(platformTermInterval("month_to_month")).toEqual({ interval: "month", intervalCount: 1 });
    expect(platformTermInterval("annual")).toEqual({ interval: "year", intervalCount: 1 });
  });
});
