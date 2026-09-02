import { describe, expect, it } from "vitest";
import { calculatePlatformMonthlyAmountCents, platformCadenceChargeCents, platformMonthlyEquivalentCents } from "./platform-billing";

describe("Platform billing", () => {
  it("uses the same plan calculation for Platform and Full Programming accounts", () => {
    const plan = { talentProgramSessions: 8, talentSessionUnitAmountCents: 2_500, housePrograms: 3, houseProgramUnitAmountCents: 1_000 };
    const byAccountType = ["operations_only", "complete"].map(() => calculatePlatformMonthlyAmountCents(plan));
    expect(byAccountType).toEqual([23_000, 23_000]);
  });

  it("converts monthly commitments to and from supported charge cadences", () => {
    expect(platformCadenceChargeCents(10_000, "monthly")).toBe(10_000);
    expect(platformCadenceChargeCents(10_000, "quarterly")).toBe(30_000);
    expect(platformCadenceChargeCents(10_000, "annual")).toBe(120_000);
    expect(platformMonthlyEquivalentCents(120_000, "annual")).toBe(10_000);
  });

  it("rejects negative or fractional plan inputs", () => {
    expect(() => calculatePlatformMonthlyAmountCents({ talentProgramSessions: -1, talentSessionUnitAmountCents: 1, housePrograms: 0, houseProgramUnitAmountCents: 0 })).toThrow();
    expect(() => platformCadenceChargeCents(10.5, "monthly")).toThrow();
  });
});
