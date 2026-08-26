export type CompensationInput = {
  compensationType: "hourly" | "fixed" | "na";
  startsAt: Date;
  endsAt: Date;
  talentRateCents: number;
  fixedFeeCents?: number | null;
};

export type PaymentEligibilityInput = {
  bookingStatus: string;
  compensationType: "hourly" | "fixed" | "na";
  hasTalent: boolean;
  hasServiceDate: boolean;
  totalCompensationCents: number;
};

export function hoursBetween(startsAt: Date, endsAt: Date): number {
  const milliseconds = endsAt.getTime() - startsAt.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
  return milliseconds / 3_600_000;
}

export function calculateCompensationCents(input: CompensationInput): number {
  if (input.compensationType === "na") return 0;
  if (input.compensationType === "fixed") return Math.max(0, input.fixedFeeCents ?? 0);
  return Math.max(0, Math.round(hoursBetween(input.startsAt, input.endsAt) * input.talentRateCents));
}

export function calculateBillableAmountCents(startsAt: Date, endsAt: Date, clientRateCents: number): number {
  return Math.max(0, Math.round(hoursBetween(startsAt, endsAt) * clientRateCents));
}

export function resolveRateCents(overrideCents: number | null | undefined, residencyDefaultCents: number): number {
  return overrideCents ?? residencyDefaultCents;
}

export function resolveTalentRateCents(
  assignmentOverrideCents: number | null | undefined,
  daypartDefaultCents: number | null | undefined,
  residencyDefaultCents: number,
): number {
  return assignmentOverrideCents ?? daypartDefaultCents ?? residencyDefaultCents;
}

export function isPaymentEligible(input: PaymentEligibilityInput): boolean {
  return input.bookingStatus === "completed"
    && input.compensationType !== "na"
    && input.hasTalent
    && input.hasServiceDate
    && input.totalCompensationCents > 0;
}

export function nextPayoutStatus(
  current: "not_ready" | "ready_to_pay" | "paid" | "na",
  eligible: boolean,
): "not_ready" | "ready_to_pay" | "paid" | "na" {
  if (current === "paid" || current === "na") return current;
  return eligible ? "ready_to_pay" : "not_ready";
}

export function addDays(dateValue: string, days: number): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function invoiceBalanceCents(status: string, totalCents: number): number {
  return status === "paid" || status === "void" ? 0 : totalCents;
}

export function invoiceVarianceCents(approvedTotalCents: number, calculatedTotalCents: number): number {
  return approvedTotalCents - calculatedTotalCents;
}

export function grossMarginCents(invoiceTotalCents: number, talentCostCents: number): number {
  return invoiceTotalCents - talentCostCents;
}

export function marginPercentage(invoiceTotalCents: number, talentCostCents: number): number | null {
  if (invoiceTotalCents === 0) return null;
  return (grossMarginCents(invoiceTotalCents, talentCostCents) / invoiceTotalCents) * 100;
}
