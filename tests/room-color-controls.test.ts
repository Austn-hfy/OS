import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("manual room color controls", () => {
  it("lets Calendar users choose a hue while creating a room", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(calendar).toContain("<RoomHuePicker value={newRoomHue}");
    expect(calendar).toContain('formData.set("hue", newRoomHue)');
    expect(calendar).toContain("defaultNewRoomHue");
    expect(calendar).toContain("The next automatic color is preselected.");
  });

  it("moves existing room editing into the weekly grid header", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");
    expect(manager).toContain("residencyRooms.map");
    expect(manager).toContain("daypart-room-color-bar");
    expect(manager).toContain("updateResidencyRoomAction");
    expect(manager).toContain("Edit room");
    expect(manager).toContain("Save room");
    expect(manager).not.toContain("room-color-settings");
    expect(manager).toContain("New room color");
    expect(manager).toContain("roomHue: draft.roomHue");
  });

  it("renames and recolors the room's Dayparts and dated records together", async () => {
    const rooms = await readFile(new URL("../src/services/rooms.ts", import.meta.url), "utf8");
    expect(rooms).toContain("roomDaypartColor(input.hue, index)");
    expect(rooms).toContain("eq(scheduleOccurrences.daypartId, roomDayparts[index].id)");
    expect(rooms).toContain("eq(scheduleOccurrences.roomId, room.id)");
    expect(rooms).toContain("eq(shifts.roomId, room.id)");
    expect(rooms).toContain('action: "residency_room_updated"');
  });

  it("renders the compact pastel room and Daypart choices", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    const styles = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
    expect(calendar).toContain('"--room-fill": roomColor(room.hue, "pale")');
    expect(calendar).toContain('"--room-color": suggestion.color');
    expect(styles).toContain("width: 132px; min-height: 64px");
    expect(styles).toContain("border-left: 4px solid var(--room-color");
  });
});
