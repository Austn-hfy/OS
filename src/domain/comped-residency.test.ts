import { describe, expect, it } from "vitest";
import {
  assertCompedResidencyConfirmation,
  compedResidencyConfirmationPhrase,
  enforceCompedPlan,
} from "./comped-residency";

describe("permanently comped Residencies", () => {
  it("overrides submitted Talent and House rates with zero", () => {
    expect(enforceCompedPlan({
      cadence: "quarterly" as const,
      talentSessionUnitAmountCents: 999_999,
      houseProgramUnitAmountCents: 1,
    }, true)).toEqual({
      cadence: "quarterly",
      talentSessionUnitAmountCents: 0,
      houseProgramUnitAmountCents: 0,
    });
  });

  it("leaves a non-comped plan unchanged", () => {
    const plan = {
      cadence: "monthly" as const,
      talentSessionUnitAmountCents: 9_000,
      houseProgramUnitAmountCents: 6_000,
    };
    expect(enforceCompedPlan(plan, false)).toBe(plan);
  });

  it("requires the exact owner confirmation phrase for either toggle direction", () => {
    const enablePhrase = compedResidencyConfirmationPhrase("Ace Hotel", true);
    expect(enablePhrase).toBe("SET Ace Hotel AS PERMANENTLY COMPED");
    expect(() => assertCompedResidencyConfirmation({
      residencyName: "Ace Hotel",
      comped: true,
      confirmation: "SET ACE HOTEL AS PERMANENTLY COMPED",
    })).toThrow(/exactly/);
    expect(() => assertCompedResidencyConfirmation({
      residencyName: "Ace Hotel",
      comped: true,
      confirmation: enablePhrase,
    })).not.toThrow();

    const removePhrase = compedResidencyConfirmationPhrase("Ace Hotel", false);
    expect(() => assertCompedResidencyConfirmation({
      residencyName: "Ace Hotel",
      comped: false,
      confirmation: removePhrase,
    })).not.toThrow();
  });
});
