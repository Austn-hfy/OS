import "server-only";

import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  auditLog,
  daypartDateExceptions,
  daypartDayRules,
  dayparts,
  invoices,
  residencies,
  scheduleOccurrences,
  shifts,
  talentInvoiceAdjustments,
} from "@/db/schema";
import { addDays, calculateBillableAmountCents } from "@/domain/airtable-parity";
import {
  daypartBookingRecordKind,
  daypartDateKey,
  localDateTimeForMinute,
  projectDaypartSlots,
  type DaypartBookingRecordKind,
} from "@/domain/dayparts";
import { carryForwardAdjustmentDescription } from "@/domain/talent-invoicing";
import { localDateKey, zonedLocalDateTimeToUtc } from "@/domain/time";

export const STANDING_DAYPART_FORWARD_DAYS = 90;

type MaterializationTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export type StandingDaypartMaterializationSource =
  | "calendar_click"
  | "daypart_save"
  | "date_exception_restored"
  | "rolling_window";

export type StandingDaypartMaterializationActor = {
  userId: string | null;
  label: string;
};

export type MaterializedStandingDaypartRecord = {
  daypartId: string;
  serviceDate: string;
  recordKind: DaypartBookingRecordKind;
  recordId: string;
  startsAt: Date;
  endsAt: Date;
};

export type StandingDaypartMaterializationResult = {
  residencyId: string;
  rangeStart: string;
  rangeEnd: string;
  created: MaterializedStandingDaypartRecord[];
};

export function standingDaypartMaterializationWindow(at: Date, timezone: string) {
  const today = localDateKey(at, timezone);
  return {
    // Existing past/current dates require an explicit reviewed backfill. The
    // daily job keeps the remaining current period and future horizon filled.
    rangeStart: addDays(today, 1),
    rangeEnd: addDays(today, STANDING_DAYPART_FORWARD_DAYS),
  };
}

async function materializeProjectedSlot(
  tx: MaterializationTransaction,
  input: {
    residency: {
      id: string;
      tier: "operations_only" | "complete";
      timezone: string;
      clientHourlyRateCents: number;
    };
    slot: ReturnType<typeof projectDaypartSlots>[number];
    recordKind: DaypartBookingRecordKind;
    roomId: string | null;
    coveringInvoices: Array<{
      id: string;
      status: "draft" | "approved" | "sent" | "paid" | "void";
      billingPeriodStart: string;
      billingPeriodEnd: string;
    }>;
    actor: StandingDaypartMaterializationActor;
    source: StandingDaypartMaterializationSource;
  },
): Promise<MaterializedStandingDaypartRecord> {
  const { residency, slot, recordKind, actor, source } = input;
  const startsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(slot.date, slot.startMinute), residency.timezone);
  const endsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(slot.date, slot.endMinute), residency.timezone);

  if (recordKind === "tracking_occurrence") {
    const [occurrence] = await tx.insert(scheduleOccurrences).values({
      residencyId: residency.id,
      roomId: input.roomId,
      daypartId: slot.daypartId,
      serviceDate: slot.date,
      name: slot.name,
      room: slot.room,
      color: slot.color.toUpperCase(),
      type: slot.type,
      startsAt,
      endsAt,
      createdByUserId: actor.userId,
    }).onConflictDoNothing().returning({ id: scheduleOccurrences.id });
    if (!occurrence) {
      throw new Error(`${slot.name} on ${slot.date} could not be materialized as a Schedule Occurrence.`);
    }
    await tx.insert(auditLog).values({
      residencyId: residency.id,
      actorUserId: actor.userId,
      actorLabel: actor.label,
      action: "standing_daypart_record_materialized",
      entityType: "schedule_occurrence",
      entityId: occurrence.id,
      details: { daypartId: slot.daypartId, serviceDate: slot.date, recordKind, source },
    });
    return { daypartId: slot.daypartId, serviceDate: slot.date, recordKind, recordId: occurrence.id, startsAt, endsAt };
  }

  const coveringInvoices = input.coveringInvoices.filter((invoice) => (
    invoice.billingPeriodStart <= slot.date && invoice.billingPeriodEnd >= slot.date && invoice.status !== "void"
  ));
  const finalizedInvoice = residency.tier === "complete" && coveringInvoices.length === 1 && coveringInvoices[0].status !== "draft"
    ? coveringInvoices[0]
    : null;
  const linkedInvoice = finalizedInvoice ? null : coveringInvoices.length === 1 ? coveringInvoices[0] : null;
  const invoiceLinkNote = finalizedInvoice
    ? "Added after the service month was invoiced; carried to the next HFY Talent Invoice."
    : linkedInvoice
      ? ""
      : coveringInvoices.length
        ? "More than one Invoice covers this Shift."
        : "No Invoice period covers this Shift.";
  const clientRateCents = residency.clientHourlyRateCents;
  const [shift] = await tx.insert(shifts).values({
    residencyId: residency.id,
    roomId: input.roomId,
    daypartId: slot.daypartId,
    invoiceId: linkedInvoice?.id ?? null,
    name: slot.name,
    serviceDate: slot.date,
    room: slot.room,
    startsAt,
    endsAt,
    economicsMode: "hfy",
    clientRateCents,
    billingStatus: finalizedInvoice ? "pending_adjustment" : "pending",
    invoiceLinkIssue: !finalizedInvoice && !linkedInvoice,
    invoiceLinkNote,
  }).onConflictDoNothing().returning({ id: shifts.id });
  if (!shift) {
    throw new Error(`${slot.name} on ${slot.date} could not be materialized as a Shift.`);
  }

  if (finalizedInvoice) {
    const adjustmentCents = calculateBillableAmountCents(startsAt, endsAt, clientRateCents);
    if (adjustmentCents <= 0) {
      throw new Error("A positive client talent rate is required before adding service to an invoiced Full Programming month.");
    }
    await tx.insert(talentInvoiceAdjustments).values({
      residencyId: residency.id,
      sourceInvoiceId: finalizedInvoice.id,
      sourceShiftId: shift.id,
      serviceDate: slot.date,
      reason: "schedule_added_after_invoice",
      description: carryForwardAdjustmentDescription({ serviceDate: slot.date, shiftName: slot.name, kind: "added" }),
      amountCents: adjustmentCents,
      createdByUserId: actor.userId,
    });
  }

  await tx.insert(auditLog).values({
    residencyId: residency.id,
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action: "standing_daypart_record_materialized",
    entityType: "shift",
    entityId: shift.id,
    details: {
      daypartId: slot.daypartId,
      serviceDate: slot.date,
      recordKind,
      source,
      invoiceId: linkedInvoice?.id ?? null,
      pendingAdjustmentSourceInvoiceId: finalizedInvoice?.id ?? null,
    },
  });
  return { daypartId: slot.daypartId, serviceDate: slot.date, recordKind, recordId: shift.id, startsAt, endsAt };
}

export async function materializeStandingDaypartRangeInTransaction(
  tx: MaterializationTransaction,
  input: {
    residencyId: string;
    rangeStart: string;
    rangeEnd: string;
    daypartIds?: string[];
    actor: StandingDaypartMaterializationActor;
    source: StandingDaypartMaterializationSource;
  },
): Promise<StandingDaypartMaterializationResult> {
  const [residency] = await tx.select({
    id: residencies.id,
    tier: residencies.tier,
    timezone: residencies.timezone,
    clientHourlyRateCents: residencies.clientHourlyRateCents,
  }).from(residencies).where(and(
    eq(residencies.id, input.residencyId),
    eq(residencies.active, true),
    eq(residencies.operatingMode, "operations"),
  )).limit(1);
  if (!residency) throw new Error("Residency not found.");

  const selectedDayparts = await tx.select({
    id: dayparts.id,
    roomId: dayparts.roomId,
    name: dayparts.name,
    room: dayparts.room,
    color: dayparts.color,
    type: dayparts.type,
    billingMode: dayparts.billingMode,
    scheduleMode: dayparts.scheduleMode,
    active: dayparts.active,
    activeUntil: dayparts.activeUntil,
    defaultTalentRateCents: dayparts.defaultTalentRateCents,
  }).from(dayparts).where(and(
    eq(dayparts.residencyId, residency.id),
    eq(dayparts.scheduleMode, "standing_weekly"),
    eq(dayparts.active, true),
    or(isNull(dayparts.activeUntil), gte(dayparts.activeUntil, input.rangeStart)),
    input.daypartIds?.length ? inArray(dayparts.id, input.daypartIds) : undefined,
  ));
  if (!selectedDayparts.length) {
    return { residencyId: residency.id, rangeStart: input.rangeStart, rangeEnd: input.rangeEnd, created: [] };
  }

  const selectedIds = selectedDayparts.map((daypart) => daypart.id);
  const [rules, exceptions, shiftRows, occurrenceRows, coveringInvoices] = await Promise.all([
    tx.select().from(daypartDayRules).where(inArray(daypartDayRules.daypartId, selectedIds)),
    tx.select({
      daypartId: daypartDateExceptions.daypartId,
      serviceDate: daypartDateExceptions.serviceDate,
      kind: daypartDateExceptions.kind,
      startMinute: daypartDateExceptions.startMinute,
      endMinute: daypartDateExceptions.endMinute,
    }).from(daypartDateExceptions).where(and(
      inArray(daypartDateExceptions.daypartId, selectedIds),
      gte(daypartDateExceptions.serviceDate, input.rangeStart),
      lte(daypartDateExceptions.serviceDate, input.rangeEnd),
    )),
    tx.select({ daypartId: shifts.daypartId, serviceDate: shifts.serviceDate }).from(shifts).where(and(
      eq(shifts.residencyId, residency.id),
      inArray(shifts.daypartId, selectedIds),
      gte(shifts.serviceDate, input.rangeStart),
      lte(shifts.serviceDate, input.rangeEnd),
    )),
    tx.select({ daypartId: scheduleOccurrences.daypartId, serviceDate: scheduleOccurrences.serviceDate }).from(scheduleOccurrences).where(and(
      eq(scheduleOccurrences.residencyId, residency.id),
      inArray(scheduleOccurrences.daypartId, selectedIds),
      gte(scheduleOccurrences.serviceDate, input.rangeStart),
      lte(scheduleOccurrences.serviceDate, input.rangeEnd),
    )),
    tx.select({
      id: invoices.id,
      status: invoices.status,
      billingPeriodStart: invoices.billingPeriodStart,
      billingPeriodEnd: invoices.billingPeriodEnd,
    }).from(invoices).where(and(
      eq(invoices.residencyId, residency.id),
      eq(invoices.kind, "scheduled_period"),
      ne(invoices.status, "void"),
      lte(invoices.billingPeriodStart, input.rangeEnd),
      gte(invoices.billingPeriodEnd, input.rangeStart),
    )),
  ]);

  const recordKindByDaypart = new Map(selectedDayparts.map((daypart) => [
    daypart.id,
    daypartBookingRecordKind(daypart.type, daypart.billingMode),
  ] as const));
  const existingDaypartDates = new Set<string>();
  for (const row of shiftRows) {
    if (row.daypartId && recordKindByDaypart.get(row.daypartId) === "financial_shift") {
      existingDaypartDates.add(daypartDateKey(row.daypartId, row.serviceDate));
    }
  }
  for (const row of occurrenceRows) {
    if (row.daypartId && recordKindByDaypart.get(row.daypartId) === "tracking_occurrence") {
      existingDaypartDates.add(daypartDateKey(row.daypartId, row.serviceDate));
    }
  }

  const projected = projectDaypartSlots(selectedDayparts.map((daypart) => ({
    ...daypart,
    rules: rules.filter((rule) => rule.daypartId === daypart.id),
  })), input.rangeStart, input.rangeEnd, existingDaypartDates, exceptions);
  const created: MaterializedStandingDaypartRecord[] = [];
  for (const slot of projected) {
    created.push(await materializeProjectedSlot(tx, {
      residency,
      slot,
      recordKind: recordKindByDaypart.get(slot.daypartId)!,
      roomId: selectedDayparts.find((daypart) => daypart.id === slot.daypartId)?.roomId ?? null,
      coveringInvoices,
      actor: input.actor,
      source: input.source,
    }));
  }
  return { residencyId: residency.id, rangeStart: input.rangeStart, rangeEnd: input.rangeEnd, created };
}

export async function materializeStandingDaypartRange(input: {
  residencyId: string;
  rangeStart: string;
  rangeEnd: string;
  daypartIds?: string[];
  actor: StandingDaypartMaterializationActor;
  source: StandingDaypartMaterializationSource;
}) {
  return getDb().transaction((tx) => materializeStandingDaypartRangeInTransaction(tx, input));
}

export async function materializeStandingDaypartRollingWindowInTransaction(
  tx: MaterializationTransaction,
  input: {
    residencyId: string;
    daypartIds?: string[];
    actor: StandingDaypartMaterializationActor;
    source: StandingDaypartMaterializationSource;
    at?: Date;
  },
) {
  const [residency] = await tx.select({ timezone: residencies.timezone }).from(residencies)
    .where(eq(residencies.id, input.residencyId)).limit(1);
  if (!residency) throw new Error("Residency not found.");
  const window = standingDaypartMaterializationWindow(input.at ?? new Date(), residency.timezone);
  return materializeStandingDaypartRangeInTransaction(tx, { ...input, ...window });
}

export async function materializeStandingDaypartDateInTransaction(
  tx: MaterializationTransaction,
  input: {
    residencyId: string;
    daypartId: string;
    serviceDate: string;
    actor: StandingDaypartMaterializationActor;
    source: StandingDaypartMaterializationSource;
  },
) {
  const result = await materializeStandingDaypartRangeInTransaction(tx, {
    residencyId: input.residencyId,
    rangeStart: input.serviceDate,
    rangeEnd: input.serviceDate,
    daypartIds: [input.daypartId],
    actor: input.actor,
    source: input.source,
  });
  return result.created[0] ?? null;
}

export async function runStandingDaypartMaterialization(at = new Date()) {
  const residencyRows = await getDb().select({ id: residencies.id }).from(residencies).where(and(
    eq(residencies.active, true),
    eq(residencies.operatingMode, "operations"),
  ));
  const results: StandingDaypartMaterializationResult[] = [];
  for (const residency of residencyRows) {
    results.push(await getDb().transaction((tx) => materializeStandingDaypartRollingWindowInTransaction(tx, {
      residencyId: residency.id,
      actor: { userId: null, label: "standing-daypart-materializer" },
      source: "rolling_window",
      at,
    })));
  }
  return results;
}
