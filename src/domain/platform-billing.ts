export const PLATFORM_SLOT_UNIT_AMOUNT_CENTS = 3_000;
export const PLATFORM_ANNUAL_DISCOUNT_PERCENT = 25;
export const PLATFORM_ANNUAL_BILLING_MONTHS = 12;

export const TALENT_BUCKET_SIZES = [10, 20, 30, 40, 50, 60] as const;
export const HOUSE_BUCKET_SIZES = [5, 10, 15] as const;

export type TalentBucketSize = (typeof TALENT_BUCKET_SIZES)[number];
export type HouseBucketSize = (typeof HOUSE_BUCKET_SIZES)[number];
export type PlatformSubscriptionTerm = "month_to_month" | "annual";

export type PlatformPlanInputs = {
  talentBucketSize: number;
  houseBucketSize: number;
  slotUnitAmountCents?: number;
  term: PlatformSubscriptionTerm;
};

function includesNumber(values: readonly number[], value: number) {
  return values.includes(value);
}

export function assertPlatformPlan(input: PlatformPlanInputs): void {
  const rate = input.slotUnitAmountCents ?? PLATFORM_SLOT_UNIT_AMOUNT_CENTS;
  if (!includesNumber(TALENT_BUCKET_SIZES, input.talentBucketSize)) {
    throw new Error("Talent bucket must be one of 10, 20, 30, 40, 50, or 60 slots.");
  }
  if (!includesNumber(HOUSE_BUCKET_SIZES, input.houseBucketSize)) {
    throw new Error("House bucket must be one of 5, 10, or 15 slots; every plan has a 5-slot minimum.");
  }
  if (rate !== PLATFORM_SLOT_UNIT_AMOUNT_CENTS) throw new Error("Platform slot rate must be exactly $30.");
  if (input.term !== "month_to_month" && input.term !== "annual") {
    throw new Error("Platform term must be month-to-month or annual.");
  }
}

export function calculatePlatformBaseMonthlyAmountCents(input: PlatformPlanInputs): number {
  assertPlatformPlan(input);
  return (input.talentBucketSize + input.houseBucketSize) * PLATFORM_SLOT_UNIT_AMOUNT_CENTS;
}

export function calculatePlatformPlanAmounts(input: PlatformPlanInputs, comped = false) {
  const baseMonthlyAmountCents = calculatePlatformBaseMonthlyAmountCents(input);
  const undiscountedTermAmountCents = input.term === "annual"
    ? baseMonthlyAmountCents * PLATFORM_ANNUAL_BILLING_MONTHS
    : baseMonthlyAmountCents;
  const annualDiscountCents = input.term === "annual"
    ? Math.round(undiscountedTermAmountCents * PLATFORM_ANNUAL_DISCOUNT_PERCENT / 100)
    : 0;
  const termChargeAmountCents = comped ? 0 : undiscountedTermAmountCents - annualDiscountCents;
  const effectiveMonthlyAmountCents = comped
    ? 0
    : input.term === "annual"
      ? Math.round(termChargeAmountCents / PLATFORM_ANNUAL_BILLING_MONTHS)
      : baseMonthlyAmountCents;
  return {
    baseMonthlyAmountCents: comped ? 0 : baseMonthlyAmountCents,
    effectiveMonthlyAmountCents,
    undiscountedTermAmountCents: comped ? 0 : undiscountedTermAmountCents,
    annualDiscountCents: comped ? 0 : annualDiscountCents,
    termChargeAmountCents,
  };
}

export function platformTermInterval(term: PlatformSubscriptionTerm): { interval: "month" | "year"; intervalCount: 1 } {
  return term === "annual" ? { interval: "year", intervalCount: 1 } : { interval: "month", intervalCount: 1 };
}

export function roundLegacyTalentCountToBucket(value: number): TalentBucketSize {
  if (!Number.isInteger(value) || value < 0) throw new Error("Legacy Talent count must be a nonnegative whole number.");
  const bucket = TALENT_BUCKET_SIZES.find((candidate) => value <= candidate);
  if (!bucket) throw new Error(`Legacy Talent count ${value} exceeds the 60-slot standard maximum; enterprise pricing requires manual review.`);
  return bucket;
}

export function roundLegacyHouseCountToBucket(value: number): HouseBucketSize {
  if (!Number.isInteger(value) || value < 0) throw new Error("Legacy House count must be a nonnegative whole number.");
  const bucket = HOUSE_BUCKET_SIZES.find((candidate) => value <= candidate);
  if (!bucket) throw new Error(`Legacy House count ${value} exceeds the 15-slot standard maximum; custom pricing requires manual review.`);
  return bucket;
}

export type PlatformUsageCounts = { talentSessions: number; housePrograms: number };
export type PlatformCommitments = { talentBucketSize: number; houseBucketSize: number };
export type PlatformUsageMetricComparison = { committed: number; live: number; overBy: number; withinPlan: boolean };

export function comparePlatformUsage(plan: PlatformCommitments, usage: PlatformUsageCounts) {
  const metric = (committed: number, live: number): PlatformUsageMetricComparison => ({
    committed,
    live,
    overBy: Math.max(0, live - committed),
    withinPlan: live <= committed,
  });
  const comparison = {
    talentSessions: metric(plan.talentBucketSize, usage.talentSessions),
    housePrograms: metric(plan.houseBucketSize, usage.housePrograms),
  };
  return {
    ...comparison,
    withinPlan: comparison.talentSessions.withinPlan && comparison.housePrograms.withinPlan,
    totalOverBy: comparison.talentSessions.overBy + comparison.housePrograms.overBy,
  };
}

export function monthWindow(date = new Date()): { snapshotDate: string; periodStart: string; periodEnd: string } {
  const snapshotDate = date.toISOString().slice(0, 10);
  const [year, month] = snapshotDate.split("-").map(Number);
  const periodStart = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`;
  const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { snapshotDate, periodStart, periodEnd };
}
