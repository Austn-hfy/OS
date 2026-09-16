import {
  calculatePlatformPlanAmounts,
  PLATFORM_ANNUAL_DISCOUNT_PERCENT,
  type PlatformPlanInputs,
} from "@/domain/platform-billing";

type AnnualSwitchPlan = Pick<PlatformPlanInputs, "talentBucketSize" | "houseBucketSize">;

export function calculateAnnualSwitchComparison(plan: AnnualSwitchPlan) {
  const current = calculatePlatformPlanAmounts({ ...plan, term: "month_to_month" });
  const annual = calculatePlatformPlanAmounts({ ...plan, term: "annual" });
  return {
    currentMonthlyAmountCents: current.effectiveMonthlyAmountCents,
    annualEffectiveMonthlyAmountCents: annual.effectiveMonthlyAmountCents,
    annualUpfrontAmountCents: annual.termChargeAmountCents,
    annualSavingsAmountCents: annual.annualDiscountCents,
    annualSavingsPercent: PLATFORM_ANNUAL_DISCOUNT_PERCENT,
  };
}

export type AnnualSwitchPaymentPath =
  | "charge_card_at_renewal"
  | "collect_card_and_start_annual"
  | "collect_card_then_schedule";

export function annualSwitchPaymentPath(plan: { stripeSubscriptionId: string | null; cardLast4: string }): AnnualSwitchPaymentPath {
  if (!plan.stripeSubscriptionId) return "collect_card_and_start_annual";
  if (!plan.cardLast4) return "collect_card_then_schedule";
  return "charge_card_at_renewal";
}
