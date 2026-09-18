import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("calendar scheduling status visuals", () => {
  it("uses neutral event pills, Daypart category rails, and attention-only status marks", async () => {
    const [globals, pilot, legend] = await Promise.all([
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
      readFile(new URL("../src/components/calendar-status-legend.tsx", import.meta.url), "utf8"),
    ]);

    expect(globals).toContain(".calendar-event.schedule-empty, .calendar-event.schedule-partial, .calendar-event.schedule-filled");
    expect(globals).toContain(".calendar-attention-indicator");
    expect(globals).not.toContain(".calendar-event.schedule-filled .calendar-event-line::after");
    expect(globals).toContain("border-left-color: var(--daypart-color, #2783dc)");
    expect(pilot).toContain(".calendar-event:is(.schedule-empty, .schedule-partial, .schedule-filled)");
    expect(pilot).toContain("HFY state stays secondary to the Daypart category rail");
    expect(legend).toContain("Color rail: Daypart identity");
    expect(legend).toContain("Orange mark: needs or partially scheduled");
    expect(legend).toContain("No status mark: scheduled");
    expect(legend).toContain("Outlined pink dot: HFY request pending");
    expect(legend).toContain("Filled pink dot: HFY booked");
    expect(legend).toContain('<summary role="button" aria-label="Color key" title="Color key">');
    expect(legend).not.toContain("<summary>Color key</summary>");
  });

  it("retains room fills and distinguishes pending and fulfilled HFY markers", async () => {
    const [globals, pilot, month] = await Promise.all([
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
      readFile(new URL("../src/components/month-calendar.tsx", import.meta.url), "utf8"),
    ]);

    expect(pilot).toContain("HFY state stays secondary to the Daypart category rail");
    expect(globals).toContain(".hfy-booking-indicator");
    expect(globals).toContain(".hfy-pending .hfy-booking-indicator");
    expect(month).toContain('event.bookingState === "hfy_pending" ? "HFY request pending" : "HFY booked"');
    expect(pilot).not.toContain("var(--daypart-color, #ec4899) 42%");
  });
});
