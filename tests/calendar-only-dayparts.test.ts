import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { projectDaypartSlots } from "@/domain/dayparts";

describe("Calendar Only Dayparts", () => {
  it("uses plain schedule labels throughout the shared Daypart manager", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");
    expect(manager).toContain("<strong>Recurring Daypart</strong>");
    expect(manager).toContain("<strong>One-off / Occasional activity</strong>");
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
    expect(calendar).toContain("This One-off / Occasional Daypart will be added only to");
  });

  it("keeps client artist selection and Request HFY mutually exclusive", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(calendar).toContain("clientArtistFlow");
    expect(calendar).toContain("previewMode && !clientArtistFlow");
    expect(calendar).toContain("Back to handling options");
  });

  it("starts date scheduling with rooms and scopes Dayparts to the selected room", async () => {
    const [calendar, styles] = await Promise.all([
      readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    ]);
    expect(calendar).toContain('addMode === "choose" ? "Choose a room"');
    expect(calendar).toContain("const roomOptions = useMemo");
    expect(calendar).toContain("selectedRoomSuggestions.map");
    expect(calendar).toContain("Choose a room to see only the Dayparts set up for that space.");
    expect(calendar).toContain("chooseOneTime(selectedRoom ?? undefined)");
    expect(calendar).toContain("Create a one-time activity in {selectedRoom}.");
    expect(calendar).not.toContain("Use a setup Daypart");
    expect(styles).toContain(".quick-room-picker");
    expect(styles).toContain(".quick-room-option.other");
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
});
