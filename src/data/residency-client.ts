import "server-only";

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, dayparts, shifts, talent } from "@/db/schema";

export async function getResidencyClientCalendar(residencyId: string, range: { from: string; to: string }) {
  const database = getDb();
  const shiftRows = await database.select({
    id: shifts.id,
    daypartId: shifts.daypartId,
    daypartName: dayparts.name,
    daypartColor: dayparts.color,
    calendarColor: shifts.calendarColor,
    name: shifts.name,
    serviceDate: shifts.serviceDate,
    room: shifts.room,
    startsAt: shifts.startsAt,
    endsAt: shifts.endsAt,
  }).from(shifts)
    .leftJoin(dayparts, eq(shifts.daypartId, dayparts.id))
    .where(and(eq(shifts.residencyId, residencyId), gte(shifts.serviceDate, range.from), lte(shifts.serviceDate, range.to)))
    .orderBy(asc(shifts.startsAt));
  const shiftIds = shiftRows.map((shift) => shift.id);
  const assignmentRows = shiftIds.length ? await database.select({
    id: assignments.id,
    shiftId: assignments.shiftId,
    talentName: talent.stageName,
    guestName: assignments.guestName,
    startsAt: assignments.startsAt,
    endsAt: assignments.endsAt,
    bookingStatus: assignments.bookingStatus,
  }).from(assignments)
    .leftJoin(talent, eq(assignments.talentId, talent.id))
    .where(inArray(assignments.shiftId, shiftIds))
    .orderBy(asc(assignments.startsAt)) : [];

  return shiftRows.map((shift) => ({
    ...shift,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
    assignments: assignmentRows.filter((assignment) => assignment.shiftId === shift.id).map((assignment) => ({
      id: assignment.id,
      talentName: assignment.talentName,
      guestName: assignment.guestName,
      startsAt: assignment.startsAt.toISOString(),
      endsAt: assignment.endsAt.toISOString(),
      bookingStatus: assignment.bookingStatus,
    })),
  }));
}

export async function getResidencyClientOverview(residencyId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await getDb().select({ serviceDate: shifts.serviceDate }).from(shifts).where(and(
    eq(shifts.residencyId, residencyId),
    gte(shifts.serviceDate, today),
  )).orderBy(asc(shifts.serviceDate));
  return { upcomingServiceCount: rows.length, nextServiceDate: rows[0]?.serviceDate ?? null };
}
