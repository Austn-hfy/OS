import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("safe room deletion", () => {
  it("offers deletion from the existing room editor with an explicit confirmation", async () => {
    const manager = await readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8");
    expect(manager).toContain("deleteResidencyRoomAction");
    expect(manager).toContain("Only an empty room can be deleted.");
    expect(manager).toContain("window.confirm");
    expect(manager).toContain('"Delete room"');
  });

  it("blocks deletion while any scheduling record still uses the room", async () => {
    const rooms = await readFile(new URL("../src/services/rooms.ts", import.meta.url), "utf8");
    expect(rooms).toContain("eq(dayparts.roomId, room.id)");
    expect(rooms).toContain("eq(scheduleOccurrences.roomId, room.id)");
    expect(rooms).toContain("eq(shifts.roomId, room.id)");
    expect(rooms).toContain("Move or delete those items first.");
    expect(rooms).toContain("tx.delete(rooms)");
    expect(rooms).toContain('action: "residency_room_deleted"');
  });

  it("authorizes the server action and refreshes every room-aware schedule view", async () => {
    const actions = await readFile(new URL("../src/app/app/actions.ts", import.meta.url), "utf8");
    expect(actions).toContain("export async function deleteResidencyRoomAction");
    expect(actions).toContain("requireActorForResidency(parsed.residencyId, { manager: true })");
    expect(actions).toContain('revalidatePath("/app/dayparts")');
    expect(actions).toContain('revalidatePath("/residency/dayparts")');
  });
});
