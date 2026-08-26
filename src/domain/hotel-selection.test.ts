import { describe, expect, it } from "vitest";
import { validateSelectionWindow } from "./hotel-selection";

const shift = {
  startsAt: new Date("2026-09-01T19:00:00.000Z"),
  endsAt: new Date("2026-09-02T02:00:00.000Z"),
};
const now = new Date("2026-08-21T12:00:00.000Z");

describe("hotel selection boundaries", () => {
  it("accepts a future selection within the pre-created Shift", () => {
    expect(validateSelectionWindow({
      shiftId: "00000000-0000-4000-8000-000000000001",
      talentId: "00000000-0000-4000-8000-000000000002",
      startsAt: "2026-09-01T20:00:00.000Z",
      endsAt: "2026-09-01T23:00:00.000Z",
    }, shift, now)).toBeNull();
  });

  it("rejects a time outside the Shift", () => {
    expect(validateSelectionWindow({
      shiftId: "00000000-0000-4000-8000-000000000001",
      talentId: "00000000-0000-4000-8000-000000000002",
      startsAt: "2026-09-01T18:00:00.000Z",
      endsAt: "2026-09-01T23:00:00.000Z",
    }, shift, now)).toMatch(/within/);
  });

  it("rejects a reversed time", () => {
    expect(validateSelectionWindow({
      shiftId: "00000000-0000-4000-8000-000000000001",
      talentId: "00000000-0000-4000-8000-000000000002",
      startsAt: "2026-09-01T23:00:00.000Z",
      endsAt: "2026-09-01T20:00:00.000Z",
    }, shift, now)).toMatch(/after/);
  });
});
