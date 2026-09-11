import { describe, expect, it } from "vitest";
import {
  applyCommitmentTier,
  assertCommitmentTierSelectionAllowed,
  calculateCommitmentClawback,
  commitmentForgivenessStartsAt,
  commitmentTermEndsAt,
  type CommitmentTier,
} from "./commitment-tier";

describe("Platform commitment tiers", () => {
  it.each([
    ["month_to_month", 9_000],
    ["three_month", 8_000],
    ["six_month", 7_000],
    ["twelve_month", 6_000],
  ] satisfies Array<[CommitmentTier, number]>)("%s sets its Talent rate while House stays $60 and billing stays monthly", (tier, talentRateCents) => {
    expect(applyCommitmentTier({
      cadence: "annual",
      talentSessionUnitAmountCents: 1,
      houseProgramUnitAmountCents: 1,
    }, tier)).toEqual({
      cadence: "monthly",
      talentSessionUnitAmountCents: talentRateCents,
      houseProgramUnitAmountCents: 6_000,
    });
  });

  it("calculates a committed-tier change before forgiveness from sessions already billed", () => {
    expect(calculateCommitmentClawback({
      currentTier: "six_month",
      nextTier: "month_to_month",
      commitmentStartedAt: new Date("2027-01-15T12:00:00.000Z"),
      changedAt: new Date("2027-04-15T11:59:59.999Z"),
      talentSessionsBilled: 17,
    })).toMatchObject({ applies: true, unitAmountCents: 2_000, talentSessionsBilled: 17, amountCents: 34_000 });
  });

  it("calculates the same clawback when a committed tier is canceled", () => {
    expect(calculateCommitmentClawback({
      currentTier: "twelve_month",
      nextTier: null,
      commitmentStartedAt: new Date("2027-01-01T00:00:00.000Z"),
      changedAt: new Date("2027-06-01T00:00:00.000Z"),
      talentSessionsBilled: 20,
    })).toMatchObject({ applies: true, unitAmountCents: 3_000, amountCents: 60_000 });
  });

  it("forgives a 6-month change after month 4 and a 12-month change after month 9", () => {
    const startedAt = new Date("2027-01-31T12:00:00.000Z");
    expect(commitmentForgivenessStartsAt(startedAt, "six_month")?.toISOString()).toBe("2027-05-31T12:00:00.000Z");
    expect(calculateCommitmentClawback({
      currentTier: "six_month",
      nextTier: "three_month",
      commitmentStartedAt: startedAt,
      changedAt: new Date("2027-05-31T12:00:00.000Z"),
      talentSessionsBilled: 25,
    })).toMatchObject({ applies: false, reason: "forgiven", amountCents: 0 });
    expect(calculateCommitmentClawback({
      currentTier: "twelve_month",
      nextTier: null,
      commitmentStartedAt: startedAt,
      changedAt: new Date("2027-10-31T12:00:00.000Z"),
      talentSessionsBilled: 30,
    })).toMatchObject({ applies: false, reason: "forgiven", amountCents: 0 });
  });

  it("never forgives a 3-month term before that term is complete", () => {
    const commitmentStartedAt = new Date("2027-01-01T00:00:00.000Z");
    expect(commitmentForgivenessStartsAt(commitmentStartedAt, "three_month")).toBeNull();
    expect(calculateCommitmentClawback({
      currentTier: "three_month",
      nextTier: "month_to_month",
      commitmentStartedAt,
      changedAt: new Date("2027-03-31T23:59:59.999Z"),
      talentSessionsBilled: 10,
    })).toMatchObject({ applies: true, unitAmountCents: 1_000, amountCents: 10_000 });
    expect(commitmentTermEndsAt(commitmentStartedAt, "three_month").toISOString()).toBe("2027-04-01T00:00:00.000Z");
  });

  it("blocks a Residency that is still inside its Founding Client window", () => {
    expect(() => assertCommitmentTierSelectionAllowed({
      foundingClientSignedAt: new Date("2027-01-01T00:00:00.000Z"),
      foundingClientEndsAt: new Date("2027-07-01T00:00:00.000Z"),
    }, new Date("2027-04-01T00:00:00.000Z"))).toThrow(/cannot select/);
  });
});
