import { describe, expect, it } from "vitest";
import { calendarDaypartsHref, monthGrid, monthKeyForDate, monthRange, normalizeCalendarView, normalizeMonthKey, normalizeWeekStart, shiftDateKey, shiftMonthKey, weekDays, weekLabel, weekRange } from "../src/lib/calendar";

describe("company calendar helpers", () => {
  it("builds a complete Sunday-first month grid", () => {
    const days = monthGrid("2026-08");
    expect(days).toHaveLength(42);
    expect(days[0]).toMatchObject({ iso: "2026-07-26", inMonth: false });
    expect(days[6]).toMatchObject({ iso: "2026-08-01", inMonth: true });
    expect(days.at(-1)).toMatchObject({ iso: "2026-09-05", inMonth: false });
  });

  it("moves cleanly across year boundaries", () => {
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
  });

  it("returns exact month query boundaries", () => {
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("rejects malformed month query values", () => {
    expect(normalizeMonthKey("not-a-month", "2026-08")).toBe("2026-08");
  });

  it("normalizes the optional week view and its Sunday start", () => {
    expect(normalizeCalendarView("week")).toBe("week");
    expect(normalizeCalendarView("agenda")).toBe("month");
    expect(normalizeWeekStart("2026-09-02", "2026-09")).toBe("2026-08-30");
  });

  it("builds and navigates exact seven-day ranges across boundaries", () => {
    expect(weekRange("2026-08-30")).toEqual({ from: "2026-08-30", to: "2026-09-05" });
    expect(shiftDateKey("2026-12-27", 7)).toBe("2027-01-03");
    expect(monthKeyForDate("2027-01-03")).toBe("2027-01");
    expect(weekDays("2026-08-30").map((day) => day.iso)).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
  });

  it("labels same-month and cross-month calendar weeks", () => {
    expect(weekLabel("2026-09-06")).toBe("Sep 6–12, 2026");
    expect(weekLabel("2026-08-30")).toBe("Aug 30–Sep 5, 2026");
  });

  it("routes Create New Daypart to the Day Parts tab without opening its create dialog", () => {
    expect(calendarDaypartsHref("test-residency", true)).toBe("/residency/dayparts");
    expect(calendarDaypartsHref("test-residency", false)).toBe("/app/dayparts?mode=hfy&residency=test-residency");
    expect(calendarDaypartsHref("test-residency", true)).not.toContain("create=1");
    expect(calendarDaypartsHref("test-residency", false)).not.toContain("create=1");
  });
});
