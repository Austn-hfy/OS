const rateAttentionBookingStatuses = new Set([
  "offered",
  "pending_hfy_confirmation",
  "confirmed",
  "completed",
]);

export type AssignmentRateAttentionInput = {
  bookingStatus: string;
  payoutStatus: string;
  compensationType: "hourly" | "fixed" | "na";
  talentRateCents: number;
  talentRateOverrideCents: number | null;
  fixedFeeCents: number | null;
};

export function assignmentNeedsRate(input: AssignmentRateAttentionInput): boolean {
  if (!rateAttentionBookingStatuses.has(input.bookingStatus)) return false;
  if (input.payoutStatus === "paid" || input.payoutStatus === "na" || input.compensationType === "na") return false;
  if (input.compensationType === "fixed") return (input.fixedFeeCents ?? 0) <= 0;
  return (input.talentRateOverrideCents ?? input.talentRateCents) <= 0;
}
