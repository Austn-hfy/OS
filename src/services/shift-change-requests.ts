import "server-only";

import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, daypartDateExceptions, dayparts, residencies, scheduleOccurrences, shiftChangeRequests, shifts, users } from "@/db/schema";
import { addDays } from "@/domain/airtable-parity";
import { ResidencyAccessError, type AuditActor, type InternalActor } from "@/lib/auth";
import { skipDaypartDateInTransaction } from "@/services/dayparts";
import { deleteShiftInTransaction, updateShiftTimeInTransaction } from "@/services/shifts";
import type { DatabaseTransaction } from "@/services/rooms";

export type ShiftChangeRequestDecision = "approved" | "denied";

export type ResolveShiftChangeRequestInput = {
  requestId: string;
  decision: ShiftChangeRequestDecision;
  resolutionNote: string;
};

function assertInternalActor(actor: AuditActor): asserts actor is InternalActor {
  if (actor.kind !== "internal") {
    throw new ResidencyAccessError(403, "Owner/admin access is required to resolve Shift requests.");
  }
}

async function markRequestResolved(
  tx: DatabaseTransaction,
  actor: InternalActor,
  requestId: string,
  status: ShiftChangeRequestDecision,
  resolutionNote: string | null,
  resolvedAt: Date,
) {
  const [resolved] = await tx.update(shiftChangeRequests).set({
    status,
    resolvedBy: actor.userId,
    resolutionNote,
    resolvedAt,
    updatedAt: resolvedAt,
  }).where(and(
    eq(shiftChangeRequests.id, requestId),
    eq(shiftChangeRequests.status, "pending"),
  )).returning({ id: shiftChangeRequests.id });
  if (!resolved) throw new Error("This request has already been resolved.");
}

async function endDaypartFromDate(
  tx: DatabaseTransaction,
  actor: InternalActor,
  request: { requestId: string; shiftId: string; residencyId: string; daypartId: string; serviceDate: string },
) {
  const [daypart] = await tx.select({
    id: dayparts.id,
    name: dayparts.name,
    scheduleMode: dayparts.scheduleMode,
    active: dayparts.active,
    activeUntil: dayparts.activeUntil,
  }).from(dayparts).where(and(
    eq(dayparts.id, request.daypartId),
    eq(dayparts.residencyId, request.residencyId),
  )).limit(1).for("update");
  if (!daypart) throw new Error("The Daypart for this Shift no longer exists.");
  if (daypart.scheduleMode === "calendar_only") {
    await deleteShiftInTransaction(tx, actor, request.shiftId);
    return;
  }

  const futureShifts = await tx.select({
    id: shifts.id,
    serviceDate: shifts.serviceDate,
  }).from(shifts).where(and(
    eq(shifts.daypartId, daypart.id),
    gte(shifts.serviceDate, request.serviceDate),
  )).orderBy(asc(shifts.serviceDate)).for("update", { of: shifts });
  if (!futureShifts.some((shift) => shift.id === request.shiftId)) {
    throw new Error("The requested Shift is no longer part of this recurring Daypart.");
  }
  const [otherPendingRequest] = await tx.select({ id: shiftChangeRequests.id })
    .from(shiftChangeRequests)
    .where(and(
      eq(shiftChangeRequests.status, "pending"),
      inArray(shiftChangeRequests.shiftId, futureShifts.map((shift) => shift.id)),
      ne(shiftChangeRequests.id, request.requestId),
    ))
    .limit(1);
  if (otherPendingRequest) {
    throw new Error("Resolve the other pending requests on future occurrences before ending this recurrence.");
  }

  for (const shift of futureShifts) {
    await deleteShiftInTransaction(tx, actor, shift.id, { audit: false });
  }
  await tx.delete(scheduleOccurrences).where(and(
    eq(scheduleOccurrences.daypartId, daypart.id),
    gte(scheduleOccurrences.serviceDate, request.serviceDate),
  ));
  await tx.delete(daypartDateExceptions).where(and(
    eq(daypartDateExceptions.daypartId, daypart.id),
    gte(daypartDateExceptions.serviceDate, request.serviceDate),
  ));

  const endsAfter = addDays(request.serviceDate, -1);
  const activeUntil = daypart.activeUntil && daypart.activeUntil < endsAfter ? daypart.activeUntil : endsAfter;
  await tx.update(dayparts).set({
    active: daypart.active,
    activeUntil,
    updatedAt: new Date(),
  }).where(eq(dayparts.id, daypart.id));
  await tx.insert(auditLog).values({
    residencyId: request.residencyId,
    actorUserId: actor.userId,
    actorLabel: actor.email,
    action: "daypart_recurrence_ended",
    entityType: "daypart",
    entityId: daypart.id,
    details: {
      name: daypart.name,
      requestedShiftId: request.shiftId,
      endedFrom: request.serviceDate,
      activeUntil,
      removedShiftIds: futureShifts.map((shift) => shift.id),
      historicalRecordsPreserved: true,
    },
  });
}

export async function resolveShiftChangeRequest(actor: AuditActor, input: ResolveShiftChangeRequestInput) {
  assertInternalActor(actor);
  const resolutionNote = input.resolutionNote.trim();
  if (input.decision === "denied" && !resolutionNote) {
    throw new Error("Add a resolution note explaining why this request is denied.");
  }

  return getDb().transaction(async (tx) => {
    const [request] = await tx.select({
      id: shiftChangeRequests.id,
      shiftId: shiftChangeRequests.shiftId,
      residencyId: shiftChangeRequests.residencyId,
      requestType: shiftChangeRequests.requestType,
      managerNote: shiftChangeRequests.managerNote,
      proposedStartAt: shiftChangeRequests.proposedStartAt,
      proposedEndAt: shiftChangeRequests.proposedEndAt,
      status: shiftChangeRequests.status,
      requestedByName: users.displayName,
      requestedByEmail: users.email,
      residencyName: residencies.name,
      shiftName: shifts.name,
      room: shifts.room,
      serviceDate: shifts.serviceDate,
      daypartId: shifts.daypartId,
      economicsMode: shifts.economicsMode,
    }).from(shiftChangeRequests)
      .innerJoin(shifts, eq(shiftChangeRequests.shiftId, shifts.id))
      .innerJoin(residencies, eq(shiftChangeRequests.residencyId, residencies.id))
      .innerJoin(users, eq(shiftChangeRequests.requestedBy, users.id))
      .where(eq(shiftChangeRequests.id, input.requestId))
      .limit(1)
      .for("update", { of: shiftChangeRequests });
    if (!request || !request.shiftId) throw new Error("Shift change request not found.");
    if (request.status !== "pending") throw new Error("This request has already been resolved.");
    if (request.economicsMode !== "hfy") throw new Error("Only HFY-managed Shift requests can be resolved here.");

    const resolvedAt = new Date();
    if (input.decision === "denied") {
      await markRequestResolved(tx, actor, request.id, "denied", resolutionNote, resolvedAt);
    } else if (request.requestType === "change_time") {
      if (!request.proposedStartAt || !request.proposedEndAt) throw new Error("This Change time request is missing proposed hours.");
      await updateShiftTimeInTransaction(tx, actor, {
        shiftId: request.shiftId,
        startsAt: request.proposedStartAt,
        endsAt: request.proposedEndAt,
      });
      await markRequestResolved(tx, actor, request.id, "approved", resolutionNote || null, resolvedAt);
    } else if (request.requestType === "cancel_occurrence") {
      await markRequestResolved(tx, actor, request.id, "approved", resolutionNote || null, resolvedAt);
      if (request.daypartId) {
        await skipDaypartDateInTransaction(tx, actor, {
          residencyId: request.residencyId,
          daypartId: request.daypartId,
          serviceDate: request.serviceDate,
        });
      } else {
        await deleteShiftInTransaction(tx, actor, request.shiftId);
      }
    } else {
      await markRequestResolved(tx, actor, request.id, "approved", resolutionNote || null, resolvedAt);
      if (request.daypartId) {
        await endDaypartFromDate(tx, actor, {
          requestId: request.id,
          shiftId: request.shiftId,
          residencyId: request.residencyId,
          daypartId: request.daypartId,
          serviceDate: request.serviceDate,
        });
      } else {
        await deleteShiftInTransaction(tx, actor, request.shiftId);
      }
    }

    return {
      requestId: request.id,
      requestType: request.requestType,
      status: input.decision,
      resolutionNote: resolutionNote || null,
      resolvedAt,
      requestedByName: request.requestedByName,
      requestedByEmail: request.requestedByEmail,
      residencyName: request.residencyName,
      shiftName: request.shiftName,
      room: request.room,
      serviceDate: request.serviceDate,
      managerNote: request.managerNote,
    };
  });
}
