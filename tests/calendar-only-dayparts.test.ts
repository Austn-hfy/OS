import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { projectDaypartSlots } from "@/domain/dayparts";

describe("Calendar Only Dayparts", () => {
  it("distinguishes reusable templates from ad-hoc calendar activities", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");
    expect(manager).toContain("<strong>Recurring Daypart</strong>");
    expect(manager).toContain("<strong>Reusable One-off Template</strong>");
    expect(manager).toContain("Save this as a reusable one-off template you can schedule onto any date later.");
    expect(manager).toContain("Reusable one-off templates");
    expect(manager).toContain('{draft.type ? <div className="field daypart-schedule-step">');
    expect(manager).not.toContain('draft.type && (draft.type === "house_activity" || draft.billingMode) ? <div className="field daypart-schedule-step"');
    expect(manager).not.toContain("<strong>Standing weekly</strong>");
    expect(manager).not.toContain("<strong>Calendar Only</strong>");
  });

  it("never projects recurring calendar slots", () => {
    const slots = projectDaypartSlots([{
      id: "calendar-only",
      name: "Commune Pool",
      room: "Pool",
      color: "#7A65D1",
      type: "house_activity",
      billingMode: null,
      scheduleMode: "calendar_only",
      active: true,
      activeUntil: null,
      defaultTalentRateCents: null,
      rules: [],
    }], "2026-09-01", "2026-09-30");
    expect(slots).toEqual([]);
  });

  it("appears in the date picker with suggested hours", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(calendar).toContain('daypart.scheduleMode === "calendar_only"');
    expect(calendar).toContain("suggestedStartMinute");
    expect(calendar).toContain("This reusable Daypart template will be added only to");
  });

  it("keeps client artist selection and Request HFY mutually exclusive", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(calendar).toContain("clientArtistFlow");
    expect(calendar).toContain("previewMode && !clientArtistFlow");
    expect(calendar).toContain("Back to handling options");
  });

  it("uses a room-first funnel with permanent create tiles last", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(calendar).toContain('addMode === "room" ? "Where is this happening?"');
    expect(calendar).toContain('addMode === "activity" ? "What\'s happening here?"');
    expect(calendar).toContain("availableRooms.map");
    expect(calendar).toContain("roomSuggestions.map");
    expect(calendar).toContain("<strong>Other / new space</strong>");
    expect(calendar).toContain("<strong>Create new</strong>");
    expect(calendar).toContain("createResidencyRoomAction");
    expect(calendar.indexOf("availableRooms.map")).toBeLessThan(calendar.indexOf("<strong>Other / new space</strong>"));
  });

  it("uses Mark scheduled for both one-time activity types", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(calendar).toContain('activeSuggestion.oneTime ? "Mark scheduled"');
    expect(calendar).not.toContain('activeSuggestion.oneTime ? `Save');
    expect(calendar).not.toContain('"Save Daypart"');
  });

  it("opens the shared Daypart creation panel without leaving Calendar", async () => {
    const [calendar, panel] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/day-parts-panel.tsx", import.meta.url), "utf8"),
    ]);
    expect(calendar).toContain("setDaypartsPanelOpen(true)");
    expect(calendar).toContain("<DayPartsPanel");
    expect(calendar).toContain("initialCreate");
    expect(calendar).not.toContain("calendarDaypartsHref");
    expect(panel).toContain("fullProgrammingClient={fullProgrammingClient}");
    expect(panel).toContain("if (onSaved) onSaved()");
  });

  it("provides update and delete actions for both one-time record types", async () => {
    const [calendar, actions] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/actions.ts", import.meta.url), "utf8"),
    ]);
    expect(calendar).toContain("Save session changes");
    expect(calendar).toContain("Delete activity");
    expect(actions).toContain("updateOneTimeShiftAction");
    expect(actions).toContain("updateOneTimeOccurrenceAction");
    expect(actions).toContain("deleteOneTimeOccurrenceAction");
  });

  it("keeps edit controls while removing manual color choice from the new flow", async () => {
    const [calendar, styles] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    ]);
    expect(calendar).toContain("function SchedulingActivityDetailsRow");
    expect(calendar.match(/<SchedulingActivityDetailsRow/g)).toHaveLength(1);
    expect(calendar).toContain("<label>Color</label>");
    expect(calendar).toContain("<label>Session name</label>");
    expect(calendar).toContain("<label>Slot time</label>");
    expect(calendar).toContain("Color is assigned automatically from this room.");
    expect(calendar).toContain('className="quick-new-activity-details"');
    expect(styles).toContain(".quick-activity-details-row");
    expect(styles).toContain("grid-template-columns: 66px");
  });
});
