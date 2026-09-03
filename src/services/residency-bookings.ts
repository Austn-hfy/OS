import { and, eq, gt, inArray, isNull, lt, ne, gte, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, clientAssignmentTerms, daypartDayRules, dayparts, hfyTalentRequests, invoiceLineItems, invoices, residencies, residencyTalent, scheduleOccurrences, scheduleOccurrenceTalent, shifts, talent, talentInvoiceAdjustments } from "@/db/schema";
import { calculateBillableAmountCents, calculateCompensationCents, resolveRateCents, resolveTalentRateCents } from "@/domain/airtable-parity";
import { HFY_BOOKED_COLOR, daypartBookingRecordKind, hasOverlappingAssignmentMinutes, localDateTimeForMinute, validateDaypartRules, weekdayForDate, type DaypartBillingMode, type DaypartRuleInput, type DaypartScheduleMode, type DaypartType, type RoomHue } from "@/domain/dayparts";
import { zonedLocalDateTimeToUtc } from "@/domain/time";
import { assertResidencyTalentRateConfigured } from "@/domain/residency-rates";
import type { AuditActor } from "@/lib/auth";
import { carryForwardAdjustmentDescription } from "@/domain/talent-invoicing";
import { findOrCreateResidencyRoom, nextRoomDaypartColor } from "@/services/rooms";

export type BookingAssignmentInput = {
  talentId?: string | null;
  startsAtMinute?: number;
  endsAtMinute?: number;
  compensationType?: "hourly" | "fixed" | "na";
  talentRateOverrideCents?: number | null;
  fixedFeeCents?: number | null;
};

export type DaypartBookingInput = {
  daypartId: string | null;
  roomId?: string | null;
  name?: string;
  room?: string;
  calendarColor?: string;
  type?: DaypartType;
  billingMode?: DaypartBillingMode | null;
  startMinute: number;
  endMinute: number;
  clientTalentDefaultRateCents?: number | null;
  clientRateOverrideCents?: number | null;
  notes?: string;
  programDetails?: string;
  manualHostName?: string;
  requestHfy?: boolean;
  createDaypart?: {
    scheduleMode: DaypartScheduleMode;
    rules?: DaypartRuleInput[];
  };
  assignments: BookingAssignmentInput[];
};

export type CreateResidencyDateBookingInput = {
  residencyId: string;
  serviceDate: string;
  dayparts: DaypartBookingInput[];
};

export type AddShiftAssignmentInput = BookingAssignmentInput & {
  shiftId: string;
  talentId: string;
  startsAtMinute: number;
  endsAtMinute: number;
};

export type UpdateOneTimeRecordInput = {
  id: string;
  name: string;
  roomId?: string | null;
  room: string;
  roomHue?: RoomHue;
  createRoom?: boolean;
  calendarColor: string;
  startMinute: number;
  endMinute: number;
  clientTalentDefaultRateCents?: number | null;
  notes?: string;
  programDetails?: string;
  manualHostName?: string;
};

function validateOneTimeRecordInput(input: UpdateOneTimeRecordInput) {
  const name = input.name.trim();
  const room = input.room.trim();
  const calendarColor = input.calendarColor.trim().toUpperCase();
  if (!name || !room) throw new Error("Slot name and room are required.");
  if (!/^#[0-9A-F]{6}$/.test(calendarColor) || calendarColor === HFY_BOOKED_COLOR) throw new Error("Choose a valid non-HFY calendar color.");
  if (!Number.isInteger(input.startMinute) || input.startMinute < 0 || input.startMinute >= 1440
    || !Number.isInteger(input.endMinute) || input.endMinute <= input.startMinute || input.endMinute > input.startMinute + 1440) {
    throw new Error("Choose valid slot hours.");
  }
  return { name, room, calendarColor };
}

export async function createResidencyDateBooking(actor: AuditActor, input: CreateResidencyDateBookingInput) {
  if (!input.dayparts.length) throw new Error("Choose at least one Daypart to book.");

  return getDb().transaction(async (tx) => {
    const [residency] = await tx.select().from(residencies).where(and(
      eq(residencies.id, input.residencyId),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    )).limit(1);
    if (!residency) throw new Error("Residency not found.");
    const fullProgrammingClient = actor.kind === "residency" && residency.tier === "complete";

    const normalizedDayparts: DaypartBookingInput[] = [];
    for (const requested of input.dayparts) {
      if (requested.daypartId || !requested.createDaypart) {
        if (requested.daypartId) {
          normalizedDayparts.push(requested);
          continue;
        }
        const room = await findOrCreateResidencyRoom(tx, residency.id, requested.room ?? "", requested.roomId, undefined, false);
        normalizedDayparts.push({
          ...requested,
          roomId: room.id,
          room: room.name,
          calendarColor: await nextRoomDaypartColor(tx, room.id),
        });
        continue;
      }

      const name = requested.name?.trim() ?? "";
      const type = requested.type;
      if (!name || !type) throw new Error("Name the activity and choose its type before scheduling it.");
      if (residency.tier === "complete" && actor.kind === "residency" && type === "dj_artist") {
        throw new Error("HFY manages Talent Activities for Full Programming accounts.");
      }
      const room = await findOrCreateResidencyRoom(tx, residency.id, requested.room ?? "", requested.roomId, undefined, false);
      const [duplicate] = await tx.select({ id: dayparts.id }).from(dayparts).where(and(
        eq(dayparts.residencyId, residency.id),
        sql`lower(${dayparts.name}) = lower(${name})`,
      )).limit(1);
      if (duplicate) throw new Error(`A Daypart named “${name}” already exists in this Residency. Choose it from the room instead.`);

      const scheduleMode = requested.createDaypart.scheduleMode;
      const rules = scheduleMode === "standing_weekly" ? validateDaypartRules(requested.createDaypart.rules ?? []) : [];
      if (scheduleMode === "standing_weekly" && !rules.some((rule) => rule.weekday === weekdayForDate(input.serviceDate))) {
        throw new Error("A weekly activity scheduled today must include today's weekday.");
      }
      const billingMode = type === "house_activity"
        ? null
        : residency.tier === "complete" || actor.kind === "internal"
          ? "billed_by_hfy" as const
          : requested.billingMode ?? "tracking_only" as const;
      const color = await nextRoomDaypartColor(tx, room.id);
      const [createdDaypart] = await tx.insert(dayparts).values({
        residencyId: residency.id,
        roomId: room.id,
        name,
        room: room.name,
        color,
        type,
        billingMode,
        scheduleMode,
        suggestedStartMinute: scheduleMode === "calendar_only" ? requested.startMinute : null,
        suggestedEndMinute: scheduleMode === "calendar_only" ? requested.endMinute : null,
        defaultTalentRateCents: null,
        clientDefaultRateCents: type === "dj_artist" && billingMode === "tracking_only" ? requested.clientTalentDefaultRateCents ?? null : null,
        active: true,
      }).returning({ id: dayparts.id });
      if (rules.length) await tx.insert(daypartDayRules).values(rules.map((rule) => ({ daypartId: createdDaypart.id, ...rule })));
      await tx.insert(auditLog).values({
        residencyId: residency.id,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "daypart_created_from_calendar",
        entityType: "daypart",
        entityId: createdDaypart.id,
        details: { name, room: room.name, roomId: room.id, roomHue: room.hue, color, type, billingMode, scheduleMode, serviceDate: input.serviceDate, weekdays: rules.map((rule) => rule.weekday) },
      });
      normalizedDayparts.push({
        ...requested,
        daypartId: createdDaypart.id,
        roomId: room.id,
        room: room.name,
        calendarColor: color,
        billingMode,
      });
    }

    const requestedIds = normalizedDayparts.map((item) => item.daypartId).filter((id): id is string => Boolean(id));
    if (new Set(requestedIds).size !== requestedIds.length) throw new Error("Each Daypart can be booked only once per date.");

    const ruleRows = requestedIds.length ? await tx.select({
      daypartId: dayparts.id,
      roomId: dayparts.roomId,
      name: dayparts.name,
      room: dayparts.room,
      color: dayparts.color,
      type: dayparts.type,
      billingMode: dayparts.billingMode,
      defaultTalentRateCents: dayparts.defaultTalentRateCents,
      clientDefaultRateCents: dayparts.clientDefaultRateCents,
    }).from(dayparts)
      .where(and(
        eq(dayparts.residencyId, residency.id),
        eq(dayparts.active, true),
        or(isNull(dayparts.activeUntil), gte(dayparts.activeUntil, input.serviceDate)),
        inArray(dayparts.id, requestedIds),
      )) : [];
    if (ruleRows.length !== requestedIds.length) throw new Error("One or more Dayparts are not active on this date.");

    const [existingShifts, existingOccurrences] = requestedIds.length ? await Promise.all([
      tx.select({ id: shifts.id }).from(shifts).where(and(
        eq(shifts.residencyId, residency.id),
        eq(shifts.serviceDate, input.serviceDate),
        inArray(shifts.daypartId, requestedIds),
      )).limit(1),
      tx.select({ id: scheduleOccurrences.id }).from(scheduleOccurrences).where(and(
        eq(scheduleOccurrences.residencyId, residency.id),
        eq(scheduleOccurrences.serviceDate, input.serviceDate),
        inArray(scheduleOccurrences.daypartId, requestedIds),
      )).limit(1),
    ]) : [[], []];
    if (existingShifts.length || existingOccurrences.length) throw new Error("One of these Dayparts is already scheduled on this date.");

    const talentIds = fullProgrammingClient ? [] : [...new Set(normalizedDayparts.flatMap((item) => item.assignments.map((assignment) => assignment.talentId).filter((id): id is string => Boolean(id))))];
    if (actor.kind === "internal" && talentIds.length) assertResidencyTalentRateConfigured(residency.defaultTalentRateCents);
    const talentRows = talentIds.length ? await tx.select({
      id: talent.id,
      stageName: talent.stageName,
      ownership: talent.ownership,
      owningResidencyId: talent.owningResidencyId,
    }).from(talent)
      .innerJoin(residencyTalent, and(
        eq(residencyTalent.talentId, talent.id),
        eq(residencyTalent.residencyId, residency.id),
        eq(residencyTalent.active, true),
        actor.kind === "residency" ? eq(residencyTalent.clientVisible, true) : undefined,
      ))
      .where(and(
        inArray(talent.id, talentIds),
        eq(talent.talentStatus, "active"),
        isNull(talent.archivedAt),
        or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, residency.id)),
        actor.kind === "residency"
          ? and(eq(talent.ownership, "residency"), eq(talent.owningResidencyId, residency.id))
          : eq(talent.ownership, "hfy"),
      )) : [];
    if (talentRows.length !== talentIds.length) throw new Error("One or more selected artists are unavailable to this Residency.");

    const createdShiftIds: string[] = [];
    const createdOccurrenceIds: string[] = [];
    for (const requested of normalizedDayparts) {
      if (!Number.isInteger(requested.startMinute) || requested.startMinute < 0 || requested.startMinute >= 1440
        || !Number.isInteger(requested.endMinute) || requested.endMinute <= requested.startMinute || requested.endMinute > requested.startMinute + 1440) {
        throw new Error("Choose valid Daypart hours.");
      }
      const rule = requested.daypartId
        ? ruleRows.find((item) => item.daypartId === requested.daypartId)!
        : {
            daypartId: null,
            roomId: requested.roomId ?? null,
            name: requested.name?.trim() ?? "",
            room: requested.room?.trim() ?? "",
            color: requested.calendarColor ?? "#2783DC",
            type: requested.type ?? "dj_artist" as const,
            billingMode: requested.type === "house_activity"
              ? null
              : requested.billingMode ?? (actor.kind === "residency" ? "tracking_only" as const : "billed_by_hfy" as const),
            defaultTalentRateCents: null,
            clientDefaultRateCents: requested.clientTalentDefaultRateCents ?? null,
          };
      if (!rule.name || !rule.room || !/^#[0-9A-Fa-f]{6}$/.test(rule.color)) {
        throw new Error("A one-time slot needs a name, room, and valid calendar color.");
      }
      const startsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, requested.startMinute), residency.timezone);
      const endsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, requested.endMinute), residency.timezone);
      const fullProgrammingAutoRequest = fullProgrammingClient && (rule.type === "dj_artist" || requested.assignments.some((assignment) => Boolean(assignment.talentId)));
      const requestHfy = Boolean(requested.requestHfy || fullProgrammingAutoRequest);
      const effectiveAssignments = fullProgrammingAutoRequest ? [] : requested.assignments;
      const recordKind = requestHfy || (actor.kind === "residency" && rule.type === "dj_artist")
        ? "financial_shift" as const
        : daypartBookingRecordKind(rule.type, rule.billingMode);
      if (requested.requestHfy && !fullProgrammingAutoRequest && (actor.kind !== "residency" || rule.type !== "dj_artist" || requested.assignments.length)) {
        throw new Error("Request HFY must be a client-created DJ slot without a selected artist.");
      }
      if (!fullProgrammingClient && requested.daypartId && actor.kind === "residency" && rule.type === "dj_artist" && rule.billingMode === "billed_by_hfy") {
        throw new Error("Standing HFY Booking dates are managed by HFY automatically.");
      }
      if (!requested.daypartId && rule.color.toUpperCase() === HFY_BOOKED_COLOR) {
        throw new Error("HFY pink is reserved for fulfilled HFY bookings. Choose another calendar color.");
      }
      if (actor.kind === "residency" && recordKind === "financial_shift" && !requestHfy && !effectiveAssignments.length) {
        throw new Error("Choose one of your artists or use Request HFY.");
      }
      if (actor.kind === "residency" && !requested.daypartId && rule.type === "dj_artist" && !requestHfy
        && (!Number.isInteger(rule.clientDefaultRateCents) || (rule.clientDefaultRateCents ?? 0) <= 0)) {
        throw new Error("Enter a positive session artist rate before scheduling this one-time Talent Activity.");
      }
      const notes = requested.notes?.trim() ?? "";
      const programDetails = requested.programDetails?.trim() ?? "";
      const manualHostName = requested.manualHostName?.trim() ?? "";
      const assignmentWindows = effectiveAssignments.map((assignment) => ({
        startMinute: assignment.startsAtMinute ?? requested.startMinute,
        endMinute: assignment.endsAtMinute ?? requested.endMinute,
      }));
      if (assignmentWindows.some((window) => window.startMinute < requested.startMinute || window.endMinute > requested.endMinute || window.endMinute <= window.startMinute)) {
        throw new Error("Every artist must remain inside the Daypart hours.");
      }
      if (hasOverlappingAssignmentMinutes(assignmentWindows)) {
        throw new Error("Artist times cannot overlap within the same Daypart.");
      }

      for (let index = 0; index < effectiveAssignments.length; index += 1) {
        const selectedTalent = effectiveAssignments[index].talentId ? talentRows.find((item) => item.id === effectiveAssignments[index].talentId) : null;
        if (!selectedTalent) continue;
        const assignmentStartsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, assignmentWindows[index].startMinute), residency.timezone);
        const assignmentEndsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, assignmentWindows[index].endMinute), residency.timezone);
        const [financialConflict, trackingConflict] = await Promise.all([
          tx.select({ id: assignments.id }).from(assignments).where(and(
            eq(assignments.talentId, selectedTalent.id),
            inArray(assignments.bookingStatus, ["pending_hfy_confirmation", "offered", "confirmed"]),
            lt(assignments.startsAt, assignmentEndsAt),
            gt(assignments.endsAt, assignmentStartsAt),
          )).limit(1),
          tx.select({ id: scheduleOccurrenceTalent.id }).from(scheduleOccurrenceTalent).where(and(
            eq(scheduleOccurrenceTalent.talentId, selectedTalent.id),
            lt(scheduleOccurrenceTalent.startsAt, assignmentEndsAt),
            gt(scheduleOccurrenceTalent.endsAt, assignmentStartsAt),
          )).limit(1),
        ]);
        if (financialConflict.length || trackingConflict.length) throw new Error(`${selectedTalent.stageName} already has an overlapping active booking.`);
      }

      if (recordKind === "tracking_occurrence") {
        const [occurrence] = await tx.insert(scheduleOccurrences).values({
          residencyId: residency.id,
          roomId: rule.roomId,
          daypartId: rule.daypartId,
          serviceDate: input.serviceDate,
          name: rule.name,
          room: rule.room,
          color: rule.color.toUpperCase(),
          type: rule.type,
          notes,
          programDetails,
          manualHostName,
          startsAt,
          endsAt,
          createdByUserId: actor.userId,
        }).returning({ id: scheduleOccurrences.id });
        createdOccurrenceIds.push(occurrence.id);
        for (let index = 0; index < effectiveAssignments.length; index += 1) {
          const talentId = effectiveAssignments[index].talentId;
          if (!talentId) continue;
          await tx.insert(scheduleOccurrenceTalent).values({
            occurrenceId: occurrence.id,
            talentId,
            startsAt: zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, assignmentWindows[index].startMinute), residency.timezone),
            endsAt: zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, assignmentWindows[index].endMinute), residency.timezone),
          });
        }
        await tx.insert(auditLog).values({
          residencyId: residency.id,
          actorUserId: actor.userId,
          actorLabel: actor.email,
          action: "tracking_only_booking_created",
          entityType: "schedule_occurrence",
          entityId: occurrence.id,
          details: { daypartId: rule.daypartId, serviceDate: input.serviceDate, programDetails, manualHostName, talentIds: effectiveAssignments.map((item) => item.talentId) },
        });
        continue;
      }

      const economicsMode = actor.kind === "residency"
        ? requestHfy ? "hfy_request" as const : "client_owned" as const
        : "hfy" as const;
      const coveringInvoices = economicsMode === "hfy" ? await tx.select({ id: invoices.id, status: invoices.status }).from(invoices).where(and(
          eq(invoices.residencyId, residency.id),
          lte(invoices.billingPeriodStart, input.serviceDate),
          gte(invoices.billingPeriodEnd, input.serviceDate),
          ne(invoices.status, "void"),
        )) : [];
      const finalizedInvoice = residency.tier === "complete" && coveringInvoices.length === 1 && coveringInvoices[0].status !== "draft" ? coveringInvoices[0] : null;
      const linkedInvoice = finalizedInvoice ? null : coveringInvoices.length === 1 ? coveringInvoices[0] : null;
      const invoiceLinkNote = finalizedInvoice
        ? "Added after the service month was invoiced; carried to the next HFY Talent Invoice."
        : linkedInvoice
        ? ""
        : coveringInvoices.length
          ? "More than one Invoice covers this Shift."
          : "No Invoice period covers this Shift.";
      const clientRateCents = economicsMode === "hfy" ? resolveRateCents(requested.clientRateOverrideCents, residency.clientHourlyRateCents) : 0;
      const [shift] = await tx.insert(shifts).values({
        residencyId: residency.id,
        roomId: rule.roomId,
        daypartId: rule.daypartId,
        invoiceId: linkedInvoice?.id ?? null,
        name: rule.name,
        serviceDate: input.serviceDate,
        room: rule.room,
        calendarColor: requested.daypartId ? null : rule.color.toUpperCase(),
        startsAt,
        endsAt,
        notes,
        programDetails,
        manualHostName,
        economicsMode,
        clientTalentDefaultRateCents: economicsMode === "client_owned" ? rule.clientDefaultRateCents : null,
        clientRateOverrideCents: economicsMode === "hfy" ? requested.clientRateOverrideCents ?? null : null,
        clientRateCents,
        billingStatus: economicsMode === "hfy" ? finalizedInvoice ? "pending_adjustment" : "pending" : "not_billable",
        invoiceLinkIssue: economicsMode === "hfy" && !finalizedInvoice && !linkedInvoice,
        invoiceLinkNote: economicsMode === "hfy" ? invoiceLinkNote : "",
      }).returning({ id: shifts.id });
      createdShiftIds.push(shift.id);

      if (finalizedInvoice) {
        const adjustmentCents = calculateBillableAmountCents(startsAt, endsAt, clientRateCents);
        if (adjustmentCents <= 0) throw new Error("A positive client talent rate is required before adding service to an invoiced Full Programming month.");
        await tx.insert(talentInvoiceAdjustments).values({
          residencyId: residency.id,
          sourceInvoiceId: finalizedInvoice.id,
          sourceShiftId: shift.id,
          serviceDate: input.serviceDate,
          reason: "schedule_added_after_invoice",
          description: carryForwardAdjustmentDescription({ serviceDate: input.serviceDate, shiftName: rule.name, kind: "added" }),
          amountCents: adjustmentCents,
          createdByUserId: actor.userId,
        });
      }

      if (economicsMode === "hfy_request") {
        const [request] = await tx.insert(hfyTalentRequests).values({
          residencyId: residency.id,
          shiftId: shift.id,
          createdByUserId: actor.userId,
        }).returning({ id: hfyTalentRequests.id });
        await tx.insert(auditLog).values({
          residencyId: residency.id,
          actorUserId: actor.userId,
          actorLabel: actor.email,
          action: "hfy_talent_requested",
          entityType: "hfy_talent_request",
          entityId: request.id,
          details: { shiftId: shift.id, serviceDate: input.serviceDate, daypartId: rule.daypartId, sourceDaypartType: rule.type, autoTriggeredByFullProgramming: fullProgrammingAutoRequest },
        });
        continue;
      }

      for (let index = 0; index < effectiveAssignments.length; index += 1) {
        const assignmentInput = effectiveAssignments[index];
        const { startMinute: assignmentStartMinute, endMinute: assignmentEndMinute } = assignmentWindows[index];
        const assignmentStartsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, assignmentStartMinute), residency.timezone);
        const assignmentEndsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, assignmentEndMinute), residency.timezone);
        const selectedTalent = assignmentInput.talentId ? talentRows.find((item) => item.id === assignmentInput.talentId) : null;
        const compensationType = economicsMode === "client_owned" ? "na" as const : assignmentInput.compensationType ?? "hourly";
        const effectiveRateCents = economicsMode === "client_owned" ? 0 : resolveTalentRateCents(
            assignmentInput.talentRateOverrideCents,
            rule.defaultTalentRateCents,
            residency.defaultTalentRateCents,
          );
        const fixedFeeCents = economicsMode === "client_owned" ? null : compensationType === "fixed" ? assignmentInput.fixedFeeCents ?? 0 : null;
        const totalCompensationCents = calculateCompensationCents({
          compensationType,
          startsAt: assignmentStartsAt,
          endsAt: assignmentEndsAt,
          talentRateCents: effectiveRateCents,
          fixedFeeCents,
        });
        const [assignment] = await tx.insert(assignments).values({
          shiftId: shift.id,
          talentId: selectedTalent?.id ?? null,
          createdByUserId: actor.userId,
          source: economicsMode === "client_owned" ? "client_owned" : "internal",
          setName: selectedTalent?.stageName ?? `${rule.name} slot ${index + 1}`,
          startsAt: assignmentStartsAt,
          endsAt: assignmentEndsAt,
          bookingStatus: selectedTalent ? "confirmed" : "open",
          compensationType,
          talentRateOverrideCents: economicsMode === "client_owned" ? null : assignmentInput.talentRateOverrideCents ?? null,
          talentRateCents: effectiveRateCents,
          fixedFeeCents,
          totalCompensationCents,
          payoutStatus: compensationType === "na" ? "na" : "not_ready",
        }).returning({ id: assignments.id });
        if (economicsMode === "client_owned") {
          await tx.insert(clientAssignmentTerms).values({
            assignmentId: assignment.id,
            residencyId: residency.id,
            defaultRateCents: rule.clientDefaultRateCents,
            updatedByUserId: actor.userId,
          });
        }
        await tx.insert(auditLog).values({
          residencyId: residency.id,
          actorUserId: actor.userId,
          actorLabel: actor.email,
          action: "assignment_created",
          entityType: "assignment",
          entityId: assignment.id,
          details: {
            shiftId: shift.id,
            talentId: selectedTalent?.id ?? null,
            rateOverrideCents: assignmentInput.talentRateOverrideCents ?? null,
            daypartDefaultRateCents: rule.defaultTalentRateCents,
            clientDaypartDefaultRateCents: rule.clientDefaultRateCents,
            resolvedTalentRateCents: effectiveRateCents,
          },
        });
      }
      await tx.insert(auditLog).values({
        residencyId: residency.id,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: requested.daypartId ? "daypart_shift_created" : "one_time_shift_created",
        entityType: "shift",
        entityId: shift.id,
        details: { daypartId: rule.daypartId, serviceDate: input.serviceDate, programDetails, manualHostName, calendarColor: requested.daypartId ? null : rule.color, invoiceLinkIssue: coveringInvoices.length !== 1 },
      });
    }
    return { shiftIds: createdShiftIds, occurrenceIds: createdOccurrenceIds };
  });
}

export async function updateOneTimeShift(actor: AuditActor, input: UpdateOneTimeRecordInput) {
  const clean = validateOneTimeRecordInput(input);
  return getDb().transaction(async (tx) => {
    const [shift] = await tx.select({
      id: shifts.id,
      residencyId: shifts.residencyId,
      daypartId: shifts.daypartId,
      serviceDate: shifts.serviceDate,
      economicsMode: shifts.economicsMode,
      invoiceId: shifts.invoiceId,
      invoiceStatus: invoices.status,
      timezone: residencies.timezone,
      residencyTier: residencies.tier,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      clientRateCents: shifts.clientRateCents,
      clientTalentDefaultRateCents: shifts.clientTalentDefaultRateCents,
      shiftName: shifts.name,
    }).from(shifts)
      .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
      .leftJoin(invoices, eq(shifts.invoiceId, invoices.id))
      .where(and(eq(shifts.id, input.id), eq(residencies.active, true), eq(residencies.operatingMode, "operations")))
      .limit(1);
    if (!shift || shift.daypartId !== null) throw new Error("Only one-time slots can be edited here.");
    if (shift.economicsMode === "hfy_request") throw new Error("Cancel the pending HFY request before changing this one-time slot.");
    if (actor.kind === "residency" && shift.economicsMode !== "client_owned") throw new Error("HFY-managed slots cannot be edited by the client.");
    if (actor.kind === "internal" && shift.economicsMode !== "hfy") throw new Error("Client-owned slots are managed only by the client.");
    const finalizedFullProgrammingShift = shift.residencyTier === "complete" && Boolean(shift.invoiceId && shift.invoiceStatus && shift.invoiceStatus !== "draft");
    if (shift.invoiceStatus && shift.invoiceStatus !== "draft" && !finalizedFullProgrammingShift) throw new Error("This one-time slot is locked because its Invoice is finalized.");
    if (shift.economicsMode === "client_owned"
      && (!Number.isInteger(input.clientTalentDefaultRateCents) || (input.clientTalentDefaultRateCents ?? 0) <= 0)) {
      throw new Error("Enter a positive session artist rate.");
    }
    const assignedRoom = await findOrCreateResidencyRoom(tx, shift.residencyId, clean.room, input.roomId, input.roomHue, input.createRoom === true);
    const calendarColor = clean.calendarColor;

    const startsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(shift.serviceDate, input.startMinute), shift.timezone);
    const endsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(shift.serviceDate, input.endMinute), shift.timezone);
    const outsideAssignments = await tx.select({ id: assignments.id }).from(assignments).where(and(
      eq(assignments.shiftId, shift.id),
      ne(assignments.bookingStatus, "cancelled"),
      or(lt(assignments.startsAt, startsAt), gt(assignments.endsAt, endsAt)),
    )).limit(1);
    if (outsideAssignments.length) throw new Error("Adjust or remove artist hours that fall outside the new slot window first.");

    const adjustmentCents = finalizedFullProgrammingShift
      ? calculateBillableAmountCents(startsAt, endsAt, shift.clientRateCents) - calculateBillableAmountCents(shift.startsAt, shift.endsAt, shift.clientRateCents)
      : 0;
    if (finalizedFullProgrammingShift && shift.invoiceId && adjustmentCents !== 0) {
      await tx.insert(talentInvoiceAdjustments).values({
        residencyId: shift.residencyId,
        sourceInvoiceId: shift.invoiceId,
        sourceShiftId: shift.id,
        serviceDate: shift.serviceDate,
        reason: "schedule_hours_changed_after_invoice",
        description: carryForwardAdjustmentDescription({ serviceDate: shift.serviceDate, shiftName: shift.shiftName, kind: "hours_changed" }),
        amountCents: adjustmentCents,
        createdByUserId: actor.userId,
      });
    }

    await tx.update(shifts).set({
      name: clean.name,
      roomId: assignedRoom.id,
      room: assignedRoom.name,
      calendarColor,
      startsAt,
      endsAt,
      notes: input.notes?.trim() ?? "",
      programDetails: input.programDetails?.trim() ?? "",
      manualHostName: input.manualHostName?.trim() ?? "",
      clientTalentDefaultRateCents: shift.economicsMode === "client_owned" ? input.clientTalentDefaultRateCents ?? null : null,
      ...(finalizedFullProgrammingShift && adjustmentCents !== 0 ? {
        invoiceId: null,
        billingStatus: "pending_adjustment" as const,
        invoiceLinkIssue: false,
        invoiceLinkNote: "Schedule changed after the service month was invoiced; carried to the next HFY Talent Invoice.",
      } : {}),
      updatedAt: new Date(),
    }).where(eq(shifts.id, shift.id));
    if (shift.economicsMode === "client_owned") {
      const assignmentIds = await tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.shiftId, shift.id));
      if (assignmentIds.length) {
        await tx.update(clientAssignmentTerms).set({
          defaultRateCents: input.clientTalentDefaultRateCents ?? null,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        }).where(inArray(clientAssignmentTerms.assignmentId, assignmentIds.map((assignment) => assignment.id)));
      }
    }
    if (shift.invoiceId && !finalizedFullProgrammingShift) {
      await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.sourceShiftId, shift.id));
      const [remaining] = await tx.select({ total: sql<number>`coalesce(sum(${invoiceLineItems.totalCents}), 0)` }).from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, shift.invoiceId));
      await tx.update(invoices).set({ totalCents: Number(remaining?.total ?? 0), updatedAt: new Date() }).where(eq(invoices.id, shift.invoiceId));
    }
    await tx.insert(auditLog).values({
      residencyId: shift.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "one_time_shift_updated",
      entityType: "shift",
      entityId: shift.id,
      details: { serviceDate: shift.serviceDate, name: clean.name, room: assignedRoom.name, roomId: assignedRoom.id, calendarColor, startMinute: input.startMinute, endMinute: input.endMinute, clientTalentDefaultRateCents: shift.economicsMode === "client_owned" ? input.clientTalentDefaultRateCents ?? null : null, pendingTalentInvoiceAdjustmentCents: adjustmentCents },
    });
    return { id: shift.id };
  });
}

export async function updateOneTimeOccurrence(actor: AuditActor, input: UpdateOneTimeRecordInput) {
  const clean = validateOneTimeRecordInput(input);
  return getDb().transaction(async (tx) => {
    const [occurrence] = await tx.select({
      id: scheduleOccurrences.id,
      residencyId: scheduleOccurrences.residencyId,
      daypartId: scheduleOccurrences.daypartId,
      serviceDate: scheduleOccurrences.serviceDate,
      timezone: residencies.timezone,
    }).from(scheduleOccurrences)
      .innerJoin(residencies, eq(scheduleOccurrences.residencyId, residencies.id))
      .where(and(eq(scheduleOccurrences.id, input.id), eq(residencies.active, true), eq(residencies.operatingMode, "operations")))
      .limit(1)
      .for("update");
    if (!occurrence || occurrence.daypartId !== null) throw new Error("Only one-time activities can be edited here.");
    const assignedRoom = await findOrCreateResidencyRoom(tx, occurrence.residencyId, clean.room, input.roomId, input.roomHue, input.createRoom === true);
    const calendarColor = clean.calendarColor;
    const startsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(occurrence.serviceDate, input.startMinute), occurrence.timezone);
    const endsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(occurrence.serviceDate, input.endMinute), occurrence.timezone);
    const outsideTalent = await tx.select({ id: scheduleOccurrenceTalent.id }).from(scheduleOccurrenceTalent).where(and(
      eq(scheduleOccurrenceTalent.occurrenceId, occurrence.id),
      or(lt(scheduleOccurrenceTalent.startsAt, startsAt), gt(scheduleOccurrenceTalent.endsAt, endsAt)),
    )).limit(1);
    if (outsideTalent.length) throw new Error("Artist hours must stay inside the new activity window.");
    await tx.update(scheduleOccurrences).set({
      name: clean.name,
      roomId: assignedRoom.id,
      room: assignedRoom.name,
      color: calendarColor,
      startsAt,
      endsAt,
      notes: input.notes?.trim() ?? "",
      programDetails: input.programDetails?.trim() ?? "",
      manualHostName: input.manualHostName?.trim() ?? "",
      updatedAt: new Date(),
    }).where(eq(scheduleOccurrences.id, occurrence.id));
    await tx.insert(auditLog).values({
      residencyId: occurrence.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "one_time_occurrence_updated",
      entityType: "schedule_occurrence",
      entityId: occurrence.id,
      details: { serviceDate: occurrence.serviceDate, name: clean.name, room: assignedRoom.name, roomId: assignedRoom.id, calendarColor, startMinute: input.startMinute, endMinute: input.endMinute },
    });
    return { id: occurrence.id };
  });
}

export async function deleteOneTimeOccurrence(actor: AuditActor, occurrenceId: string) {
  return getDb().transaction(async (tx) => {
    const [occurrence] = await tx.select({
      id: scheduleOccurrences.id,
      residencyId: scheduleOccurrences.residencyId,
      daypartId: scheduleOccurrences.daypartId,
      serviceDate: scheduleOccurrences.serviceDate,
      name: scheduleOccurrences.name,
    }).from(scheduleOccurrences).where(eq(scheduleOccurrences.id, occurrenceId)).limit(1).for("update");
    if (!occurrence || occurrence.daypartId !== null) throw new Error("Only one-time activities can be deleted here.");
    await tx.delete(scheduleOccurrences).where(eq(scheduleOccurrences.id, occurrence.id));
    await tx.insert(auditLog).values({
      residencyId: occurrence.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "one_time_occurrence_deleted",
      entityType: "schedule_occurrence",
      entityId: occurrence.id,
      details: { serviceDate: occurrence.serviceDate, name: occurrence.name },
    });
    return occurrence;
  });
}

export async function addAssignmentToShift(actor: AuditActor, input: AddShiftAssignmentInput) {
  return getDb().transaction(async (tx) => {
    const [shift] = await tx.select({
      id: shifts.id,
      residencyId: shifts.residencyId,
      daypartId: shifts.daypartId,
      serviceDate: shifts.serviceDate,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      timezone: residencies.timezone,
      residencyTier: residencies.tier,
      defaultTalentRateCents: residencies.defaultTalentRateCents,
      daypartDefaultTalentRateCents: dayparts.defaultTalentRateCents,
      clientDaypartDefaultRateCents: dayparts.clientDefaultRateCents,
      clientTalentDefaultRateCents: shifts.clientTalentDefaultRateCents,
      economicsMode: shifts.economicsMode,
    }).from(shifts)
      .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
      .leftJoin(dayparts, eq(shifts.daypartId, dayparts.id))
      .where(and(eq(shifts.id, input.shiftId), eq(residencies.active, true), eq(residencies.operatingMode, "operations")))
      .limit(1);
    if (!shift) throw new Error("Shift not found.");

    if (actor.kind === "residency" && shift.residencyTier === "complete") throw new Error("HFY manages all talent for Full Programming accounts.");
    if (actor.kind === "residency" && shift.economicsMode !== "client_owned") throw new Error("HFY-managed slots cannot be edited by the client.");
    if (actor.kind === "internal" && shift.economicsMode !== "hfy") throw new Error("Client-owned slots are managed only by the client.");
    if (actor.kind === "internal") assertResidencyTalentRateConfigured(shift.defaultTalentRateCents);

    const [selectedTalent] = await tx.select({ id: talent.id, stageName: talent.stageName }).from(talent)
      .innerJoin(residencyTalent, and(
        eq(residencyTalent.talentId, talent.id),
        eq(residencyTalent.residencyId, shift.residencyId),
        eq(residencyTalent.active, true),
        actor.kind === "residency" ? eq(residencyTalent.clientVisible, true) : undefined,
      ))
      .where(and(
        eq(talent.id, input.talentId),
        eq(talent.talentStatus, "active"),
        isNull(talent.archivedAt),
        or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, shift.residencyId)),
        actor.kind === "residency"
          ? and(eq(talent.ownership, "residency"), eq(talent.owningResidencyId, shift.residencyId))
          : eq(talent.ownership, "hfy"),
      ))
      .limit(1);
    if (!selectedTalent) throw new Error("This DJ is unavailable to this Residency.");

    if (!Number.isInteger(input.startsAtMinute) || !Number.isInteger(input.endsAtMinute) || input.endsAtMinute <= input.startsAtMinute) {
      throw new Error("Choose valid DJ hours.");
    }
    const assignmentStartsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(shift.serviceDate, input.startsAtMinute), shift.timezone);
    const assignmentEndsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(shift.serviceDate, input.endsAtMinute), shift.timezone);
    if (assignmentStartsAt < shift.startsAt || assignmentEndsAt > shift.endsAt) {
      throw new Error("The DJ's hours must stay inside the Daypart service window.");
    }

    const overlappingShiftAssignment = await tx.select({ id: assignments.id }).from(assignments).where(and(
      eq(assignments.shiftId, shift.id),
      ne(assignments.bookingStatus, "cancelled"),
      lt(assignments.startsAt, assignmentEndsAt),
      gt(assignments.endsAt, assignmentStartsAt),
    )).limit(1);
    if (overlappingShiftAssignment.length) throw new Error("DJ times cannot overlap within the same Daypart Shift.");

    const artistConflict = await tx.select({ id: assignments.id }).from(assignments).where(and(
      eq(assignments.talentId, selectedTalent.id),
      inArray(assignments.bookingStatus, ["pending_hfy_confirmation", "offered", "confirmed"]),
      lt(assignments.startsAt, assignmentEndsAt),
      gt(assignments.endsAt, assignmentStartsAt),
    )).limit(1);
    if (artistConflict.length) throw new Error(`${selectedTalent.stageName} already has an overlapping active booking.`);

    const clientOwned = actor.kind === "residency";
    const compensationType = clientOwned ? "na" as const : input.compensationType ?? "hourly";
    const talentRateCents = clientOwned ? 0 : resolveTalentRateCents(
        input.talentRateOverrideCents,
        shift.daypartDefaultTalentRateCents,
        shift.defaultTalentRateCents,
      );
    const fixedFeeCents = clientOwned ? null : compensationType === "fixed" ? input.fixedFeeCents ?? 0 : null;
    const totalCompensationCents = calculateCompensationCents({
      compensationType,
      startsAt: assignmentStartsAt,
      endsAt: assignmentEndsAt,
      talentRateCents,
      fixedFeeCents,
    });
    const [assignment] = await tx.insert(assignments).values({
      shiftId: shift.id,
      talentId: selectedTalent.id,
      createdByUserId: actor.userId,
      source: clientOwned ? "client_owned" : "internal",
      setName: selectedTalent.stageName,
      startsAt: assignmentStartsAt,
      endsAt: assignmentEndsAt,
      bookingStatus: "confirmed",
      compensationType,
      talentRateOverrideCents: clientOwned ? null : input.talentRateOverrideCents ?? null,
      talentRateCents,
      fixedFeeCents,
      totalCompensationCents,
      payoutStatus: compensationType === "na" ? "na" : "not_ready",
    }).returning({ id: assignments.id });
    if (clientOwned) {
      await tx.insert(clientAssignmentTerms).values({
        assignmentId: assignment.id,
        residencyId: shift.residencyId,
        defaultRateCents: shift.clientTalentDefaultRateCents ?? shift.clientDaypartDefaultRateCents,
        updatedByUserId: actor.userId,
      });
    }
    await tx.insert(auditLog).values({
      residencyId: shift.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "assignment_added_to_shift",
      entityType: "assignment",
      entityId: assignment.id,
      details: { shiftId: shift.id, talentId: selectedTalent.id, startsAtMinute: input.startsAtMinute, endsAtMinute: input.endsAtMinute },
    });
    return { id: assignment.id };
  });
}
