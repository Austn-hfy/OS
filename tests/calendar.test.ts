import { describe, expect, it } from "vitest";
import { calendarDaypartsHref, monthGrid, monthRange, normalizeMonthKey, shiftMonthKey } from "../src/lib/calendar";

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

  it("routes Create New Daypart to the Day Parts tab without opening its create dialog", () => {
    expect(calendarDaypartsHref("test-residency", true)).toBe("/residency/dayparts");
    expect(calendarDaypartsHref("test-residency", false)).toBe("/app/dayparts?mode=hfy&residency=test-residency");
    expect(calendarDaypartsHref("test-residency", true)).not.toContain("create=1");
    expect(calendarDaypartsHref("test-residency", false)).not.toContain("create=1");
  });
});
