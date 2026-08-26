import { describe, expect, it } from "vitest";
import { hasReachedDailyRunWindow, isPastServiceDate, localDateKey, zonedLocalDateTimeToUtc } from "./time";

describe("residency-local automation schedule", () => {
  it("runs after 6 a.m. Pacific during daylight saving time", () => {
    const before = new Date("2026-08-21T12:59:00.000Z");
    const after = new Date("2026-08-21T13:00:00.000Z");
    expect(hasReachedDailyRunWindow(before, "America/Los_Angeles")).toBe(false);
    expect(hasReachedDailyRunWindow(after, "America/Los_Angeles")).toBe(true);
  });

  it("derives the local date without hand-coded UTC offsets", () => {
    expect(localDateKey(new Date("2026-01-15T07:30:00.000Z"), "America/Los_Angeles")).toBe("2026-01-14");
    expect(localDateKey(new Date("2026-08-21T07:30:00.000Z"), "America/Los_Angeles")).toBe("2026-08-21");
  });

  it("matches Airtable's date-before-today past-due rule", () => {
    const now = new Date("2026-08-21T15:00:00.000Z");
    expect(isPastServiceDate("2026-08-20", now, "America/Los_Angeles")).toBe(true);
    expect(isPastServiceDate("2026-08-21", now, "America/Los_Angeles")).toBe(false);
  });

  it("converts a Residency-local time to UTC across seasonal offsets", () => {
    expect(zonedLocalDateTimeToUtc("2026-08-21T12:00", "America/Los_Angeles").toISOString()).toBe("2026-08-21T19:00:00.000Z");
    expect(zonedLocalDateTimeToUtc("2026-01-21T12:00", "America/Los_Angeles").toISOString()).toBe("2026-01-21T20:00:00.000Z");
  });
});
