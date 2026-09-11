import { describe, expect, it } from "vitest";
import { planShiftTimeEdit } from "./shift-time-editing";

function at(hour: number, minute = 0) {
  return new Date(Date.UTC(2026, 8, 12, hour, minute));
}

describe("Shift time editing", () => {
  it("clamps overlapping Assignment hours and recomputes compensation from stored rates", () => {
    const plan = planShiftTimeEdit({
      oldStartsAt: at(18),
      oldEndsAt: at(23),
      newStartsAt: at(19),
      newEndsAt: at(22),
      clientRateCents: 20_000,
      assignments: [
        {
          id: "hourly",
          label: "Hourly artist",
          startsAt: at(18, 30),
          endsAt: at(21),
          compensationType: "hourly",
          talentRateCents: 10_000,
          fixedFeeCents: null,
          totalCompensationCents: 25_000,
        },
        {
          id: "fixed",
          label: "Fixed artist",
          startsAt: at(20),
          endsAt: at(23),
          compensationType: "fixed",
          talentRateCents: 0,
          fixedFeeCents: 30_000,
          totalCompensationCents: 30_000,
        },
      ],
    });

    expect(plan.oldClientBilledTotalCents).toBe(100_000);
    expect(plan.newClientBilledTotalCents).toBe(60_000);
    expect(plan.oldTalentCompensationTotalCents).toBe(55_000);
    expect(plan.newTalentCompensationTotalCents).toBe(50_000);
    expect(plan.assignments).toMatchObject([
      { id: "hourly", newStartsAt: at(19), newEndsAt: at(21), newTotalCompensationCents: 20_000, windowAdjusted: true },
      { id: "fixed", newStartsAt: at(20), newEndsAt: at(22), newTotalCompensationCents: 30_000, windowAdjusted: true },
    ]);
  });

  it("preserves Assignment hours and totals when the new Shift still contains them", () => {
    const plan = planShiftTimeEdit({
      oldStartsAt: at(18),
      oldEndsAt: at(22),
      newStartsAt: at(17),
      newEndsAt: at(23),
      clientRateCents: 15_000,
      assignments: [{
        id: "assignment",
        label: "Artist",
        startsAt: at(19),
        endsAt: at(21),
        compensationType: "hourly",
        talentRateCents: 8_000,
        fixedFeeCents: null,
        totalCompensationCents: 16_000,
      }],
    });

    expect(plan.assignments[0]).toMatchObject({
      newStartsAt: at(19),
      newEndsAt: at(21),
      newTotalCompensationCents: 16_000,
      windowAdjusted: false,
    });
  });

  it("recomputes windows that cross midnight", () => {
    const nextDay = (hour: number) => new Date(Date.UTC(2026, 8, 13, hour));
    const plan = planShiftTimeEdit({
      oldStartsAt: at(22),
      oldEndsAt: nextDay(2),
      newStartsAt: at(23),
      newEndsAt: nextDay(3),
      clientRateCents: 12_000,
      assignments: [{
        id: "overnight",
        label: "Overnight artist",
        startsAt: at(22),
        endsAt: nextDay(2),
        compensationType: "hourly",
        talentRateCents: 8_000,
        fixedFeeCents: null,
        totalCompensationCents: 32_000,
      }],
    });

    expect(plan.newClientBilledTotalCents).toBe(48_000);
    expect(plan.assignments[0]).toMatchObject({ newStartsAt: at(23), newEndsAt: nextDay(2), newTotalCompensationCents: 24_000 });
  });

  it("requires manual handling when an Assignment does not overlap the new window", () => {
    expect(() => planShiftTimeEdit({
      oldStartsAt: at(18),
      oldEndsAt: at(23),
      newStartsAt: at(20),
      newEndsAt: at(23),
      clientRateCents: 20_000,
      assignments: [{
        id: "assignment",
        label: "Early artist",
        startsAt: at(18),
        endsAt: at(20),
        compensationType: "hourly",
        talentRateCents: 10_000,
        fixedFeeCents: null,
        totalCompensationCents: 20_000,
      }],
    })).toThrow("Early artist does not overlap the new Shift window");
  });

  it("rejects invalid Shift windows", () => {
    expect(() => planShiftTimeEdit({
      oldStartsAt: at(18),
      oldEndsAt: at(23),
      newStartsAt: at(22),
      newEndsAt: at(22),
      clientRateCents: 20_000,
      assignments: [],
    })).toThrow("Shift end must be after start.");
  });
});
