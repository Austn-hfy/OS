import { and, asc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, daypartDayRules, dayparts, residencies, residencyTalent, scheduleOccurrences, shifts, talent } from "@/db/schema";
import { validateDaypartRules, weekdayForDate, type DaypartBillingMode, type DaypartRuleInput, type DaypartType } from "@/domain/dayparts";
import type { InternalActor } from "@/lib/auth";

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
  const database = getDb();
  const [partRows, ruleRows] = await Promise.all([
    database.select().from(dayparts)
      .where(eq(dayparts.residencyId, residencyId))
      .orderBy(asc(dayparts.sortOrder), asc(dayparts.name)),
    database.select().from(daypartDayRules)
      .innerJoin(dayparts, eq(daypartDayRules.daypartId, dayparts.id))
      .where(eq(dayparts.residencyId, residencyId))
      .orderBy(asc(daypartDayRules.weekday)),
  ]);
  return partRows.map((daypart) => ({
    ...daypart,
    rules: ruleRows.filter((row) => row.daypart_day_rules.daypartId === daypart.id).map((row) => row.daypart_day_rules),
  }));
}

export async function saveDaypart(actor: InternalActor, input: SaveDaypartInput) {
  const name = input.name.trim();
  const room = input.room.trim();
  const color = input.color.trim().toUpperCase();
  const billingMode = input.type === "house_activity" ? null : input.billingMode ?? "billed_by_hfy";
  const defaultTalentRateCents = input.type === "dj_artist" && billingMode === "billed_by_hfy"
    ? input.defaultTalentRateCents ?? null
    : null;
  const activeUntil = input.activeUntil || null;
  if (!name || !room) throw new Error("Daypart name and room are required.");
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new Error("Choose a valid Daypart color.");
  if (input.type !== "dj_artist" && input.type !== "house_activity") throw new Error("Choose a valid Daypart type.");
  if (input.type === "dj_artist" && billingMode !== "billed_by_hfy" && billingMode !== "tracking_only") {
    throw new Error("Choose how this DJ / Artist Daypart is billed.");
  }
  if (defaultTalentRateCents !== null && (!Number.isInteger(defaultTalentRateCents) || defaultTalentRateCents < 0)) {
    throw new Error("Daypart talent rate must be blank or a nonnegative amount.");
  }
  if (activeUntil) weekdayForDate(activeUntil);
  const rules = validateDaypartRules(input.rules, input.type);
  const database = getDb();

  return database.transaction(async (tx) => {
    const [residency] = await tx.select({ id: residencies.id }).from(residencies)
      .where(and(eq(residencies.id, input.residencyId), eq(residencies.active, true), eq(residencies.operatingMode, "operations"))).limit(1);
    if (!residency) throw new Error("Residency not found.");

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
  }).from(residencyTalent)
    .innerJoin(talent, eq(residencyTalent.talentId, talent.id))
    .where(and(
      eq(residencyTalent.residencyId, residencyId),
      eq(residencyTalent.active, true),
      eq(talent.talentStatus, "active"),
    ))
    .orderBy(asc(talent.stageName));
}
