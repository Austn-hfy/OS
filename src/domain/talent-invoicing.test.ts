import { describe, expect, it } from "vitest";
import { calendarMonthPeriod, carryForwardAdjustmentDescription, isFullCalendarMonth } from "./talent-invoicing";

describe("Full Programming talent invoicing", () => {
  it("resolves complete calendar months, including leap years", () => {
    expect(calendarMonthPeriod("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(isFullCalendarMonth("2026-09-01", "2026-09-30")).toBe(true);
    expect(isFullCalendarMonth("2026-09-02", "2026-09-30")).toBe(false);
    expect(() => calendarMonthPeriod("2026-13")).toThrow("valid service month");
  });

  it("labels additions, credits, and hours changes for the next invoice", () => {
    const input = { serviceDate: "2026-09-10", shiftName: "Pool Set" };
    expect(carryForwardAdjustmentDescription({ ...input, kind: "added" })).toContain("Added after invoice");
    expect(carryForwardAdjustmentDescription({ ...input, kind: "cancelled" })).toContain("Credit for cancellation");
    expect(carryForwardAdjustmentDescription({ ...input, kind: "hours_changed" })).toContain("Schedule change");
  });
});
