import { and, eq, gt, inArray, isNull, lt, or, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, hfyTalentRequests, invoices, residencies, residencyTalent, shifts, talent } from "@/db/schema";
import { calculateCompensationCents } from "@/domain/airtable-parity";
import { localDateTimeForMinute, weekdayForDate } from "@/domain/dayparts";
import { zonedLocalDateTimeToUtc } from "@/domain/time";
import type { AuditActor, InternalActor } from "@/lib/auth";
import { assertResidencyClientRateConfigured, assertResidencyTalentRateConfigured } from "@/domain/residency-rates";

export type FulfillHfyTalentRequestInput = {
  requestId: string;
  assignments: Array<{
    talentId: string;
    startsAtMinute: number;
    endsAtMinute: number;
  }>;
};

export type CancelHfyTalentRequestInput = {
  residencyId: string;
  shiftId: string;
  daypartId: string | null;
  serviceDate: string;
};

export async function cancelHfyTalentRequest(actor: AuditActor, input: CancelHfyTalentRequestInput) {
  if (actor.kind !== "residency") throw new Error("Only the Residency can cancel its pending HFY request.");
  weekdayForDate(input.serviceDate);

  return getDb().transaction(async (tx) => {
    const [request] = await tx.select({
      id: hfyTalentRequests.id,
      status: hfyTalentRequests.status,
      residencyId: shifts.residencyId,
      daypartId: shifts.daypartId,
      serviceDate: shifts.serviceDate,
      economicsMode: shifts.economicsMode,
    }).from(hfyTalentRequests)
      .innerJoin(shifts, eq(hfyTalentRequests.shiftId, shifts.id))
      .where(and(
        eq(hfyTalentRequests.shiftId, input.shiftId),
        eq(shifts.residencyId, input.residencyId),
        input.daypartId ? eq(shifts.daypartId, input.daypartId) : isNull(shifts.daypartId),
        eq(shifts.serviceDate, input.serviceDate),
      ))
      .limit(1)
      .for("update");
    if (!request || request.status !== "pending" || request.economicsMode !== "hfy_request") {
      throw new Error("This dated HFY request is no longer pending.");
    }

    const cancelledAt = new Date();
    const [claimed] = await tx.update(hfyTalentRequests).set({
      status: "cancelled",
      updatedAt: cancelledAt,
    }).where(and(
      eq(hfyTalentRequests.id, request.id),
      eq(hfyTalentRequests.status, "pending"),
    )).returning({ id: hfyTalentRequests.id });
    if (!claimed) throw new Error("This dated HFY request is no longer pending.");

    await tx.delete(shifts).where(and(
      eq(shifts.id, input.shiftId),
      eq(shifts.residencyId, input.residencyId),
      input.daypartId ? eq(shifts.daypartId, input.daypartId) : isNull(shifts.daypartId),
      eq(shifts.serviceDate, input.serviceDate),
      eq(shifts.economicsMode, "hfy_request"),
    ));
    await tx.insert(auditLog).values({
      residencyId: input.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "hfy_talent_request_cancelled",
      entityType: "hfy_talent_request",
      entityId: request.id,
      details: {
        shiftId: input.shiftId,
        daypartId: input.daypartId,
        serviceDate: input.serviceDate,
      },
    });
    return { daypartId: input.daypartId, serviceDate: input.serviceDate };
  });
}

export async function fulfillHfyTalentRequest(actor: InternalActor, input: FulfillHfyTalentRequestInput) {
  if (!input.assignments.length) throw new Error("Choose at least one artist for this request.");
  if (input.assignments.length > 20) throw new Error("A request can include up to 20 artist segments.");

  return getDb().transaction(async (tx) => {
    const [request] = await tx.select({
      id: hfyTalentRequests.id,
      residencyId: hfyTalentRequests.residencyId,
      shiftId: hfyTalentRequests.shiftId,
      status: hfyTalentRequests.status,
      serviceDate: shifts.serviceDate,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      shiftName: shifts.name,
      economicsMode: shifts.economicsMode,
      timezone: residencies.timezone,
      defaultTalentRateCents: residencies.defaultTalentRateCents,
      clientHourlyRateCents: residencies.clientHourlyRateCents,
    }).from(hfyTalentRequests)
      .innerJoin(shifts, eq(hfyTalentRequests.shiftId, shifts.id))
      .innerJoin(residencies, eq(hfyTalentRequests.residencyId, residencies.id))
      .where(eq(hfyTalentRequests.id, input.requestId))
      .limit(1)
      .for("update");
    if (!request || request.status !== "pending" || request.economicsMode !== "hfy_request") {
      throw new Error("This HFY request is no longer pending.");
    }
    assertResidencyTalentRateConfigured(request.defaultTalentRateCents);
    assertResidencyClientRateConfigured(request.clientHourlyRateCents);

    const talentIds = input.assignments.map((assignment) => assignment.talentId);
    if (new Set(talentIds).size !== talentIds.length) throw new Error("Choose each artist only once for this request.");
    const windows = input.assignments.map((assignment) => {
      if (!Number.isInteger(assignment.startsAtMinute) || !Number.isInteger(assignment.endsAtMinute)
        || assignment.startsAtMinute < 0 || assignment.endsAtMinute > 2879
        || assignment.endsAtMinute <= assignment.startsAtMinute) {
        throw new Error("Choose valid start and end times for every artist.");
      }
      const startsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(request.serviceDate, assignment.startsAtMinute), request.timezone);
      const endsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(request.serviceDate, assignment.endsAtMinute), request.timezone);
      if (startsAt < request.startsAt || endsAt > request.endsAt || endsAt <= startsAt) {
        throw new Error("Every artist's hours must stay inside the client request.");
      }
      return { ...assignment, startsAt, endsAt };
    }).sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
    if (windows[0].startsAt.getTime() !== request.startsAt.getTime()
      || windows.at(-1)?.endsAt.getTime() !== request.endsAt.getTime()
      || windows.some((window, index) => index > 0 && window.startsAt.getTime() !== windows[index - 1].endsAt.getTime())) {
      throw new Error("Artist times must cover the full client request without gaps or overlaps.");
    }

    const selectedTalent = await tx.select({ id: talent.id, stageName: talent.stageName }).from(talent).where(and(
      inArray(talent.id, talentIds),
      eq(talent.ownership, "hfy"),
      eq(talent.talentStatus, "active"),
      isNull(talent.archivedAt),
      or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, request.residencyId)),
    ));
    if (selectedTalent.length !== talentIds.length) throw new Error("Choose active HFY artists available to this Residency.");
    const talentById = new Map(selectedTalent.map((artist) => [artist.id, artist]));

    const conflicts = await tx.select({ talentId: assignments.talentId, startsAt: assignments.startsAt, endsAt: assignments.endsAt }).from(assignments).where(and(
      inArray(assignments.talentId, talentIds),
      inArray(assignments.bookingStatus, ["pending_hfy_confirmation", "offered", "confirmed"]),
      lt(assignments.startsAt, request.endsAt),
      gt(assignments.endsAt, request.startsAt),
    ));
    const conflictedWindow = windows.find((window) => conflicts.some((conflict) => (
      conflict.talentId === window.talentId && conflict.startsAt < window.endsAt && conflict.endsAt > window.startsAt
    )));
    if (conflictedWindow) throw new Error(`${talentById.get(conflictedWindow.talentId)?.stageName ?? "That artist"} already has an overlapping active booking.`);

    await tx.insert(residencyTalent).values(selectedTalent.map((artist) => ({
      residencyId: request.residencyId,
      talentId: artist.id,
      approvedByUserId: actor.userId,
      active: true,
    }))).onConflictDoUpdate({
      target: [residencyTalent.residencyId, residencyTalent.talentId],
      set: { active: true, approvedByUserId: actor.userId },
    });

    const createdAssignments = await tx.insert(assignments).values(windows.map((window) => {
      const selectedArtist = talentById.get(window.talentId)!;
      return {
        shiftId: request.shiftId,
        talentId: selectedArtist.id,
        createdByUserId: actor.userId,
        source: "hfy_request",
        setName: selectedArtist.stageName,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        bookingStatus: "confirmed" as const,
        compensationType: "hourly" as const,
        talentRateOverrideCents: null,
        talentRateCents: request.defaultTalentRateCents,
        totalCompensationCents: calculateCompensationCents({
          compensationType: "hourly",
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          talentRateCents: request.defaultTalentRateCents,
          fixedFeeCents: null,
        }),
        payoutStatus: "not_ready" as const,
      };
    })).returning({ id: assignments.id, talentId: assignments.talentId });

    const coveringInvoices = await tx.select({ id: invoices.id }).from(invoices).where(and(
      eq(invoices.residencyId, request.residencyId),
      eq(invoices.kind, "scheduled_period"),
      lte(invoices.billingPeriodStart, request.serviceDate),
      gte(invoices.billingPeriodEnd, request.serviceDate),
      eq(invoices.status, "draft"),
    ));
    const invoiceLinkNote = coveringInvoices.length === 1
      ? ""
      : coveringInvoices.length
        ? "More than one Invoice covers this Shift."
        : "No Invoice period covers this Shift.";
    await tx.update(shifts).set({
      economicsMode: "hfy",
      invoiceId: coveringInvoices.length === 1 ? coveringInvoices[0].id : null,
      clientRateOverrideCents: null,
      clientRateCents: request.clientHourlyRateCents,
      billingStatus: "pending",
      invoiceLinkIssue: coveringInvoices.length !== 1,
      invoiceLinkNote,
      updatedAt: new Date(),
    }).where(eq(shifts.id, request.shiftId));
    const fulfilledAt = new Date();
    await tx.update(hfyTalentRequests).set({
      status: "fulfilled",
      fulfilledAssignmentId: createdAssignments[0].id,
      fulfilledByUserId: actor.userId,
      fulfilledAt,
      updatedAt: fulfilledAt,
    }).where(and(eq(hfyTalentRequests.id, request.id), eq(hfyTalentRequests.status, "pending")));
    await tx.insert(auditLog).values({
      residencyId: request.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "hfy_talent_request_fulfilled",
      entityType: "hfy_talent_request",
      entityId: request.id,
      details: {
        shiftId: request.shiftId,
        assignmentIds: createdAssignments.map((assignment) => assignment.id),
        talentIds,
        clientRateCents: request.clientHourlyRateCents,
        artistRateCents: request.defaultTalentRateCents,
      },
    });
    return {
      assignmentIds: createdAssignments.map((assignment) => assignment.id),
      artistNames: windows.map((window) => talentById.get(window.talentId)!.stageName),
    };
  });
}
