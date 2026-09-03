import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { rankedRoomMatches, roomMatchScore, type RoomComboboxOption } from "@/components/room-combobox";

describe("room selection safeguards", () => {
  it("ranks exact, partial, and small typo matches ahead of unrelated rooms", () => {
    expect(roomMatchScore("Amigo Room", "Amigo Room")).toBe(0);
    expect(roomMatchScore("Amigo", "Amigo Room")).toBe(1);
    expect(roomMatchScore("Amgio Room", "Amigo Room")).toBeLessThan(4);
    expect(roomMatchScore("Rooftop", "Amigo Room")).toBe(4);
  });

  it("shows all rooms before typing and removes unrelated rooms afterward", () => {
    const rooms: RoomComboboxOption[] = [
      { id: "amigo", name: "Amigo Room", hue: "orange" },
      { id: "lobby", name: "Lobby", hue: "yellow" },
      { id: "pool", name: "Pool", hue: "blue" },
    ];
    expect(rankedRoomMatches("", rooms).map(({ room }) => room.name)).toEqual(["Amigo Room", "Lobby", "Pool"]);
    expect(rankedRoomMatches("Po", rooms).map(({ room }) => room.name)).toEqual(["Pool"]);
    expect(rankedRoomMatches("Amgio Room", rooms).map(({ room }) => room.name)).toEqual(["Amigo Room"]);
    expect(rankedRoomMatches("patio", rooms)).toEqual([]);
  });

  it("shows existing spaces and makes new-space creation explicit", async () => {
    const combobox = await readFile(new URL("../src/components/room-combobox.tsx", import.meta.url), "utf8");
    expect(combobox).toContain('role="combobox"');
    expect(combobox).toContain('role="listbox"');
    expect(combobox).toContain("Similar room found:");
    expect(combobox).toContain("Create “{trimmedValue}”");
    expect(combobox).toContain("Choose an existing room from the list, or explicitly create a new space.");
    expect(combobox).toContain('onMouseDown={(event) => event.preventDefault()}');
  });

  it("uses the picker for Calendar additions, one-time edits, and Daypart editing", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    const dayparts = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");
    expect(calendar.match(/<RoomCombobox/g)).toHaveLength(2);
    expect(calendar).toContain("creationConfirmed={newRoomPromptOpen}");
    expect(calendar).toContain("function chooseRoom(room: RoomComboboxOption)");
    expect(calendar).toContain("setNewRoomName(room.name)");
    expect(calendar).toContain("onSelect={chooseRoom}");
    expect(calendar).toContain("editingOneTimeRoomReady");
    expect(dayparts).toContain("creationConfirmed={draft.createRoom}");
    expect(dayparts).toContain("disabled={pending || !hasSelectedRoom}");
  });

  it("keeps Calendar room choices inside a full-height responsive picker", async () => {
    const calendar = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    const styles = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
    expect(calendar).toContain("quick-modal-room-picker");
    expect(styles).toContain(".quick-modal.quick-modal-room-picker");
    expect(styles).toContain(".quick-modal.quick-modal-room-picker { height: auto; }");
    expect(styles).toContain(".room-combobox.open .room-combobox-options");
    expect(styles).toContain("position: static");
    expect(styles).toContain("@media (max-height: 700px)");
  });

  it("rejects silent creation in the scheduling services", async () => {
    const rooms = await readFile(new URL("../src/services/rooms.ts", import.meta.url), "utf8");
    const dayparts = await readFile(new URL("../src/services/dayparts.ts", import.meta.url), "utf8");
    const bookings = await readFile(new URL("../src/services/residency-bookings.ts", import.meta.url), "utf8");
    expect(rooms).toContain("if (!allowCreate)");
    expect(rooms).toContain("select the create-new-space option");
    expect(dayparts).toContain("input.createRoom === true");
    expect(bookings).toContain("input.createRoom === true");
    expect(bookings).toContain("requested.roomId, undefined, false");
  });
});
