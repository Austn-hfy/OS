import { describe, expect, it } from "vitest";
import {
  addDays,
  calculateCompensationCents,
  grossMarginCents,
  hoursBetween,
  invoiceBalanceCents,
  invoiceVarianceCents,
  isPaymentEligible,
  marginPercentage,
  nextPayoutStatus,
  resolveRateCents,
  resolveTalentRateCents,
} from "./airtable-parity";

describe("Airtable compensation parity", () => {
  it("reproduces Ace's seven-hour $80 talent calculation", () => {
    const startsAt = new Date("2026-08-22T19:00:00.000Z");
    const endsAt = new Date("2026-08-23T02:00:00.000Z");
    expect(hoursBetween(startsAt, endsAt)).toBe(7);
    expect(calculateCompensationCents({
      compensationType: "hourly",
      startsAt,
      endsAt,
      talentRateCents: 8_000,
    })).toBe(56_000);
  });

  it("preserves fixed fee and N/A outcomes", () => {
    const startsAt = new Date("2026-08-22T19:00:00.000Z");
    const endsAt = new Date("2026-08-22T22:00:00.000Z");
    expect(calculateCompensationCents({ compensationType: "fixed", startsAt, endsAt, talentRateCents: 0, fixedFeeCents: 45_000 })).toBe(45_000);
    expect(calculateCompensationCents({ compensationType: "na", startsAt, endsAt, talentRateCents: 8_000 })).toBe(0);
  });

  it("uses a per-record override before the Residency default", () => {
    expect(resolveRateCents(null, 8_000)).toBe(8_000);
    expect(resolveRateCents(9_500, 8_000)).toBe(9_500);
    expect(resolveRateCents(0, 8_000)).toBe(0);
  });

  it("resolves talent rates from Assignment, then Daypart, then Residency", () => {
    expect(resolveTalentRateCents(null, null, 8_000)).toBe(8_000);
    expect(resolveTalentRateCents(null, 9_000, 8_000)).toBe(9_000);
    expect(resolveTalentRateCents(10_000, 9_000, 8_000)).toBe(10_000);
    expect(resolveTalentRateCents(0, 9_000, 8_000)).toBe(0);
  });
});

describe("Airtable payout eligibility parity", () => {
  const eligible = {
    bookingStatus: "completed",
    compensationType: "hourly" as const,
    hasTalent: true,
    hasServiceDate: true,
    totalCompensationCents: 24_000,
  };

  it("makes completed compensated work Ready to Pay", () => {
    expect(isPaymentEligible(eligible)).toBe(true);
    expect(nextPayoutStatus("not_ready", true)).toBe("ready_to_pay");
  });

  it.each([
    { ...eligible, bookingStatus: "confirmed" },
    { ...eligible, compensationType: "na" as const },
    { ...eligible, hasTalent: false },
    { ...eligible, hasServiceDate: false },
    { ...eligible, totalCompensationCents: 0 },
  ])("rejects an invalid eligibility input", (input) => {
    expect(isPaymentEligible(input)).toBe(false);
  });

  it("never overwrites Paid or N/A", () => {
    expect(nextPayoutStatus("paid", true)).toBe("paid");
    expect(nextPayoutStatus("na", true)).toBe("na");
  });
});

describe("Airtable invoice formula parity", () => {
  it("applies payment terms as calendar days", () => {
    expect(addDays("2026-08-28", 7)).toBe("2026-09-04");
  });

  it("reproduces balance, variance, and margin outcomes", () => {
    expect(invoiceBalanceCents("sent", 70_000)).toBe(70_000);
    expect(invoiceBalanceCents("paid", 70_000)).toBe(0);
    expect(invoiceVarianceCents(70_000, 69_000)).toBe(1_000);
    expect(grossMarginCents(70_000, 56_000)).toBe(14_000);
    expect(marginPercentage(70_000, 56_000)).toBeCloseTo(20);
    expect(marginPercentage(0, 0)).toBeNull();
  });
});
