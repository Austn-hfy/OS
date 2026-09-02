import { and, eq, gt, inArray, isNull, lt, ne, gte, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, clientAssignmentTerms, dayparts, hfyTalentRequests, invoices, residencies, residencyTalent, scheduleOccurrences, scheduleOccurrenceTalent, shifts, talent } from "@/db/schema";
import { calculateCompensationCents, resolveRateCents, resolveTalentRateCents } from "@/domain/airtable-parity";
import { HFY_BOOKED_COLOR, daypartBookingRecordKind, hasOverlappingAssignmentMinutes, localDateTimeForMinute, type DaypartBillingMode, type DaypartType } from "@/domain/dayparts";
import { zonedLocalDateTimeToUtc } from "@/domain/time";
import { assertResidencyTalentRateConfigured } from "@/domain/residency-rates";
import type { AuditActor } from "@/lib/auth";

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
  name?: string;
  room?: string;
  calendarColor?: string;
  type?: DaypartType;
  billingMode?: DaypartBillingMode | null;
  startMinute: number;
  endMinute: number;
  clientRateOverrideCents?: number | null;
  notes?: string;
  programDetails?: string;
  manualHostName?: string;
  requestHfy?: boolean;
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

export async function createResidencyDateBooking(actor: AuditActor, input: CreateResidencyDateBookingInput) {
  if (!input.dayparts.length) throw new Error("Choose at least one Daypart to book.");
  const requestedIds = input.dayparts.map((item) => item.daypartId).filter((id): id is string => Boolean(id));
  if (new Set(requestedIds).size !== requestedIds.length) throw new Error("Each Daypart can be booked only once per date.");

  return getDb().transaction(async (tx) => {
    const [residency] = await tx.select().from(residencies).where(and(
      eq(residencies.id, input.residencyId),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    )).limit(1);
    if (!residency) throw new Error("Residency not found.");

    const ruleRows = requestedIds.length ? await tx.select({
      daypartId: dayparts.id,
      name: dayparts.name,
      room: dayparts.room,
      color: dayparts.color,
      type: dayparts.type,
      billingMode: dayparts.billingMode,
      defaultTalentRateCents: dayparts.defaultTalentRateCents,
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

    const talentIds = [...new Set(input.dayparts.flatMap((item) => item.assignments.map((assignment) => assignment.talentId).filter((id): id is string => Boolean(id))))];
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
    for (const requested of input.dayparts) {
      if (!Number.isInteger(requested.startMinute) || requested.startMinute < 0 || requested.startMinute >= 1440
        || !Number.isInteger(requested.endMinute) || requested.endMinute <= requested.startMinute || requested.endMinute > requested.startMinute + 1440) {
        throw new Error("Choose valid Daypart hours.");
      }
      const rule = requested.daypartId
        ? ruleRows.find((item) => item.daypartId === requested.daypartId)!
        : {
            daypartId: null,
            name: requested.name?.trim() ?? "",
            room: requested.room?.trim() ?? "",
            color: requested.calendarColor ?? "#2783DC",
            type: requested.type ?? "dj_artist" as const,
            billingMode: requested.type === "house_activity"
              ? null
              : requested.billingMode ?? (actor.kind === "residency" ? "tracking_only" as const : "billed_by_hfy" as const),
            defaultTalentRateCents: null,
          };
      if (!rule.name || !rule.room || !/^#[0-9A-Fa-f]{6}$/.test(rule.color)) {
        throw new Error("A one-time slot needs a name, room, and valid calendar color.");
      }
      const startsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, requested.startMinute), residency.timezone);
      const endsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, requested.endMinute), residency.timezone);
      const recordKind = actor.kind === "residency" && rule.type === "dj_artist"
        ? "financial_shift" as const
        : daypartBookingRecordKind(rule.type, rule.billingMode);
      if (requested.requestHfy && (actor.kind !== "residency" || rule.type !== "dj_artist" || requested.assignments.length)) {
        throw new Error("Request HFY must be a client-created DJ slot without a selected artist.");
      }
      if (requested.daypartId && actor.kind === "residency" && rule.type === "dj_artist" && rule.billingMode === "billed_by_hfy") {
        throw new Error("Standing HFY Booking dates are managed by HFY automatically.");
      }
      if (!requested.daypartId && rule.color.toUpperCase() === HFY_BOOKED_COLOR) {
        throw new Error("HFY pink is reserved for fulfilled HFY bookings. Choose another calendar color.");
      }
      if (actor.kind === "residency" && recordKind === "financial_shift" && !requested.requestHfy && !requested.assignments.length) {
        throw new Error("Choose one of your artists or use Request HFY.");
      }
      const notes = requested.notes?.trim() ?? "";
      const programDetails = requested.programDetails?.trim() ?? "";
      const manualHostName = requested.manualHostName?.trim() ?? "";
      const assignmentWindows = requested.assignments.map((assignment) => ({
        startMinute: assignment.startsAtMinute ?? requested.startMinute,
        endMinute: assignment.endsAtMinute ?? requested.endMinute,
      }));
      if (assignmentWindows.some((window) => window.startMinute < requested.startMinute || window.endMinute > requested.endMinute || window.endMinute <= window.startMinute)) {
        throw new Error("Every artist must remain inside the Daypart hours.");
      }
      if (hasOverlappingAssignmentMinutes(assignmentWindows)) {
        throw new Error("Artist times cannot overlap within the same Daypart.");
      }

      for (let index = 0; index < requested.assignments.length; index += 1) {
        const selectedTalent = requested.assignments[index].talentId ? talentRows.find((item) => item.id === requested.assignments[index].talentId) : null;
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
        for (let index = 0; index < requested.assignments.length; index += 1) {
          const talentId = requested.assignments[index].talentId;
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
          details: { daypartId: rule.daypartId, serviceDate: input.serviceDate, programDetails, manualHostName, talentIds: requested.assignments.map((item) => item.talentId) },
        });
        continue;
      }

      const economicsMode = actor.kind === "residency"
        ? requested.requestHfy ? "hfy_request" as const : "client_owned" as const
        : "hfy" as const;
      const coveringInvoices = economicsMode === "hfy" ? await tx.select({ id: invoices.id }).from(invoices).where(and(
          eq(invoices.residencyId, residency.id),
          lte(invoices.billingPeriodStart, input.serviceDate),
          gte(invoices.billingPeriodEnd, input.serviceDate),
          ne(invoices.status, "void"),
        )) : [];
      const invoiceLinkNote = coveringInvoices.length === 1
        ? ""
        : coveringInvoices.length
          ? "More than one Invoice covers this Shift."
          : "No Invoice period covers this Shift.";
      const [shift] = await tx.insert(shifts).values({
        residencyId: residency.id,
        daypartId: rule.daypartId,
        invoiceId: coveringInvoices.length === 1 ? coveringInvoices[0].id : null,
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
        clientRateOverrideCents: economicsMode === "hfy" ? requested.clientRateOverrideCents ?? null : null,
        clientRateCents: economicsMode === "hfy" ? resolveRateCents(requested.clientRateOverrideCents, residency.clientHourlyRateCents) : 0,
        billingStatus: economicsMode === "hfy" ? "pending" : "not_billable",
        invoiceLinkIssue: economicsMode === "hfy" && coveringInvoices.length !== 1,
        invoiceLinkNote: economicsMode === "hfy" ? invoiceLinkNote : "",
      }).returning({ id: shifts.id });
      createdShiftIds.push(shift.id);

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
          details: { shiftId: shift.id, serviceDate: input.serviceDate, daypartId: rule.daypartId },
        });
        continue;
      }

      for (let index = 0; index < requested.assignments.length; index += 1) {
        const assignmentInput = requested.assignments[index];
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
      defaultTalentRateCents: residencies.defaultTalentRateCents,
      daypartDefaultTalentRateCents: dayparts.defaultTalentRateCents,
      economicsMode: shifts.economicsMode,
    }).from(shifts)
      .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
      .leftJoin(dayparts, eq(shifts.daypartId, dayparts.id))
      .where(and(eq(shifts.id, input.shiftId), eq(residencies.active, true), eq(residencies.operatingMode, "operations")))
      .limit(1);
    if (!shift) throw new Error("Shift not found.");

    if (actor.kind === "residency" && shift.economicsMode !== "client_owned") throw new Error("HFY-managed slots cannot be edited by the client.");
    if (actor.kind === "internal" && shift.economicsMode !== "hfy") throw new Error("Client-owned slots are managed only by the client.");
    if (actor.kind === "internal") assertResidencyTalentRateConfigured(shift.defaultTalentRateCents);

    const [selectedTalent] = await tx.select({ id: talent.id, stageName: talent.stageName }).from(talent)
      .innerJoin(residencyTalent, and(
        eq(residencyTalent.talentId, talent.id),
        eq(residencyTalent.residencyId, shift.residencyId),
        eq(residencyTalent.active, true),
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
