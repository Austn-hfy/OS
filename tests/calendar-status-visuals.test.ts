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
    expect(legend).toContain("Outlined pink dot: HFY request pending");
    expect(legend).toContain("Filled pink dot: HFY booked");
    expect(legend).toContain('<summary aria-label="Color key" title="Color key">');
    expect(legend).not.toContain("<summary>Color key</summary>");
  });

  it("retains distinct pending and fulfilled HFY colors", async () => {
    const pilot = await readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8");

    expect(pilot).toContain(".calendar-event.hfy-pending");
    expect(pilot).toContain("var(--daypart-color, #f9a8d4) 20%");
    expect(pilot).toContain(".calendar-event.hfy-confirmed");
    expect(pilot).toContain("var(--daypart-color, #ec4899) 42%");
  });
});
