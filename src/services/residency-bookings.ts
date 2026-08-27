import { and, eq, gt, inArray, isNull, lt, ne, gte, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, dayparts, invoices, residencies, residencyTalent, shifts, talent } from "@/db/schema";
import { calculateCompensationCents, resolveRateCents, resolveTalentRateCents } from "@/domain/airtable-parity";
import { hasOverlappingAssignmentMinutes, localDateTimeForMinute } from "@/domain/dayparts";
import { zonedLocalDateTimeToUtc } from "@/domain/time";
import type { InternalActor } from "@/lib/auth";

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
  startMinute: number;
  endMinute: number;
  clientRateOverrideCents?: number | null;
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

export async function createResidencyDateBooking(actor: InternalActor, input: CreateResidencyDateBookingInput) {
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
      defaultTalentRateCents: dayparts.defaultTalentRateCents,
    }).from(dayparts)
      .where(and(
        eq(dayparts.residencyId, residency.id),
        eq(dayparts.active, true),
        or(isNull(dayparts.activeUntil), gte(dayparts.activeUntil, input.serviceDate)),
        inArray(dayparts.id, requestedIds),
      )) : [];
    if (ruleRows.length !== requestedIds.length) throw new Error("One or more Dayparts are not active on this date.");

    const existing = requestedIds.length ? await tx.select({ id: shifts.id }).from(shifts).where(and(
      eq(shifts.residencyId, residency.id),
      eq(shifts.serviceDate, input.serviceDate),
      inArray(shifts.daypartId, requestedIds),
    )).limit(1) : [];
    if (existing.length) throw new Error("One of these Dayparts already has a Shift on this date.");

    const talentIds = [...new Set(input.dayparts.flatMap((item) => item.assignments.map((assignment) => assignment.talentId).filter((id): id is string => Boolean(id))))];
    const talentRows = talentIds.length ? await tx.select({ id: talent.id, stageName: talent.stageName }).from(talent)
      .innerJoin(residencyTalent, eq(residencyTalent.talentId, talent.id))
      .where(and(
        inArray(talent.id, talentIds),
        eq(talent.talentStatus, "active"),
        eq(residencyTalent.residencyId, residency.id),
        eq(residencyTalent.active, true),
      )) : [];
    if (talentRows.length !== talentIds.length) throw new Error("One or more selected DJs are not active on this Residency's approved list.");

    const createdShiftIds: string[] = [];
    for (const requested of input.dayparts) {
      if (!Number.isInteger(requested.startMinute) || requested.startMinute < 0 || requested.startMinute >= 1440
        || !Number.isInteger(requested.endMinute) || requested.endMinute <= requested.startMinute || requested.endMinute > requested.startMinute + 1440) {
        throw new Error("Choose valid Daypart hours.");
      }
      if (!requested.assignments.length) throw new Error("Each selected Daypart needs at least one DJ slot.");
      const assignmentWindows = requested.assignments.map((assignment) => ({
        startMinute: assignment.startsAtMinute ?? requested.startMinute,
        endMinute: assignment.endsAtMinute ?? requested.endMinute,
      }));
      if (assignmentWindows.some((window) => window.startMinute < requested.startMinute || window.endMinute > requested.endMinute || window.endMinute <= window.startMinute)) {
        throw new Error("Every Assignment must remain inside its Daypart Shift.");
      }
      if (hasOverlappingAssignmentMinutes(assignmentWindows)) {
        throw new Error("DJ times cannot overlap within the same Daypart Shift.");
      }
      const rule = requested.daypartId
        ? ruleRows.find((item) => item.daypartId === requested.daypartId)!
        : {
            daypartId: null,
            name: requested.name?.trim() ?? "",
            room: requested.room?.trim() ?? "",
            color: requested.calendarColor ?? "#2783DC",
            defaultTalentRateCents: null,
          };
      if (!rule.name || !rule.room || !/^#[0-9A-Fa-f]{6}$/.test(rule.color)) {
        throw new Error("A one-time slot needs a name, room, and valid calendar color.");
      }
      const startsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, requested.startMinute), residency.timezone);
      const endsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, requested.endMinute), residency.timezone);
      const coveringInvoices = await tx.select({ id: invoices.id }).from(invoices).where(and(
        eq(invoices.residencyId, residency.id),
        lte(invoices.billingPeriodStart, input.serviceDate),
        gte(invoices.billingPeriodEnd, input.serviceDate),
        ne(invoices.status, "void"),
      ));
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
        clientRateOverrideCents: requested.clientRateOverrideCents ?? null,
        clientRateCents: resolveRateCents(requested.clientRateOverrideCents, residency.clientHourlyRateCents),
        billingStatus: "pending",
        invoiceLinkIssue: coveringInvoices.length !== 1,
        invoiceLinkNote,
      }).returning({ id: shifts.id });
      createdShiftIds.push(shift.id);

      for (let index = 0; index < requested.assignments.length; index += 1) {
        const assignmentInput = requested.assignments[index];
        const { startMinute: assignmentStartMinute, endMinute: assignmentEndMinute } = assignmentWindows[index];
        const assignmentStartsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, assignmentStartMinute), residency.timezone);
        const assignmentEndsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(input.serviceDate, assignmentEndMinute), residency.timezone);
        const selectedTalent = assignmentInput.talentId ? talentRows.find((item) => item.id === assignmentInput.talentId) : null;
        const compensationType = assignmentInput.compensationType ?? "hourly";
        const effectiveRateCents = resolveTalentRateCents(
          assignmentInput.talentRateOverrideCents,
          rule.defaultTalentRateCents,
          residency.defaultTalentRateCents,
        );
        const fixedFeeCents = compensationType === "fixed" ? assignmentInput.fixedFeeCents ?? 0 : null;
        if (selectedTalent) {
          const conflict = await tx.select({ id: assignments.id }).from(assignments).where(and(
            eq(assignments.talentId, selectedTalent.id),
            inArray(assignments.bookingStatus, ["pending_hfy_confirmation", "offered", "confirmed"]),
            lt(assignments.startsAt, assignmentEndsAt),
            gt(assignments.endsAt, assignmentStartsAt),
          )).limit(1);
          if (conflict.length) throw new Error(`${selectedTalent.stageName} already has an overlapping active booking.`);
        }
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
          source: "internal",
          setName: selectedTalent?.stageName ?? `${rule.name} slot ${index + 1}`,
          startsAt: assignmentStartsAt,
          endsAt: assignmentEndsAt,
          bookingStatus: selectedTalent ? "confirmed" : "open",
          compensationType,
          talentRateOverrideCents: assignmentInput.talentRateOverrideCents ?? null,
          talentRateCents: effectiveRateCents,
          fixedFeeCents,
          totalCompensationCents,
          payoutStatus: compensationType === "na" ? "na" : "not_ready",
        }).returning({ id: assignments.id });
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
        details: { daypartId: rule.daypartId, serviceDate: input.serviceDate, calendarColor: requested.daypartId ? null : rule.color, invoiceLinkIssue: coveringInvoices.length !== 1 },
      });
    }
    return { shiftIds: createdShiftIds };
  });
}

export async function addAssignmentToShift(actor: InternalActor, input: AddShiftAssignmentInput) {
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
    }).from(shifts)
      .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
      .leftJoin(dayparts, eq(shifts.daypartId, dayparts.id))
      .where(and(eq(shifts.id, input.shiftId), eq(residencies.active, true), eq(residencies.operatingMode, "operations")))
      .limit(1);
    if (!shift) throw new Error("Shift not found.");

    const [selectedTalent] = await tx.select({ id: talent.id, stageName: talent.stageName }).from(talent)
      .innerJoin(residencyTalent, eq(residencyTalent.talentId, talent.id))
      .where(and(
        eq(talent.id, input.talentId),
        eq(talent.talentStatus, "active"),
        eq(residencyTalent.residencyId, shift.residencyId),
        eq(residencyTalent.active, true),
      ))
      .limit(1);
    if (!selectedTalent) throw new Error("This DJ is not active on the Residency's approved list.");

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

    const compensationType = input.compensationType ?? "hourly";
    const talentRateCents = resolveTalentRateCents(
      input.talentRateOverrideCents,
      shift.daypartDefaultTalentRateCents,
      shift.defaultTalentRateCents,
    );
    const fixedFeeCents = compensationType === "fixed" ? input.fixedFeeCents ?? 0 : null;
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
      source: "internal",
      setName: selectedTalent.stageName,
      startsAt: assignmentStartsAt,
      endsAt: assignmentEndsAt,
      bookingStatus: "confirmed",
      compensationType,
      talentRateOverrideCents: input.talentRateOverrideCents ?? null,
      talentRateCents,
      fixedFeeCents,
      totalCompensationCents,
      payoutStatus: compensationType === "na" ? "na" : "not_ready",
    }).returning({ id: assignments.id });
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
