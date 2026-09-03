import { and, asc, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, dayparts, residencies, rooms } from "@/db/schema";
import { isRoomHue, roomDaypartColor, roomHueForIndex, type RoomHue } from "@/domain/dayparts";
import type { AuditActor } from "@/lib/auth";

type Database = ReturnType<typeof getDb>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ResidencyRoom = {
  id: string;
  residencyId: string;
  name: string;
  hue: RoomHue;
  sortOrder: number;
  daypartCount: number;
};

function normalizeRoomName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Name this room or space before continuing.");
  if (name.length > 160) throw new Error("Room names must be 160 characters or fewer.");
  return name;
}

function safeHue(value: string): RoomHue {
  if (!isRoomHue(value)) throw new Error("This room has an invalid color assignment.");
  return value;
}

export async function getRoomsForResidency(residencyId: string): Promise<ResidencyRoom[]> {
  const rows = await getDb().select({
    id: rooms.id,
    residencyId: rooms.residencyId,
    name: rooms.name,
    hue: rooms.hue,
    sortOrder: rooms.sortOrder,
    daypartCount: count(dayparts.id),
  }).from(rooms)
    .leftJoin(dayparts, eq(dayparts.roomId, rooms.id))
    .where(eq(rooms.residencyId, residencyId))
    .groupBy(rooms.id)
    .orderBy(asc(rooms.sortOrder), asc(rooms.name));
  return rows.map((room) => ({ ...room, hue: safeHue(room.hue), daypartCount: Number(room.daypartCount) }));
}

export async function findOrCreateResidencyRoom(
  tx: DatabaseTransaction,
  residencyId: string,
  requestedName: string,
  requestedId?: string | null,
) {
  const name = normalizeRoomName(requestedName);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${residencyId}, 0))`);

  if (requestedId) {
    const [selected] = await tx.select({
      id: rooms.id,
      residencyId: rooms.residencyId,
      name: rooms.name,
      hue: rooms.hue,
      sortOrder: rooms.sortOrder,
    }).from(rooms).where(and(eq(rooms.id, requestedId), eq(rooms.residencyId, residencyId))).limit(1);
    if (!selected) throw new Error("That room is no longer available in this Residency.");
    if (selected.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()) return { ...selected, hue: safeHue(selected.hue) };
  }

  const [existing] = await tx.select({
    id: rooms.id,
    residencyId: rooms.residencyId,
    name: rooms.name,
    hue: rooms.hue,
    sortOrder: rooms.sortOrder,
  }).from(rooms).where(and(
    eq(rooms.residencyId, residencyId),
    sql`lower(btrim(${rooms.name})) = lower(${name})`,
  )).limit(1);
  if (existing) return { ...existing, hue: safeHue(existing.hue) };

  const [{ nextSortOrder }] = await tx.select({
    nextSortOrder: sql<number>`coalesce(max(${rooms.sortOrder}), -1) + 1`,
  }).from(rooms).where(eq(rooms.residencyId, residencyId));
  const sortOrder = Number(nextSortOrder);
  const [created] = await tx.insert(rooms).values({
    residencyId,
    name,
    hue: roomHueForIndex(sortOrder),
    sortOrder,
  }).returning({
    id: rooms.id,
    residencyId: rooms.residencyId,
    name: rooms.name,
    hue: rooms.hue,
    sortOrder: rooms.sortOrder,
  });
  return { ...created, hue: safeHue(created.hue) };
}

export async function nextRoomDaypartColor(tx: DatabaseTransaction, roomId: string): Promise<string> {
  const [{ itemCount }] = await tx.select({ itemCount: count(dayparts.id) }).from(dayparts).where(eq(dayparts.roomId, roomId));
  const [room] = await tx.select({ hue: rooms.hue }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room) throw new Error("Room not found.");
  return roomDaypartColor(safeHue(room.hue), Number(itemCount));
}

export async function createResidencyRoom(actor: AuditActor, input: { residencyId: string; name: string }): Promise<ResidencyRoom> {
  return getDb().transaction(async (tx) => {
    const [residency] = await tx.select({ id: residencies.id }).from(residencies).where(and(
      eq(residencies.id, input.residencyId),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    )).limit(1);
    if (!residency) throw new Error("Residency not found.");
    const room = await findOrCreateResidencyRoom(tx, residency.id, input.name);
    const [{ itemCount }] = await tx.select({ itemCount: count(dayparts.id) }).from(dayparts).where(eq(dayparts.roomId, room.id));
    await tx.insert(auditLog).values({
      residencyId: residency.id,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "residency_room_created",
      entityType: "room",
      entityId: room.id,
      details: { name: room.name, hue: room.hue, sortOrder: room.sortOrder },
    });
    return { ...room, daypartCount: Number(itemCount) };
  });
}
