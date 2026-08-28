import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, daypartDayRules, dayparts, residencies, scheduleOccurrences, shifts, talent } from "@/db/schema";
import { validateDaypartRules, weekdayForDate, type DaypartBillingMode, type DaypartRuleInput, type DaypartType } from "@/domain/dayparts";
import type { AuditActor } from "@/lib/auth";

export type SaveDaypartInput = {
  id?: string;
  residencyId: string;
  name: string;
  room: string;
  color: string;
  type: DaypartType;
  billingMode: DaypartBillingMode | null;
  defaultTalentRateCents?: number | null;
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
  const [partRows, ruleRows] = await Promise.all([
    database.select().from(dayparts)
      .where(inArray(dayparts.residencyId, residencyIds))
      .orderBy(asc(dayparts.residencyId), asc(dayparts.sortOrder), asc(dayparts.name)),
    database.select().from(daypartDayRules)
      .innerJoin(dayparts, eq(daypartDayRules.daypartId, dayparts.id))
      .where(inArray(dayparts.residencyId, residencyIds))
      .orderBy(asc(dayparts.residencyId), asc(daypartDayRules.weekday)),
  ]);
  return partRows.map((daypart) => ({
    ...daypart,
    rules: ruleRows.filter((row) => row.daypart_day_rules.daypartId === daypart.id).map((row) => row.daypart_day_rules),
  }));
}

export async function saveDaypart(actor: AuditActor, input: SaveDaypartInput) {
  const name = input.name.trim();
  const room = input.room.trim();
  const color = input.color.trim().toUpperCase();
  const billingMode = input.type === "house_activity" ? null : input.billingMode;
  const defaultTalentRateCents = input.type === "dj_artist" && billingMode === "billed_by_hfy"
    ? input.defaultTalentRateCents ?? null
    : null;
  const activeUntil = input.activeUntil || null;
  if (!name || !room) throw new Error("Daypart name and room are required.");
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new Error("Choose a valid Daypart color.");
  if (input.type === "dj_artist" && billingMode !== "billed_by_hfy" && billingMode !== "tracking_only") {
    throw new Error("Choose how this Daypart is handled.");
  }
  if (defaultTalentRateCents !== null && (!Number.isInteger(defaultTalentRateCents) || defaultTalentRateCents < 0)) {
    throw new Error("Daypart talent rate must be blank or a nonnegative amount.");
  }
  if (activeUntil) weekdayForDate(activeUntil);
  const rules = validateDaypartRules(input.rules);
  const database = getDb();

  return database.transaction(async (tx) => {
    const [residency] = await tx.select({ id: residencies.id }).from(residencies)
      .where(and(eq(residencies.id, input.residencyId), eq(residencies.active, true), eq(residencies.operatingMode, "operations"))).limit(1);
    if (!residency) throw new Error("Residency not found.");

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
        room,
        color,
        type: input.type,
        billingMode,
        defaultTalentRateCents,
        activeUntil,
        active: input.active,
        sortOrder: input.sortOrder ?? 0,
        updatedAt: new Date(),
      }).where(eq(dayparts.id, daypartId));
      await tx.delete(daypartDayRules).where(eq(daypartDayRules.daypartId, daypartId));
    } else {
      const [created] = await tx.insert(dayparts).values({
        residencyId: residency.id,
        name,
        room,
        color,
        type: input.type,
        billingMode,
        defaultTalentRateCents,
        activeUntil,
        active: input.active,
        sortOrder: input.sortOrder ?? 0,
      }).returning({ id: dayparts.id });
      daypartId = created.id;
    }

    await tx.insert(daypartDayRules).values(rules.map((rule) => ({ daypartId, ...rule })));
    await tx.insert(auditLog).values({
      residencyId: residency.id,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: input.id ? "daypart_updated" : "daypart_created",
      entityType: "daypart",
      entityId: daypartId,
      details: { name, room, color, type: input.type, billingMode, defaultTalentRateCents, activeUntil, active: input.active, weekdays: rules.map((rule) => rule.weekday) },
    });
    return { id: daypartId };
  });
}

export async function removeDaypart(actor: AuditActor, residencyId: string, daypartId: string) {
  const database = getDb();
  return database.transaction(async (tx) => {
    const [daypart] = await tx.select({ id: dayparts.id, name: dayparts.name }).from(dayparts)
      .innerJoin(residencies, eq(dayparts.residencyId, residencies.id))
      .where(and(
        eq(dayparts.id, daypartId),
        eq(dayparts.residencyId, residencyId),
        eq(residencies.active, true),
        eq(residencies.operatingMode, "operations"),
      )).limit(1);
    if (!daypart) throw new Error("Daypart not found in this Residency.");

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
  }).from(talent).where(eq(talent.talentStatus, "active")).orderBy(asc(talent.stageName));
  return database.select({
    id: talent.id,
    stageName: talent.stageName,
    homeMarket: talent.homeMarket,
    genres: talent.genres,
    priority: talent.priority,
    instagramHandle: talent.instagramHandle,
  }).from(talent)
    .where(and(
      eq(talent.talentStatus, "active"),
      isNull(talent.archivedAt),
      or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, residencyId)),
    ))
    .orderBy(asc(talent.stageName));
}
