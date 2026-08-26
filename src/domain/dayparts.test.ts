import { describe, expect, it } from "vitest";
import {
  clockToMinute,
  formatLocalMinute,
  formatCompactMinuteRange,
  hasOverlappingAssignmentMinutes,
  localDateTimeForMinute,
  projectDaypartSlots,
  resolveAssignmentMinutes,
  resolveEndMinute,
  slotSchedulingStatus,
  validateDaypartRules,
  weekdayForDate,
} from "./dayparts";

describe("Daypart weekly rules", () => {
  it("matches Friday dates without depending on a server timezone", () => {
    expect(weekdayForDate("2026-09-04")).toBe(5);
  });

  it("keeps each weekday's hours independent", () => {
    const rules = validateDaypartRules([
      { weekday: 5, startMinute: 720, endMinute: 1140, defaultDjCount: 2 },
      { weekday: 0, startMinute: 780, endMinute: 1080, defaultDjCount: 2 },
    ]);
    expect(rules[0]).toMatchObject({ weekday: 0, startMinute: 780, endMinute: 1080 });
    expect(rules[1]).toMatchObject({ weekday: 5, startMinute: 720, endMinute: 1140 });
  });

  it("represents Amigo Room through midnight without losing the service date", () => {
    const start = clockToMinute("21:00");
    const end = resolveEndMinute(start, "00:00");
    expect(end).toBe(1440);
    expect(localDateTimeForMinute("2026-09-04", start)).toBe("2026-09-04T21:00");
    expect(localDateTimeForMinute("2026-09-04", end)).toBe("2026-09-05T00:00");
    expect(formatLocalMinute(end)).toBe("12:00 AM");
  });

  it("keeps each DJ's hours inside the full Daypart Shift", () => {
    expect(resolveAssignmentMinutes(720, 1140, "12:00", "15:00")).toEqual({
      startMinute: 720,
      endMinute: 900,
      withinShift: true,
    });
    expect(resolveAssignmentMinutes(720, 1140, "12:00", "20:00").withinShift).toBe(false);
  });

  it("supports individual DJ hours after midnight in an overnight Shift", () => {
    expect(resolveAssignmentMinutes(1260, 1560, "00:00", "02:00")).toEqual({
      startMinute: 1440,
      endMinute: 1560,
      withinShift: true,
    });
  });

  it("formats compact calendar ranges without repeating the meridiem", () => {
    expect(formatCompactMinuteRange(720, 1140)).toBe("12–7 PM");
    expect(formatCompactMinuteRange(1260, 1440)).toBe("9 PM–12 AM");
    expect(formatCompactMinuteRange(750, 900)).toBe("12:30–3 PM");
  });

  it("marks DJ coverage as empty, partial, or filled by time instead of DJ count", () => {
    expect(slotSchedulingStatus(720, 1140, [])).toBe("empty");
    expect(slotSchedulingStatus(720, 1140, [{ startMinute: 720, endMinute: 900 }])).toBe("partial");
    expect(slotSchedulingStatus(720, 1140, [{ startMinute: 720, endMinute: 1140 }])).toBe("filled");
    expect(slotSchedulingStatus(720, 1140, [
      { startMinute: 720, endMinute: 900 },
      { startMinute: 900, endMinute: 1140 },
    ])).toBe("filled");
    expect(slotSchedulingStatus(720, 1140, [
      { startMinute: 720, endMinute: 900 },
      { startMinute: 930, endMinute: 1140 },
    ])).toBe("partial");
  });

  it("detects overlapping DJs but allows back-to-back handoffs", () => {
    expect(hasOverlappingAssignmentMinutes([
      { startMinute: 720, endMinute: 900 },
      { startMinute: 720, endMinute: 1140 },
    ])).toBe(true);
    expect(hasOverlappingAssignmentMinutes([
      { startMinute: 720, endMinute: 900 },
      { startMinute: 900, endMinute: 1140 },
    ])).toBe(false);
  });

  it("rejects incomplete or duplicate rules", () => {
    expect(() => validateDaypartRules([])).toThrow(/at least one/);
    expect(() => validateDaypartRules([
      { weekday: 5, startMinute: 720, endMinute: 1140, defaultDjCount: 2 },
      { weekday: 5, startMinute: 780, endMinute: 1080, defaultDjCount: 1 },
    ])).toThrow(/more than once/);
  });

  it("projects active Dayparts onto their weekdays without creating real records", () => {
    const slots = projectDaypartSlots([{
      id: "pool-music",
      name: "Pool Music",
      room: "Pool",
      color: "#2783DC",
      active: true,
      activeUntil: null,
      defaultTalentRateCents: 9_000,
      rules: [
        { weekday: 5, startMinute: 720, endMinute: 1140, defaultDjCount: 2 },
        { weekday: 6, startMinute: 720, endMinute: 1140, defaultDjCount: 1 },
      ],
    }], "2026-09-03", "2026-09-06");

    expect(slots.map((slot) => slot.date)).toEqual(["2026-09-04", "2026-09-05"]);
    expect(slots[0]).toMatchObject({
      id: "projected:pool-music:2026-09-04",
      color: "#2783DC",
      defaultTalentRateCents: 9_000,
      defaultDjCount: 2,
    });
  });

  it("keeps Active until inclusive and suppresses filled or inactive projections", () => {
    const base = {
      id: "vinyl",
      name: "Vinyl Night",
      room: "Lounge",
      color: "#E98332",
      defaultTalentRateCents: null,
      rules: [{ weekday: 4, startMinute: 1200, endMinute: 1440, defaultDjCount: 1 }],
    };
    const existing = new Set(["vinyl:2026-09-03"]);
    expect(projectDaypartSlots([{ ...base, active: true, activeUntil: "2026-09-03" }], "2026-09-03", "2026-09-10", existing)).toEqual([]);
    expect(projectDaypartSlots([{ ...base, active: true, activeUntil: "2026-09-03" }], "2026-09-03", "2026-09-10")).toHaveLength(1);
    expect(projectDaypartSlots([{ ...base, active: false, activeUntil: null }], "2026-09-03", "2026-09-10")).toEqual([]);
  });
});
