import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { pendingBatchScheduleDates } from "@/app/app/calendar/residency-calendar";

describe("Calendar batch scheduling", () => {
  it("returns only unsaved projected dates for the selected Daypart", () => {
    const events = [
      { date: "2026-09-17", daypartId: "vinyl", projected: true },
      { date: "2026-09-03", daypartId: "vinyl", projected: true },
      { date: "2026-09-03", daypartId: "vinyl", projected: true },
      { date: "2026-09-10", daypartId: "vinyl", projected: false },
      { date: "2026-09-24", daypartId: "karaoke", projected: true },
    ];

    expect(pendingBatchScheduleDates(events, "vinyl")).toEqual([
      "2026-09-03",
      "2026-09-17",
    ]);
  });

  it("uses the existing single-date scheduling fields and save action", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");

    expect(calendar).toContain("Schedule all ({selectedDaypartPendingDates.length})");
    expect(calendar).toContain('className="calendar-batch-screen"');
    expect(calendar).toContain('className="calendar-batch-list"');
    expect(calendar).toContain("Save & Next");
    expect(calendar).toContain("All done");
    expect(calendar).toContain("completedDates");
    expect(calendar.match(/\{schedulingFields\}/g)).toHaveLength(2);
    expect(calendar.match(/await bookResidencyDateAction/g)).toHaveLength(1);
  });

  it("keeps the toolbar edges explicitly symmetric", async () => {
    const [styles, pilotStyles] = await Promise.all([
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
    ]);

    expect(styles).toContain("justify-self: stretch");
    expect(styles).toContain("padding-inline: 0");
    expect(styles).toContain("margin-inline-start: 0");
    expect(styles).toContain("margin-inline-end: 0");
    expect(pilotStyles).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(pilotStyles).toContain("justify-items: stretch");
  });

  it("keeps the batch editor interactive, scrollable, and complete for house activities", async () => {
    const [editor, styles, pilotStyles] = await Promise.all([
      readFile(new URL("../src/components/calendar-batch-editor.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
    ]);

    expect(editor).toContain("right.needs - left.needs");
    expect(editor).toContain("expandedEventId === event.id");
    expect(editor).toContain("Program / activity details");
    expect(editor).toContain("Host / guest name");
    expect(editor).toContain("HFY will staff this occurrence");
    expect(editor).toContain("updateDaypartOccurrenceAction");
    expect(editor).toContain("validationRequested && warning");
    expect(editor).toContain("pending || !canManage");
    expect(editor).not.toContain("pending || Boolean(warning)");
    expect(editor).toContain("calendar-batch-progress");
    expect(editor).toContain("is-complete");
    expect(editor).toContain("is-current");
    expect(editor).toContain("is-upcoming");
    expect(styles).toContain(".calendar-batch-editor-list");
    expect(styles).toContain("overflow-y: auto");
    expect(styles).toContain(".calendar-batch-editor-takeover { position: absolute; inset: 0;");
    expect(styles).toContain("cursor: not-allowed");
    expect(pilotStyles).toContain(".hfy-style-system .calendar-batch-menu { border-color: var(--hfy-line); background: #f9fbfc; }");
    expect(pilotStyles).toContain(".calendar-batch-editor-row.is-complete:not(.expanded)");
  });
});
