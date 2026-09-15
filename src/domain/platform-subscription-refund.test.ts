import { describe, expect, it } from "vitest";
import { annualMonthsUsed, calculateAnnualCancellationRefund } from "./platform-subscription-refund";

describe("annual cancellation refund", () => {
  it("subtracts months used at the full month-to-month bucket rate", () => {
    expect(calculateAnnualCancellationRefund({
      totalAnnualPaymentCents: 810_000,
      fullMonthlyAmountCents: 90_000,
      monthsUsed: 4,
    })).toEqual({
      totalAnnualPaymentCents: 810_000,
      fullMonthlyAmountCents: 90_000,
      monthsUsed: 4,
      usedValueCents: 360_000,
      refundAmountCents: 450_000,
    });
  });

  it("never creates a negative refund and rejects impossible inputs", () => {
    expect(calculateAnnualCancellationRefund({ totalAnnualPaymentCents: 405_000, fullMonthlyAmountCents: 45_000, monthsUsed: 10 }).refundAmountCents).toBe(0);
    expect(() => calculateAnnualCancellationRefund({ totalAnnualPaymentCents: 1, fullMonthlyAmountCents: 1, monthsUsed: 13 })).toThrow(/12-month/);
  });

  it("counts any started calendar month, capped at the annual term", () => {
    expect(annualMonthsUsed("2027-01-15", new Date("2027-01-15T01:00:00.000Z"))).toBe(1);
    expect(annualMonthsUsed("2027-01-15", new Date("2027-04-01T00:00:00.000Z"))).toBe(4);
    expect(annualMonthsUsed("2027-01-15", new Date("2028-08-01T00:00:00.000Z"))).toBe(12);
  });
});
