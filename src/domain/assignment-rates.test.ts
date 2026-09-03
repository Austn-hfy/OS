import { describe, expect, it } from "vitest";
import { assignmentNeedsRate, type AssignmentRateAttentionInput } from "./assignment-rates";

const hourlyAssignment: AssignmentRateAttentionInput = {
  bookingStatus: "confirmed",
  payoutStatus: "not_ready",
  compensationType: "hourly",
  talentRateCents: 0,
  talentRateOverrideCents: null,
  fixedFeeCents: null,
};

describe("Assignment rate attention", () => {
  it("flags active hourly and fixed-fee Assignments without a usable rate", () => {
    expect(assignmentNeedsRate(hourlyAssignment)).toBe(true);
    expect(assignmentNeedsRate({ ...hourlyAssignment, compensationType: "fixed", fixedFeeCents: 0 })).toBe(true);
  });

  it("accepts either an hourly override, a snapshotted hourly rate, or a fixed fee", () => {
    expect(assignmentNeedsRate({ ...hourlyAssignment, talentRateOverrideCents: 12_500 })).toBe(false);
    expect(assignmentNeedsRate({ ...hourlyAssignment, talentRateCents: 10_000 })).toBe(false);
    expect(assignmentNeedsRate({ ...hourlyAssignment, compensationType: "fixed", fixedFeeCents: 45_000 })).toBe(false);
  });

  it("does not warn for cancelled, paid, open, or N/A Assignments", () => {
    expect(assignmentNeedsRate({ ...hourlyAssignment, bookingStatus: "cancelled" })).toBe(false);
    expect(assignmentNeedsRate({ ...hourlyAssignment, bookingStatus: "open" })).toBe(false);
    expect(assignmentNeedsRate({ ...hourlyAssignment, payoutStatus: "paid" })).toBe(false);
    expect(assignmentNeedsRate({ ...hourlyAssignment, compensationType: "na", payoutStatus: "na" })).toBe(false);
  });
});
