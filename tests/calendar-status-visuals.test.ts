import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("calendar scheduling status visuals", () => {
  it("keeps one strong Daypart color across scheduling states and reserves the check for filled slots", async () => {
    const [globals, pilot, legend] = await Promise.all([
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
      readFile(new URL("../src/components/calendar-status-legend.tsx", import.meta.url), "utf8"),
    ]);

    expect(globals).toContain(".calendar-event.schedule-empty, .calendar-event.schedule-partial, .calendar-event.schedule-filled");
    expect(globals).toContain(".calendar-event.schedule-filled .calendar-event-line::after");
    expect(globals).not.toMatch(/\.calendar-event\.schedule-partial\s*\{[\s\S]*?36%/);
    expect(globals).not.toMatch(/\.calendar-event\.schedule-filled\s*\{[\s\S]*?14%/);
    expect(pilot).toContain(".calendar-event:is(.schedule-empty, .schedule-partial, .schedule-filled)");
    expect(pilot).not.toMatch(/\.calendar-event\.schedule-partial\s*\{/);
    expect(legend).toContain("Color: Daypart identity");
    expect(legend).toContain("No check: needs or partially scheduled");
    expect(legend).toContain("Checkmark: scheduled");
  });

  it("retains room fills and distinguishes pending and fulfilled HFY markers", async () => {
    const [globals, pilot, month] = await Promise.all([
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
      readFile(new URL("../src/components/month-calendar.tsx", import.meta.url), "utf8"),
    ]);

    expect(pilot).toContain("the room color remains the pill fill");
    expect(globals).toContain(".hfy-booking-indicator");
    expect(globals).toContain(".hfy-pending .hfy-booking-indicator");
    expect(month).toContain('event.bookingState === "hfy_pending" ? "HFY request pending" : "HFY booked"');
    expect(pilot).not.toContain("var(--daypart-color, #ec4899) 42%");
  });
});
