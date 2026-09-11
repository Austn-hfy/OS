import { describe, expect, it } from "vitest";
import {
  assertFoundingClientEnrollmentEligible,
  enforceFoundingClientPlan,
  foundingClientEndsAt,
  getFoundingClientState,
} from "./founding-client";

describe("Founding Client policy", () => {
  it("creates an auditable six-calendar-month window and handles month ends", () => {
    expect(foundingClientEndsAt(new Date("2027-07-31T18:30:00.000Z")).toISOString())
      .toBe("2028-01-31T18:30:00.000Z");
    expect(foundingClientEndsAt(new Date("2026-08-31T18:30:00.000Z")).toISOString())
      .toBe("2027-02-28T18:30:00.000Z");
  });

  it("accepts enrollment before the cutoff and rejects it on or after August 1, 2027", () => {
    expect(() => assertFoundingClientEnrollmentEligible(new Date("2027-07-31T23:59:59.999Z"))).not.toThrow();
    expect(() => assertFoundingClientEnrollmentEligible(new Date("2027-08-01T00:00:00.000Z"))).toThrow(/closed/);
    expect(() => assertFoundingClientEnrollmentEligible(new Date("2028-01-01T00:00:00.000Z"))).toThrow(/closed/);
  });

  it("forces both rates to $60 and monthly cadence throughout the active window", () => {
    const signedAt = new Date("2027-01-15T12:00:00.000Z");
    const plan = enforceFoundingClientPlan({
      cadence: "annual" as const,
      talentSessionUnitAmountCents: 9_000,
      houseProgramUnitAmountCents: 5_000,
    }, {
      foundingClientSignedAt: signedAt,
      foundingClientEndsAt: foundingClientEndsAt(signedAt),
    }, new Date("2027-07-15T11:59:59.999Z"));

    expect(plan).toEqual({
      cadence: "monthly",
      talentSessionUnitAmountCents: 6_000,
      houseProgramUnitAmountCents: 6_000,
    });
  });

  it("flags an expired Founding window for commitment-tier selection", () => {
    const signedAt = new Date("2026-09-10T12:00:00.000Z");
    const endsAt = foundingClientEndsAt(signedAt);
    expect(getFoundingClientState({ foundingClientSignedAt: signedAt, foundingClientEndsAt: endsAt }, endsAt))
      .toMatchObject({ enrolled: true, active: false, needsCommitmentTierSelection: true });
  });
});
