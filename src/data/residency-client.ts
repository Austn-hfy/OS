import "server-only";

import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, dayparts, residencyContacts, shifts, talent, users } from "@/db/schema";
import { projectClientSafeRoster } from "@/domain/client-safe-talent";

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

export async function getResidencyClientSafeRoster(residencyId: string) {
  const rows = await getDb().select({
    id: talent.id,
    stageName: talent.stageName,
    homeMarket: talent.homeMarket,
    genres: talent.genres,
    instagramHandle: talent.instagramHandle,
  }).from(talent)
    .where(and(
      eq(talent.talentStatus, "active"),
      isNull(talent.archivedAt),
      or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, residencyId)),
    ))
    .orderBy(asc(talent.stageName));
  return projectClientSafeRoster(rows);
}

export async function getResidencyClientVisibleAccessContacts(residencyId: string) {
  return getDb().select({
    name: residencyContacts.name,
    title: residencyContacts.title,
    accessRole: residencyContacts.accessRole,
    isPrimary: residencyContacts.isPrimary,
  }).from(residencyContacts)
    .leftJoin(users, eq(residencyContacts.userId, users.id))
    .where(and(
      eq(residencyContacts.residencyId, residencyId),
      eq(residencyContacts.active, true),
      or(isNull(residencyContacts.userId), eq(users.isInternalTest, false)),
    ))
    .orderBy(asc(residencyContacts.name));
}

export async function getResidencyClientPayoutStatus(residencyId: string) {
  const rows = await getDb().select({
    id: assignments.id,
    artist: talent.stageName,
    serviceDate: shifts.serviceDate,
    startsAt: assignments.startsAt,
    endsAt: assignments.endsAt,
    payoutStatus: assignments.payoutStatus,
    paidAt: assignments.paidAt,
  }).from(assignments)
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .leftJoin(talent, eq(assignments.talentId, talent.id))
    .where(and(eq(shifts.residencyId, residencyId), inArray(assignments.bookingStatus, ["confirmed", "completed"])))
    .orderBy(asc(shifts.serviceDate), asc(assignments.startsAt));
  return rows.map((row) => ({
    id: row.id,
    artist: row.artist ?? "Unassigned",
    serviceDate: row.serviceDate,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.payoutStatus === "paid" ? "Paid" as const : "Pending" as const,
    paidAt: row.paidAt?.toISOString() ?? null,
  }));
}
