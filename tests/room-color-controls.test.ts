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

  it("lets Day Parts users choose new-room hues and change existing room hues", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");
    expect(manager).toContain("residencyRooms.map");
    expect(manager).toContain("updateResidencyRoomHueAction");
    expect(manager).toContain("Save room color");
    expect(manager).toContain("New room color");
    expect(manager).toContain("roomHue: draft.roomHue");
  });

  it("recolors the room's Dayparts and dated occurrences together", async () => {
    const rooms = await readFile(new URL("../src/services/rooms.ts", import.meta.url), "utf8");
    expect(rooms).toContain("roomDaypartColor(input.hue, index)");
    expect(rooms).toContain("eq(scheduleOccurrences.daypartId, roomDayparts[index].id)");
    expect(rooms).toContain('action: "residency_room_hue_updated"');
  });
});
