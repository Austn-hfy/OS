import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { projectDaypartSlots } from "@/domain/dayparts";

describe("Calendar Only Dayparts", () => {
  it("distinguishes reusable templates from ad-hoc calendar activities", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");
    expect(manager).toContain("<strong>Recurring Daypart</strong>");
    expect(manager).toContain("<strong>Reusable One-off Template</strong>");
    expect(manager).toContain("Save this as a reusable one-off template you can schedule onto any date later.");
    expect(manager).not.toContain("Saved for later");
    expect(manager).not.toContain('className="calendar-only-dayparts"');
    expect(manager).toContain('{draft.type ? <div className="field daypart-schedule-step">');
    expect(manager).not.toContain('draft.type && (draft.type === "house_activity" || draft.billingMode) ? <div className="field daypart-schedule-step"');
    expect(manager).not.toContain("<strong>Standing weekly</strong>");
    expect(manager).not.toContain("<strong>Calendar Only</strong>");
  });

  it("keeps reusable templates quiet and scoped to each room", async () => {
    const [manager, styles] = await Promise.all([
      readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    ]);
    expect(manager).not.toContain("Dayparts and templates");
    expect(manager).not.toContain("Reusable template is listed above");
    expect(manager).not.toContain("Click open space to add");
    expect(manager).toContain("daypart.roomId === room.id");
    expect(manager).toContain("roomTemplates.length ? <button");
    expect(manager).toContain('className="room-template-trigger"');
    expect(manager).toContain('roomTemplates.length === 1 ? "template" : "templates"');
    expect(manager).toContain('className="room-template-popover"');
    expect(manager).toContain('daypart.type === "house_activity" ? "House Activity" : "Talent Activity"');
    expect(manager).toContain("<em>Default hours</em>");
    expect(styles).toContain(".room-template-popover { position: fixed;");
  });

  it("explains that reusable template settings are editable defaults", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");
    expect(manager).toContain("Template defaults only");
    expect(manager).toContain("Saving changes here never updates dates already scheduled");
    expect(manager).toContain("you can override the time or details for any individual date");
    expect(manager).toContain("Recommended default hours");
    expect(manager).toContain('draft.scheduleMode === "calendar_only" ? "Save template" : "Save Daypart"');
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

  it("uses a room-first funnel with searchable existing rooms and explicit creation", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(calendar).toContain('addMode === "room" ? "Where is this happening?"');
    expect(calendar).toContain('addMode === "activity" ? "What\'s happening here?"');
    expect(calendar).toContain("<RoomCombobox rooms={availableRooms}");
    expect(calendar).toContain("onCreate={openNewRoomPrompt}");
    expect(calendar).toContain("A new room is created only when you explicitly choose that option.");
    expect(calendar).toContain("roomSuggestions.map");
    expect(calendar).toContain("<strong>Create new</strong>");
    expect(calendar).toContain("createResidencyRoomAction");
  });

  it("uses Mark scheduled for both one-time activity types", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(calendar).toContain('activeSuggestion.oneTime ? "Mark scheduled"');
    expect(calendar).not.toContain('activeSuggestion.oneTime ? `Save');
    expect(calendar).not.toContain('"Save Daypart"');
  });

  it("removes the redundant toolbar launcher while preserving the two established creation paths", async () => {
    const [calendar, manager, monthCalendar] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/month-calendar.tsx", import.meta.url), "utf8"),
    ]);
    expect(calendar).not.toContain("+ Create New Daypart");
    expect(calendar).not.toContain("<DayPartsPanel");
    expect(calendar).toContain("onDateClick={canManage ? openDate : undefined}");
    expect(manager).toContain("+ Add Daypart");
    expect(monthCalendar).toContain('className="calendar-add-icon"');
  });

  it("organizes the Calendar toolbar into left, center, and right clusters", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(calendar).toContain('className="calendar-toolbar-cluster calendar-toolbar-filters"');
    expect(calendar).toContain('className="calendar-toolbar-cluster calendar-toolbar-view"');
    expect(calendar).toContain('className="calendar-toolbar-cluster calendar-toolbar-actions"');
    expect(calendar).toContain('<span>Status</span><select id="calendar-status-filter"');
    expect(calendar).toContain('<span>Daypart</span><select id="calendar-daypart-filter"');
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
