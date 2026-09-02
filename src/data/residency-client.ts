import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, clientAssignmentTerms, dayparts, invoices, residencies, residencyContacts, residencyTalent, scheduleOccurrences, scheduleOccurrenceTalent, shifts, talent, users } from "@/db/schema";
import { calculateClientOwedCents, resolveClientHourlyRateCents } from "@/domain/client-rates";
import { projectClientSafeRoster, projectClientSafeTalent, type ClientSafeManagedTalent } from "@/domain/client-safe-talent";
import { projectClientSafeInvoice } from "@/domain/client-safe-invoice";

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
    clientContact: talent.clientContact,
    ownership: talent.ownership,
  }).from(talent)
    .innerJoin(residencyTalent, and(
      eq(residencyTalent.talentId, talent.id),
      eq(residencyTalent.residencyId, residencyId),
      eq(residencyTalent.active, true),
    ))
    .where(and(
      eq(talent.talentStatus, "active"),
      isNull(talent.archivedAt),
      or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, residencyId)),
    ))
    .orderBy(asc(talent.stageName));
  return projectClientSafeRoster(rows);
}

export async function getResidencyClientOwnedArtistManagement(residencyId: string): Promise<ClientSafeManagedTalent[]> {
  const database = getDb();
  const artistRows = await database.select({
    id: talent.id,
    stageName: talent.stageName,
    homeMarket: talent.homeMarket,
    genres: talent.genres,
    instagramHandle: talent.instagramHandle,
    clientContact: talent.clientContact,
    ownership: talent.ownership,
    archivedAt: talent.archivedAt,
  }).from(talent).where(and(
    eq(talent.ownership, "residency"),
    eq(talent.owningResidencyId, residencyId),
  )).orderBy(asc(talent.stageName));
  const artistIds = artistRows.map((artist) => artist.id);
  if (!artistIds.length) return [];
  const [creationRows, assignmentRows, occurrenceRows] = await Promise.all([
    database.select({
      artistId: auditLog.entityId,
      actorRole: users.role,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
    }).from(auditLog)
      .leftJoin(users, eq(auditLog.actorUserId, users.id))
      .where(and(
        eq(auditLog.residencyId, residencyId),
        eq(auditLog.entityType, "talent"),
        eq(auditLog.action, "client_owned_artist_created"),
        inArray(auditLog.entityId, artistIds),
      )).orderBy(desc(auditLog.createdAt)),
    database.select({ artistId: assignments.talentId }).from(assignments)
      .where(inArray(assignments.talentId, artistIds)),
    database.select({ artistId: scheduleOccurrenceTalent.talentId }).from(scheduleOccurrenceTalent)
      .where(inArray(scheduleOccurrenceTalent.talentId, artistIds)),
  ]);
  const artistsWithHistory = new Set([
    ...assignmentRows.flatMap((row) => row.artistId ? [row.artistId] : []),
    ...occurrenceRows.map((row) => row.artistId),
  ]);
  return artistRows.map((artist) => {
    const creation = creationRows.find((row) => row.artistId === artist.id);
    const explicitSource = creation?.details.creationSource;
    const creationSource = explicitSource === "hfy_on_behalf" || explicitSource === "residency_member"
      ? explicitSource
      : creation?.actorRole === "internal_admin"
        ? "hfy_on_behalf"
        : creation?.actorRole === "hotel_user"
          ? "residency_member"
          : "unknown";
    return {
      ...projectClientSafeTalent(artist),
      archivedAt: artist.archivedAt?.toISOString() ?? null,
      creationSource,
      hasBookingHistory: artistsWithHistory.has(artist.id),
    };
  });
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
    talentId: assignments.talentId,
    artist: talent.stageName,
    shiftName: shifts.name,
    serviceDate: shifts.serviceDate,
    startsAt: assignments.startsAt,
    endsAt: assignments.endsAt,
    bookingStatus: assignments.bookingStatus,
    defaultRateCents: clientAssignmentTerms.defaultRateCents,
    overrideRateCents: clientAssignmentTerms.rateCents,
  }).from(assignments)
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .innerJoin(clientAssignmentTerms, eq(clientAssignmentTerms.assignmentId, assignments.id))
    .leftJoin(talent, eq(assignments.talentId, talent.id))
    .where(and(
      eq(shifts.residencyId, residencyId),
      eq(assignments.source, "client_owned"),
      inArray(assignments.bookingStatus, ["confirmed", "completed"]),
    ))
    .orderBy(asc(shifts.serviceDate), asc(assignments.startsAt));
  return rows.map((row) => {
    const effectiveRateCents = resolveClientHourlyRateCents(row.defaultRateCents, row.overrideRateCents);
    return {
      id: row.id,
      talentId: row.talentId,
      artist: row.artist ?? "Unassigned",
      shiftName: row.shiftName,
      serviceDate: row.serviceDate,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      bookingStatus: row.bookingStatus,
      defaultRateCents: row.defaultRateCents,
      overrideRateCents: row.overrideRateCents,
      effectiveRateCents,
      owedCents: calculateClientOwedCents(row.startsAt, row.endsAt, effectiveRateCents),
    };
  });
}

export async function getResidencyClientTalentWorkspace(residencyId: string) {
  const database = getDb();
  const [activeRoster, managedArtists, payoutRows] = await Promise.all([
    getResidencyClientSafeRoster(residencyId),
    getResidencyClientOwnedArtistManagement(residencyId),
    getResidencyClientPayoutStatus(residencyId),
  ]);
  const managedById = new Map(managedArtists.map((artist) => [artist.id, artist]));
  const allArtists = [
    ...activeRoster.map((artist) => ({
      ...artist,
      archivedAt: null as string | null,
      creationSource: managedById.get(artist.id)?.creationSource ?? "unknown" as const,
      hasBookingHistory: managedById.get(artist.id)?.hasBookingHistory ?? false,
    })),
    ...managedArtists.filter((artist) => artist.archivedAt && !activeRoster.some((active) => active.id === artist.id)),
  ];
  const artistIds = allArtists.map((artist) => artist.id);
  if (!artistIds.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const [assignmentRows, occurrenceRows] = await Promise.all([
    database.select({
      id: assignments.id,
      talentId: assignments.talentId,
      serviceDate: shifts.serviceDate,
      startsAt: assignments.startsAt,
      endsAt: assignments.endsAt,
      shiftName: shifts.name,
      room: shifts.room,
      bookingStatus: assignments.bookingStatus,
    }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .where(and(
        eq(shifts.residencyId, residencyId),
        inArray(assignments.talentId, artistIds),
        gte(shifts.serviceDate, today),
        inArray(assignments.bookingStatus, ["offered", "pending_hfy_confirmation", "confirmed", "completed"]),
      ))
      .orderBy(asc(shifts.serviceDate), asc(assignments.startsAt)),
    database.select({
      id: scheduleOccurrenceTalent.id,
      talentId: scheduleOccurrenceTalent.talentId,
      serviceDate: scheduleOccurrences.serviceDate,
      startsAt: scheduleOccurrenceTalent.startsAt,
      endsAt: scheduleOccurrenceTalent.endsAt,
      shiftName: scheduleOccurrences.name,
      room: scheduleOccurrences.room,
    }).from(scheduleOccurrenceTalent)
      .innerJoin(scheduleOccurrences, eq(scheduleOccurrenceTalent.occurrenceId, scheduleOccurrences.id))
      .where(and(
        eq(scheduleOccurrences.residencyId, residencyId),
        inArray(scheduleOccurrenceTalent.talentId, artistIds),
        gte(scheduleOccurrences.serviceDate, today),
      ))
      .orderBy(asc(scheduleOccurrences.serviceDate), asc(scheduleOccurrenceTalent.startsAt)),
  ]);

  return allArtists.map((artist) => {
    const artistPayouts = payoutRows.filter((row) => row.talentId === artist.id);
    const upcomingBookings = [
      ...assignmentRows.filter((row) => row.talentId === artist.id).map((row) => ({
        id: row.id,
        serviceDate: row.serviceDate,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        shiftName: row.shiftName,
        room: row.room,
        bookingStatus: row.bookingStatus,
      })),
      ...occurrenceRows.filter((row) => row.talentId === artist.id).map((row) => ({
        id: row.id,
        serviceDate: row.serviceDate,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        shiftName: row.shiftName,
        room: row.room,
        bookingStatus: "confirmed" as const,
      })),
    ].sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.startsAt.localeCompare(right.startsAt));
    return {
      ...artist,
      outstandingOwedCents: artistPayouts.reduce((sum, row) => sum + (row.owedCents ?? 0), 0),
      outstandingAssignments: artistPayouts.map((row) => ({
        id: row.id,
        shiftName: row.shiftName,
        serviceDate: row.serviceDate,
        amountCents: row.owedCents,
      })),
      upcomingBookings,
    };
  });
}

export async function getResidencyClientInvoices(residencyId: string) {
  const rows = await getDb().select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    billingPeriodStart: invoices.billingPeriodStart,
    billingPeriodEnd: invoices.billingPeriodEnd,
    invoiceDate: invoices.invoiceDate,
    status: invoices.status,
    totalCents: invoices.totalCents,
    sentAt: invoices.sentAt,
  }).from(invoices)
    .where(and(
      eq(invoices.residencyId, residencyId),
      inArray(invoices.status, ["approved", "sent", "paid"]),
    ))
    .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt));
  return rows.map((row) => projectClientSafeInvoice({ ...row, sentAt: row.sentAt?.toISOString() ?? null }));
}

export async function getResidencyClientSettings(residencyId: string) {
  const [row] = await getDb().select({
    name: residencies.name,
    cityState: residencies.cityState,
    timezone: residencies.timezone,
    primaryContactName: residencies.primaryContactName,
    primaryContactPhone: residencies.primaryContactPhone,
    primaryContactEmail: residencies.primaryContactEmail,
  }).from(residencies).where(eq(residencies.id, residencyId)).limit(1);
  if (!row) throw new Error("Residency not found.");
  return row;
}
