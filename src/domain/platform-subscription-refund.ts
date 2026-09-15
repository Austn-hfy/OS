const ANNUAL_TERM_MONTHS = 12;

export type AnnualCancellationRefund = {
  totalAnnualPaymentCents: number;
  fullMonthlyAmountCents: number;
  monthsUsed: number;
  usedValueCents: number;
  refundAmountCents: number;
};

export function calculateAnnualCancellationRefund(input: {
  totalAnnualPaymentCents: number;
  fullMonthlyAmountCents: number;
  monthsUsed: number;
}): AnnualCancellationRefund {
  for (const [label, value] of Object.entries(input)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative whole number.`);
  }
  if (input.monthsUsed > ANNUAL_TERM_MONTHS) throw new Error("Months used cannot exceed the 12-month annual term.");
  const usedValueCents = input.monthsUsed * input.fullMonthlyAmountCents;
  return { ...input, usedValueCents, refundAmountCents: Math.max(0, input.totalAnnualPaymentCents - usedValueCents) };
}

export function annualMonthsUsed(startedOn: string, changedAt: Date): number {
  const startedAt = new Date(`${startedOn}T00:00:00.000Z`);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(changedAt.getTime())) throw new Error("Annual term dates must be valid.");
  if (changedAt < startedAt) throw new Error("Annual cancellation cannot predate the term start.");
  const elapsedMonths = (changedAt.getUTCFullYear() - startedAt.getUTCFullYear()) * 12
    + changedAt.getUTCMonth() - startedAt.getUTCMonth();
  return Math.min(ANNUAL_TERM_MONTHS, elapsedMonths + 1);
}
