import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, daypartDateExceptions, daypartDayRules, dayparts, hfyTalentRequests, invoiceLineItems, invoices, residencies, residencyTalent, rooms, scheduleOccurrences, shifts, talent, talentInvoiceAdjustments } from "@/db/schema";
import { calculateBillableAmountCents } from "@/domain/airtable-parity";
import { HFY_BOOKED_COLOR, isRoomHue, roomShadeColors, validateDaypartRules, weekdayForDate, type DaypartBillingMode, type DaypartRuleInput, type DaypartScheduleMode, type DaypartType } from "@/domain/dayparts";
import { shiftDeletionBlockReason } from "@/domain/shift-deletion";
import type { AuditActor } from "@/lib/auth";
import { carryForwardAdjustmentDescription } from "@/domain/talent-invoicing";
import { findOrCreateResidencyRoom, nextRoomDaypartColor } from "@/services/rooms";

export type SaveDaypartInput = {
  id?: string;
  residencyId: string;
  roomId?: string | null;
  name: string;
  room: string;
  color: string;
  type: DaypartType;
  billingMode: DaypartBillingMode | null;
  scheduleMode: DaypartScheduleMode;
  suggestedStartMinute?: number | null;
  suggestedEndMinute?: number | null;
  defaultTalentRateCents?: number | null;
  clientDefaultRateCents?: number | null;
  activeUntil?: string | null;
  active: boolean;
  sortOrder?: number;
  rules: DaypartRuleInput[];
};

export async function getDaypartsForResidency(residencyId: string) {
  return (await getDaypartsForResidencies([residencyId])).filter((daypart) => daypart.residencyId === residencyId);
}

export async function getDaypartsForResidencies(residencyIds: string[]) {
  if (!residencyIds.length) return [];
  const database = getDb();
  const [partRows, ruleRows, roomRows] = await Promise.all([
    database.select().from(dayparts)
      .where(inArray(dayparts.residencyId, residencyIds))
      .orderBy(asc(dayparts.residencyId), asc(dayparts.sortOrder), asc(dayparts.name)),
    database.select().from(daypartDayRules)
      .innerJoin(dayparts, eq(daypartDayRules.daypartId, dayparts.id))
      .where(inArray(dayparts.residencyId, residencyIds))
      .orderBy(asc(dayparts.residencyId), asc(daypartDayRules.weekday)),
    database.select({ id: rooms.id, hue: rooms.hue }).from(rooms)
      .where(inArray(rooms.residencyId, residencyIds)),
  ]);
  return partRows.map((daypart) => ({
    ...daypart,
    roomHue: (() => {
      const hue = roomRows.find((room) => room.id === daypart.roomId)?.hue;
      return hue && isRoomHue(hue) ? hue : null;
    })(),
    rules: ruleRows.filter((row) => row.daypart_day_rules.daypartId === daypart.id).map((row) => row.daypart_day_rules),
  }));
}

export async function getDaypartDateExceptionsForResidencies(
  residencyIds: string[],
  range: { from: string; to: string },
) {
  if (!residencyIds.length) return [];
  return getDb().select({
    daypartId: daypartDateExceptions.daypartId,
    serviceDate: daypartDateExceptions.serviceDate,
    kind: daypartDateExceptions.kind,
    startMinute: daypartDateExceptions.startMinute,
    endMinute: daypartDateExceptions.endMinute,
  }).from(daypartDateExceptions)
    .innerJoin(dayparts, eq(daypartDateExceptions.daypartId, dayparts.id))
    .where(and(
      inArray(dayparts.residencyId, residencyIds),
      gte(daypartDateExceptions.serviceDate, range.from),
      lte(daypartDateExceptions.serviceDate, range.to),
    ))
    .orderBy(asc(daypartDateExceptions.serviceDate), asc(daypartDateExceptions.daypartId));
}

export async function saveDaypartDateOverride(
  actor: AuditActor,
  input: { residencyId: string; daypartId: string; serviceDate: string; startMinute: number; endMinute: number },
) {
  weekdayForDate(input.serviceDate);
  if (!Number.isInteger(input.startMinute) || input.startMinute < 0 || input.startMinute >= 1440
    || !Number.isInteger(input.endMinute) || input.endMinute <= input.startMinute || input.endMinute > input.startMinute + 1440) {
    throw new Error("Choose valid hours for this date.");
  }
  return getDb().transaction(async (tx) => {
    const [daypart] = await tx.select({ id: dayparts.id, name: dayparts.name }).from(dayparts)
      .innerJoin(daypartDayRules, and(
        eq(daypartDayRules.daypartId, dayparts.id),
        eq(daypartDayRules.weekday, weekdayForDate(input.serviceDate)),
      ))
      .where(and(
        eq(dayparts.id, input.daypartId),
        eq(dayparts.residencyId, input.residencyId),
        eq(dayparts.active, true),
      )).limit(1);
    if (!daypart) throw new Error("This Daypart does not normally run on the selected date.");
    const [savedShift, savedOccurrence] = await Promise.all([
      tx.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.daypartId, input.daypartId), eq(shifts.serviceDate, input.serviceDate))).limit(1),
      tx.select({ id: scheduleOccurrences.id }).from(scheduleOccurrences).where(and(eq(scheduleOccurrences.daypartId, input.daypartId), eq(scheduleOccurrences.serviceDate, input.serviceDate))).limit(1),
    ]);
    if (savedShift.length || savedOccurrence.length) {
      throw new Error("This date is already scheduled. Remove that dated record before changing its recurring hours.");
    }
    await tx.insert(daypartDateExceptions).values({
      daypartId: input.daypartId,
      serviceDate: input.serviceDate,
      kind: "override",
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      createdByUserId: actor.userId,
    }).onConflictDoUpdate({
      target: [daypartDateExceptions.daypartId, daypartDateExceptions.serviceDate],
      set: {
        kind: "override",
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        createdByUserId: actor.userId,
        updatedAt: new Date(),
      },
    });
    await tx.insert(auditLog).values({
      residencyId: input.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "daypart_date_hours_overridden",
      entityType: "daypart",
      entityId: input.daypartId,
      details: { serviceDate: input.serviceDate, startMinute: input.startMinute, endMinute: input.endMinute, name: daypart.name },
    });
  });
}

export async function skipDaypartDate(
  actor: AuditActor,
  input: { residencyId: string; daypartId: string; serviceDate: string },
) {
  weekdayForDate(input.serviceDate);
  return getDb().transaction(async (tx) => {
    const [daypart] = await tx.select({ id: dayparts.id, name: dayparts.name, residencyTier: residencies.tier }).from(dayparts)
      .innerJoin(residencies, eq(dayparts.residencyId, residencies.id))
      .where(and(eq(dayparts.id, input.daypartId), eq(dayparts.residencyId, input.residencyId)))
      .limit(1);
    if (!daypart) throw new Error("Daypart not found in this Residency.");
    const [shift] = await tx.select({
      id: shifts.id,
      invoiceId: shifts.invoiceId,
      invoiceStatus: invoices.status,
      economicsMode: shifts.economicsMode,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      clientRateCents: shifts.clientRateCents,
      name: shifts.name,
    }).from(shifts)
      .leftJoin(invoices, eq(shifts.invoiceId, invoices.id))
      .where(and(eq(shifts.daypartId, input.daypartId), eq(shifts.serviceDate, input.serviceDate)))
      .limit(1);
    if (shift) {
      const finalizedFullProgrammingShift = daypart.residencyTier === "complete" && Boolean(shift.invoiceId && shift.invoiceStatus && shift.invoiceStatus !== "draft");
      if (actor.kind === "residency" && shift.economicsMode === "hfy" && daypart.residencyTier !== "complete") throw new Error("HFY-managed Shifts cannot be skipped by the client.");
      if (actor.kind === "internal" && shift.economicsMode !== "hfy") throw new Error("Client-owned and pending-request Shifts are controlled through their own workflow.");
      const assignmentRows = await tx.select({
        bookingStatus: assignments.bookingStatus,
        payoutStatus: assignments.payoutStatus,
      }).from(assignments).where(eq(assignments.shiftId, shift.id));
      const blockReason = shiftDeletionBlockReason(finalizedFullProgrammingShift ? null : shift.invoiceStatus, assignmentRows);
      if (blockReason) throw new Error(blockReason);
      if (finalizedFullProgrammingShift && shift.invoiceId) {
        const adjustmentCents = calculateBillableAmountCents(shift.startsAt, shift.endsAt, shift.clientRateCents);
        if (adjustmentCents <= 0) throw new Error("This invoiced service has no billable amount to credit.");
        await tx.insert(talentInvoiceAdjustments).values({
          residencyId: input.residencyId,
          sourceInvoiceId: shift.invoiceId,
          sourceShiftId: shift.id,
          serviceDate: input.serviceDate,
          reason: "schedule_cancelled_after_invoice",
          description: carryForwardAdjustmentDescription({ serviceDate: input.serviceDate, shiftName: shift.name, kind: "cancelled" }),
          amountCents: -adjustmentCents,
          createdByUserId: actor.userId,
        });
      }
      await tx.delete(hfyTalentRequests).where(eq(hfyTalentRequests.shiftId, shift.id));
      await tx.delete(assignments).where(eq(assignments.shiftId, shift.id));
      if (!finalizedFullProgrammingShift) await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.sourceShiftId, shift.id));
      await tx.delete(shifts).where(eq(shifts.id, shift.id));
      if (shift.invoiceId && !finalizedFullProgrammingShift) {
        const [remaining] = await tx.select({ total: sql<number>`coalesce(sum(${invoiceLineItems.totalCents}), 0)` })
          .from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, shift.invoiceId));
        await tx.update(invoices).set({ totalCents: Number(remaining?.total ?? 0), updatedAt: new Date() }).where(eq(invoices.id, shift.invoiceId));
      }
    }
    await tx.delete(scheduleOccurrences).where(and(
      eq(scheduleOccurrences.daypartId, input.daypartId),
      eq(scheduleOccurrences.serviceDate, input.serviceDate),
    ));
    await tx.insert(daypartDateExceptions).values({
      daypartId: input.daypartId,
      serviceDate: input.serviceDate,
      kind: "skip",
      startMinute: null,
      endMinute: null,
      createdByUserId: actor.userId,
    }).onConflictDoUpdate({
      target: [daypartDateExceptions.daypartId, daypartDateExceptions.serviceDate],
      set: { kind: "skip", startMinute: null, endMinute: null, createdByUserId: actor.userId, updatedAt: new Date() },
    });
    await tx.insert(auditLog).values({
      residencyId: input.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "daypart_date_skipped",
      entityType: "daypart",
      entityId: input.daypartId,
      details: { serviceDate: input.serviceDate, name: daypart.name, removedShiftId: shift?.id ?? null, pendingTalentInvoiceAdjustment: Boolean(shift?.invoiceId && shift.invoiceStatus && shift.invoiceStatus !== "draft" && daypart.residencyTier === "complete") },
    });
  });
}

export async function clearDaypartDateException(
  actor: AuditActor,
  input: { residencyId: string; daypartId: string; serviceDate: string },
) {
  weekdayForDate(input.serviceDate);
  return getDb().transaction(async (tx) => {
    const [daypart] = await tx.select({ id: dayparts.id }).from(dayparts)
      .where(and(eq(dayparts.id, input.daypartId), eq(dayparts.residencyId, input.residencyId)))
      .limit(1);
    if (!daypart) throw new Error("Daypart not found in this Residency.");
    await tx.delete(daypartDateExceptions).where(and(
      eq(daypartDateExceptions.daypartId, input.daypartId),
      eq(daypartDateExceptions.serviceDate, input.serviceDate),
    ));
    await tx.insert(auditLog).values({
      residencyId: input.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "daypart_date_exception_cleared",
      entityType: "daypart",
      entityId: input.daypartId,
      details: { serviceDate: input.serviceDate },
    });
  });
}

export async function saveDaypart(actor: AuditActor, input: SaveDaypartInput) {
  const name = input.name.trim();
  const room = input.room.trim();
  let billingMode = input.type === "house_activity" ? null : input.billingMode;
  const requestedColor = input.color.trim().toUpperCase();
  let defaultTalentRateCents = input.type === "dj_artist" && billingMode === "billed_by_hfy"
    ? input.defaultTalentRateCents ?? null
    : null;
  let clientDefaultRateCents = input.type === "dj_artist" && billingMode === "tracking_only"
    ? input.clientDefaultRateCents ?? null
    : null;
  const activeUntil = input.activeUntil || null;
  if (!name || !room) throw new Error("Daypart name and room are required.");
  if (!/^#[0-9A-F]{6}$/.test(requestedColor)) throw new Error("Choose a valid Daypart color.");
  if (requestedColor === HFY_BOOKED_COLOR) {
    throw new Error("HFY pink is a status indicator, not a Daypart color. Choose a room shade.");
  }
  if (input.type === "dj_artist" && billingMode !== "billed_by_hfy" && billingMode !== "tracking_only") {
    throw new Error("Choose how this Daypart is handled.");
  }
  if (defaultTalentRateCents !== null && (!Number.isInteger(defaultTalentRateCents) || defaultTalentRateCents < 0)) {
    throw new Error("Daypart talent rate must be blank or a nonnegative amount.");
  }
  if (clientDefaultRateCents !== null && (!Number.isInteger(clientDefaultRateCents) || clientDefaultRateCents < 0)) {
    throw new Error("Client Daypart rate must be blank or a nonnegative amount.");
  }
  if (activeUntil) weekdayForDate(activeUntil);
  const rules = input.scheduleMode === "standing_weekly" ? validateDaypartRules(input.rules) : [];
  const suggestedStartMinute = input.scheduleMode === "calendar_only" ? input.suggestedStartMinute ?? null : null;
  const suggestedEndMinute = input.scheduleMode === "calendar_only" ? input.suggestedEndMinute ?? null : null;
  if (input.scheduleMode === "calendar_only" && (!Number.isInteger(suggestedStartMinute) || !Number.isInteger(suggestedEndMinute)
    || suggestedStartMinute! < 0 || suggestedStartMinute! >= 1440 || suggestedEndMinute! <= suggestedStartMinute! || suggestedEndMinute! > suggestedStartMinute! + 1440)) {
    throw new Error("Choose valid suggested hours for this reusable one-off template.");
  }
  const database = getDb();

  return database.transaction(async (tx) => {
    const [residency] = await tx.select({ id: residencies.id, tier: residencies.tier }).from(residencies)
      .where(and(eq(residencies.id, input.residencyId), eq(residencies.active, true), eq(residencies.operatingMode, "operations"))).limit(1);
    if (!residency) throw new Error("Residency not found.");
    if (residency.tier === "complete" && input.type === "dj_artist") {
      if (actor.kind === "residency") throw new Error("HFY manages Talent Activities for Full Programming accounts.");
      billingMode = "billed_by_hfy";
      clientDefaultRateCents = null;
      defaultTalentRateCents = input.defaultTalentRateCents ?? null;
    }

    const assignedRoom = await findOrCreateResidencyRoom(tx, residency.id, room, input.roomId);
    const allowedRoomColors = roomShadeColors(assignedRoom.hue);
    const color = input.id
      ? allowedRoomColors.includes(requestedColor) ? requestedColor : allowedRoomColors[0]
      : await nextRoomDaypartColor(tx, assignedRoom.id);

    const duplicateNameWhere = input.id
      ? and(eq(dayparts.residencyId, residency.id), sql`lower(${dayparts.name}) = lower(${name})`, ne(dayparts.id, input.id))
      : and(eq(dayparts.residencyId, residency.id), sql`lower(${dayparts.name}) = lower(${name})`);
    const [duplicateName] = await tx.select({ id: dayparts.id }).from(dayparts).where(duplicateNameWhere).limit(1);
    if (duplicateName) {
      throw new Error(`A Daypart named “${name}” already exists in this Residency. Open that Daypart to edit it.`);
    }

    let daypartId = input.id;
    if (daypartId) {
      const [existing] = await tx.select({ id: dayparts.id }).from(dayparts)
        .where(and(eq(dayparts.id, daypartId), eq(dayparts.residencyId, residency.id))).limit(1);
      if (!existing) throw new Error("Daypart not found in this Residency.");
      await tx.update(dayparts).set({
        name,
        roomId: assignedRoom.id,
        room: assignedRoom.name,
        color,
        type: input.type,
        billingMode,
        scheduleMode: input.scheduleMode,
        suggestedStartMinute,
        suggestedEndMinute,
        defaultTalentRateCents,
        clientDefaultRateCents,
        activeUntil,
        active: input.active,
        sortOrder: input.sortOrder ?? 0,
        updatedAt: new Date(),
      }).where(eq(dayparts.id, daypartId));
      await tx.delete(daypartDayRules).where(eq(daypartDayRules.daypartId, daypartId));
    } else {
      const [created] = await tx.insert(dayparts).values({
        residencyId: residency.id,
        roomId: assignedRoom.id,
        name,
        room: assignedRoom.name,
        color,
        type: input.type,
        billingMode,
        scheduleMode: input.scheduleMode,
        suggestedStartMinute,
        suggestedEndMinute,
        defaultTalentRateCents,
        clientDefaultRateCents,
        activeUntil,
        active: input.active,
        sortOrder: input.sortOrder ?? 0,
      }).returning({ id: dayparts.id });
      daypartId = created.id;
    }

    if (rules.length) await tx.insert(daypartDayRules).values(rules.map((rule) => ({ daypartId, ...rule })));
    await tx.insert(auditLog).values({
      residencyId: residency.id,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: input.id ? "daypart_updated" : "daypart_created",
      entityType: "daypart",
      entityId: daypartId,
      details: { name, room: assignedRoom.name, roomId: assignedRoom.id, roomHue: assignedRoom.hue, color, type: input.type, billingMode, scheduleMode: input.scheduleMode, suggestedStartMinute, suggestedEndMinute, defaultTalentRateCents, clientDefaultRateCents, activeUntil, active: input.active, weekdays: rules.map((rule) => rule.weekday) },
    });
    return { id: daypartId };
  });
}

export async function removeDaypart(actor: AuditActor, residencyId: string, daypartId: string) {
  const database = getDb();
  return database.transaction(async (tx) => {
    const [daypart] = await tx.select({ id: dayparts.id, name: dayparts.name, type: dayparts.type, residencyTier: residencies.tier }).from(dayparts)
      .innerJoin(residencies, eq(dayparts.residencyId, residencies.id))
      .where(and(
        eq(dayparts.id, daypartId),
        eq(dayparts.residencyId, residencyId),
        eq(residencies.active, true),
        eq(residencies.operatingMode, "operations"),
      )).limit(1);
    if (!daypart) throw new Error("Daypart not found in this Residency.");
    if (actor.kind === "residency" && daypart.residencyTier === "complete" && daypart.type === "dj_artist") {
      throw new Error("HFY manages Talent Activities for Full Programming accounts.");
    }

    const [shiftUsage, occurrenceUsage] = await Promise.all([
      tx.select({ id: shifts.id }).from(shifts).where(eq(shifts.daypartId, daypartId)).limit(1),
      tx.select({ id: scheduleOccurrences.id }).from(scheduleOccurrences).where(eq(scheduleOccurrences.daypartId, daypartId)).limit(1),
    ]);
    const archived = Boolean(shiftUsage.length || occurrenceUsage.length);
    if (archived) {
      await tx.update(dayparts).set({ active: false, updatedAt: new Date() }).where(eq(dayparts.id, daypartId));
    } else {
      await tx.delete(dayparts).where(eq(dayparts.id, daypartId));
    }
    await tx.insert(auditLog).values({
      residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: archived ? "daypart_archived" : "daypart_deleted",
      entityType: "daypart",
      entityId: daypartId,
      details: { name: daypart.name, historicalRecordsPreserved: archived },
    });
    return { mode: archived ? "archived" as const : "deleted" as const };
  });
}

export async function getDaypartSuggestions(residencyId: string, serviceDate: string) {
  const weekday = weekdayForDate(serviceDate);
  const database = getDb();
  const rows = await database.select({
    daypartId: dayparts.id,
    name: dayparts.name,
    room: dayparts.room,
    color: dayparts.color,
    type: dayparts.type,
    billingMode: dayparts.billingMode,
    defaultTalentRateCents: dayparts.defaultTalentRateCents,
    activeUntil: dayparts.activeUntil,
    startMinute: daypartDayRules.startMinute,
    endMinute: daypartDayRules.endMinute,
    defaultDjCount: daypartDayRules.defaultDjCount,
  }).from(daypartDayRules)
    .innerJoin(dayparts, eq(daypartDayRules.daypartId, dayparts.id))
    .where(and(
      eq(dayparts.residencyId, residencyId),
      eq(dayparts.active, true),
      or(isNull(dayparts.activeUntil), gte(dayparts.activeUntil, serviceDate)),
      eq(daypartDayRules.weekday, weekday),
    ))
    .orderBy(asc(dayparts.sortOrder), asc(dayparts.name));

  if (!rows.length) return [];
  const [existingShifts, existingOccurrences] = await Promise.all([
    database.select({ daypartId: shifts.daypartId, recordId: shifts.id }).from(shifts)
      .where(and(
        eq(shifts.residencyId, residencyId),
        eq(shifts.serviceDate, serviceDate),
        inArray(shifts.daypartId, rows.map((row) => row.daypartId)),
      )),
    database.select({ daypartId: scheduleOccurrences.daypartId, recordId: scheduleOccurrences.id }).from(scheduleOccurrences)
      .where(and(
        eq(scheduleOccurrences.residencyId, residencyId),
        eq(scheduleOccurrences.serviceDate, serviceDate),
        inArray(scheduleOccurrences.daypartId, rows.map((row) => row.daypartId)),
      )),
  ]);
  const existing = [...existingShifts, ...existingOccurrences];
  return rows.map((row) => ({
    ...row,
    existingRecordId: existing.find((record) => record.daypartId === row.daypartId)?.recordId ?? null,
  }));
}

export async function getActiveTalentLookup(residencyId?: string) {
  const database = getDb();
  if (!residencyId) return database.select({
    id: talent.id,
    stageName: talent.stageName,
    homeMarket: talent.homeMarket,
    genres: talent.genres,
    priority: talent.priority,
  }).from(talent).where(and(eq(talent.ownership, "hfy"), eq(talent.talentStatus, "active"))).orderBy(asc(talent.stageName));
  return database.select({
    id: talent.id,
    stageName: talent.stageName,
    homeMarket: talent.homeMarket,
    genres: talent.genres,
    priority: talent.priority,
    instagramHandle: talent.instagramHandle,
  }).from(talent)
    .innerJoin(residencyTalent, and(
      eq(residencyTalent.talentId, talent.id),
      eq(residencyTalent.residencyId, residencyId),
      eq(residencyTalent.active, true),
    ))
    .where(and(
      eq(talent.talentStatus, "active"),
      eq(talent.ownership, "hfy"),
      isNull(talent.archivedAt),
      or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, residencyId)),
    ))
    .orderBy(asc(talent.stageName));
}

export async function getHfyRequestTalentLookup(residencyId: string) {
  return getDb().select({
    id: talent.id,
    stageName: talent.stageName,
    homeMarket: talent.homeMarket,
    genres: talent.genres,
    priority: talent.priority,
    ownership: talent.ownership,
  }).from(talent).where(and(
    eq(talent.ownership, "hfy"),
    eq(talent.talentStatus, "active"),
    isNull(talent.archivedAt),
    or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, residencyId)),
  )).orderBy(asc(talent.stageName));
}
