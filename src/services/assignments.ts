import { and, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, residencies, residencyTalent, shifts, talent } from "@/db/schema";
import { calculateCompensationCents, isPaymentEligible, nextPayoutStatus } from "@/domain/airtable-parity";
import { localDateTimeForMinute } from "@/domain/dayparts";
import { zonedLocalDateTimeToUtc } from "@/domain/time";
import type { AuditActor } from "@/lib/auth";
import { assertResidencyTalentRateConfigured } from "@/domain/residency-rates";

const transitions: Record<string, string[]> = {
  open: ["offered", "confirmed", "cancelled"],
  offered: ["open", "confirmed", "cancelled"],
  pending_hfy_confirmation: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: ["open"],
};

function assertEconomicOwner(actor: AuditActor, source: string) {
  if (actor.kind === "residency" && source !== "client_owned") {
    throw new Error("HFY-managed Assignments cannot be changed by the client.");
  }
  if (actor.kind === "internal" && source === "client_owned") {
    throw new Error("Client-owned Assignments are managed only by the client.");
  }
}

function normalizedManagedSource(actor: AuditActor, source: string, economicsMode: string) {
  if (actor.kind !== "internal" || source !== "hotel") return source;
  return economicsMode === "hfy_request" ? "hfy_request" : "internal";
}

export async function transitionAssignment(
  actor: AuditActor,
  assignmentId: string,
  targetStatus: "open" | "offered" | "confirmed" | "completed" | "cancelled",
) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select({
      id: assignments.id,
      residencyId: shifts.residencyId,
      serviceDate: shifts.serviceDate,
      bookingStatus: assignments.bookingStatus,
      compensationType: assignments.compensationType,
      startsAt: assignments.startsAt,
      endsAt: assignments.endsAt,
      talentId: assignments.talentId,
      talentRateCents: assignments.talentRateCents,
      fixedFeeCents: assignments.fixedFeeCents,
      payoutStatus: assignments.payoutStatus,
      source: assignments.source,
      economicsMode: shifts.economicsMode,
    }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .where(eq(assignments.id, assignmentId))
      .limit(1);
    if (!current) throw new Error("Assignment not found.");
    assertEconomicOwner(actor, current.source);
    if (!transitions[current.bookingStatus]?.includes(targetStatus)) {
      throw new Error(`Cannot move ${current.bookingStatus.replaceAll("_", " ")} to ${targetStatus.replaceAll("_", " ")}.`);
    }

    const totalCompensationCents = calculateCompensationCents(current);
    const eligible = isPaymentEligible({
      bookingStatus: targetStatus,
      compensationType: current.compensationType,
      hasTalent: Boolean(current.talentId),
      hasServiceDate: Boolean(current.serviceDate),
      totalCompensationCents,
    });
    const payoutState = current.compensationType === "na"
      ? "na"
      : nextPayoutStatus(current.payoutStatus, eligible);

    const normalizedSource = normalizedManagedSource(actor, current.source, current.economicsMode);
    await tx.update(assignments).set(targetStatus === "cancelled"
      ? {
          bookingStatus: targetStatus,
          updatedAt: new Date(),
        }
      : {
          bookingStatus: targetStatus,
          source: normalizedSource,
          totalCompensationCents,
          payoutStatus: payoutState,
          updatedAt: new Date(),
        }).where(eq(assignments.id, current.id));
    await tx.insert(auditLog).values({
      residencyId: current.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "assignment_status_changed",
      entityType: "assignment",
      entityId: current.id,
      details: { from: current.bookingStatus, to: targetStatus, payoutStatus: targetStatus === "cancelled" ? current.payoutStatus : payoutState },
    });
  });
}

export async function markAssignmentPaid(
  actor: AuditActor,
  assignmentId: string,
  payment: { paidAt: Date; paidAmountCents: number; paymentReference: string },
) {
  if (payment.paidAmountCents <= 0 || !payment.paymentReference.trim()) throw new Error("Payment amount and reference are required.");
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select({
      id: assignments.id,
      residencyId: shifts.residencyId,
      payoutStatus: assignments.payoutStatus,
      totalCompensationCents: assignments.totalCompensationCents,
      source: assignments.source,
      economicsMode: shifts.economicsMode,
    }).from(assignments).innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .where(and(eq(assignments.id, assignmentId), eq(assignments.payoutStatus, "ready_to_pay"))).limit(1);
    if (!current) throw new Error("Only a Ready to Pay Assignment can be marked Paid.");
    assertEconomicOwner(actor, current.source);
    await tx.update(assignments).set({
      payoutStatus: "paid",
      paidAt: payment.paidAt,
      paidAmountCents: payment.paidAmountCents,
      paymentReference: payment.paymentReference.trim(),
      updatedAt: new Date(),
    }).where(eq(assignments.id, current.id));
    await tx.insert(auditLog).values({
      residencyId: current.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "assignment_marked_paid",
      entityType: "assignment",
      entityId: current.id,
      details: { expectedCents: current.totalCompensationCents, paidAmountCents: payment.paidAmountCents, paymentReference: payment.paymentReference },
    });
  });
}

export async function changeAssignmentPaidDate(actor: AuditActor, assignmentId: string, paidAt: Date) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select({
      id: assignments.id,
      residencyId: shifts.residencyId,
      paidAt: assignments.paidAt,
      source: assignments.source,
    }).from(assignments).innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .where(and(eq(assignments.id, assignmentId), eq(assignments.payoutStatus, "paid"))).limit(1);
    if (!current) throw new Error("Only a Paid Assignment can have its paid date changed.");
    assertEconomicOwner(actor, current.source);
    await tx.update(assignments).set({ paidAt, updatedAt: new Date() }).where(eq(assignments.id, current.id));
    await tx.insert(auditLog).values({
      residencyId: current.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "assignment_paid_date_changed",
      entityType: "assignment",
      entityId: current.id,
      details: { from: current.paidAt?.toISOString() ?? null, to: paidAt.toISOString() },
    });
  });
}

export async function replaceAssignmentTalent(actor: AuditActor, assignmentId: string, talentId: string) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select({
      id: assignments.id,
      residencyId: shifts.residencyId,
      talentId: assignments.talentId,
      startsAt: assignments.startsAt,
      endsAt: assignments.endsAt,
      bookingStatus: assignments.bookingStatus,
      payoutStatus: assignments.payoutStatus,
      source: assignments.source,
      economicsMode: shifts.economicsMode,
      defaultTalentRateCents: residencies.defaultTalentRateCents,
    }).from(assignments).innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
      .where(eq(assignments.id, assignmentId)).limit(1);
    if (!current) throw new Error("Assignment not found.");
    assertEconomicOwner(actor, current.source);
    if (actor.kind === "internal") assertResidencyTalentRateConfigured(current.defaultTalentRateCents);
    if (current.bookingStatus === "completed" || current.payoutStatus === "ready_to_pay" || current.payoutStatus === "paid") {
      throw new Error("Completed or payable work cannot be rescheduled from the calendar.");
    }
    if (current.bookingStatus === "cancelled") throw new Error("Reopen this Assignment before changing its artist.");
    if (current.talentId === talentId) return;

    const [replacement] = await tx.select({ id: talent.id, stageName: talent.stageName }).from(talent)
      .where(and(
        eq(talent.id, talentId),
        eq(talent.talentStatus, "active"),
        isNull(talent.archivedAt),
        or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, current.residencyId)),
        actor.kind === "residency"
          ? and(eq(talent.ownership, "residency"), eq(talent.owningResidencyId, current.residencyId))
          : eq(talent.ownership, "hfy"),
      )).limit(1);
    if (!replacement) throw new Error("Choose an active Talent record.");
    if (actor.kind === "residency") {
      const [approved] = await tx.select({ id: residencyTalent.id }).from(residencyTalent).where(and(
        eq(residencyTalent.residencyId, current.residencyId),
        eq(residencyTalent.talentId, replacement.id),
        eq(residencyTalent.active, true),
      )).limit(1);
      if (!approved) throw new Error("This DJ is unavailable to this Residency.");
    } else {
      await tx.insert(residencyTalent).values({
        residencyId: current.residencyId,
        talentId: replacement.id,
        active: true,
        approvedByUserId: actor.userId,
      }).onConflictDoUpdate({
        target: [residencyTalent.residencyId, residencyTalent.talentId],
        set: { active: true, approvedByUserId: actor.userId },
      });
    }
    const conflict = await tx.select({ id: assignments.id }).from(assignments).where(and(
      ne(assignments.id, current.id),
      eq(assignments.talentId, replacement.id),
      inArray(assignments.bookingStatus, ["pending_hfy_confirmation", "offered", "confirmed"]),
      lt(assignments.startsAt, current.endsAt),
      gt(assignments.endsAt, current.startsAt),
    )).limit(1);
    if (conflict.length) throw new Error(`${replacement.stageName} already has an overlapping active booking.`);

    await tx.update(assignments).set({
      talentId: replacement.id,
      setName: replacement.stageName,
      source: normalizedManagedSource(actor, current.source, current.economicsMode),
      bookingStatus: current.bookingStatus === "open" ? "confirmed" : current.bookingStatus,
      updatedAt: new Date(),
    }).where(eq(assignments.id, current.id));
    await tx.insert(auditLog).values({
      residencyId: current.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "assignment_talent_replaced",
      entityType: "assignment",
      entityId: current.id,
      details: { previousTalentId: current.talentId, replacementTalentId: replacement.id },
    });
  });
}

export async function rescheduleAssignment(
  actor: AuditActor,
  assignmentId: string,
  input: { talentId: string; startsAtMinute: number; endsAtMinute: number },
) {
  if (!Number.isInteger(input.startsAtMinute) || !Number.isInteger(input.endsAtMinute) || input.endsAtMinute <= input.startsAtMinute) {
    throw new Error("Choose valid start and end times for the replacement DJ.");
  }

  return getDb().transaction(async (tx) => {
    const [current] = await tx.select({
      id: assignments.id,
      shiftId: assignments.shiftId,
      residencyId: shifts.residencyId,
      serviceDate: shifts.serviceDate,
      timezone: residencies.timezone,
      shiftStartsAt: shifts.startsAt,
      shiftEndsAt: shifts.endsAt,
      talentId: assignments.talentId,
      startsAt: assignments.startsAt,
      endsAt: assignments.endsAt,
      bookingStatus: assignments.bookingStatus,
      compensationType: assignments.compensationType,
      talentRateCents: assignments.talentRateCents,
      fixedFeeCents: assignments.fixedFeeCents,
      payoutStatus: assignments.payoutStatus,
      source: assignments.source,
      economicsMode: shifts.economicsMode,
      defaultTalentRateCents: residencies.defaultTalentRateCents,
    }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
      .where(eq(assignments.id, assignmentId))
      .limit(1);
    if (!current) throw new Error("Assignment not found.");
    assertEconomicOwner(actor, current.source);
    if (actor.kind === "internal") assertResidencyTalentRateConfigured(current.defaultTalentRateCents);
    if (current.bookingStatus === "completed" || current.payoutStatus === "ready_to_pay" || current.payoutStatus === "paid") {
      throw new Error("Completed or payable work cannot be rescheduled from the calendar.");
    }
    if (current.bookingStatus === "cancelled") throw new Error("Reopen this Assignment before changing its DJ.");

    const startsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(current.serviceDate, input.startsAtMinute), current.timezone);
    const endsAt = zonedLocalDateTimeToUtc(localDateTimeForMinute(current.serviceDate, input.endsAtMinute), current.timezone);
    if (startsAt < current.shiftStartsAt || endsAt > current.shiftEndsAt || endsAt <= startsAt) {
      throw new Error("The replacement DJ's hours must stay inside the Shift.");
    }

    const [replacement] = await tx.select({ id: talent.id, stageName: talent.stageName }).from(talent)
      .where(and(
        eq(talent.id, input.talentId),
        eq(talent.talentStatus, "active"),
        isNull(talent.archivedAt),
        or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, current.residencyId)),
        actor.kind === "residency"
          ? and(eq(talent.ownership, "residency"), eq(talent.owningResidencyId, current.residencyId))
          : eq(talent.ownership, "hfy"),
      )).limit(1);
    if (!replacement) throw new Error("Choose an active Talent record.");
    if (actor.kind === "residency") {
      const [approved] = await tx.select({ id: residencyTalent.id }).from(residencyTalent).where(and(
        eq(residencyTalent.residencyId, current.residencyId),
        eq(residencyTalent.talentId, replacement.id),
        eq(residencyTalent.active, true),
      )).limit(1);
      if (!approved) throw new Error("This DJ is unavailable to this Residency.");
    } else {
      await tx.insert(residencyTalent).values({
        residencyId: current.residencyId,
        talentId: replacement.id,
        active: true,
        approvedByUserId: actor.userId,
      }).onConflictDoUpdate({
        target: [residencyTalent.residencyId, residencyTalent.talentId],
        set: { active: true, approvedByUserId: actor.userId },
      });
    }

    const shiftOverlap = await tx.select({ id: assignments.id }).from(assignments).where(and(
      ne(assignments.id, current.id),
      eq(assignments.shiftId, current.shiftId),
      inArray(assignments.bookingStatus, ["pending_hfy_confirmation", "offered", "confirmed"]),
      lt(assignments.startsAt, endsAt),
      gt(assignments.endsAt, startsAt),
    )).limit(1);
    if (shiftOverlap.length) throw new Error("DJ times cannot overlap within the same Shift.");

    const talentConflict = await tx.select({ id: assignments.id }).from(assignments).where(and(
      ne(assignments.id, current.id),
      eq(assignments.talentId, replacement.id),
      inArray(assignments.bookingStatus, ["pending_hfy_confirmation", "offered", "confirmed"]),
      lt(assignments.startsAt, endsAt),
      gt(assignments.endsAt, startsAt),
    )).limit(1);
    if (talentConflict.length) throw new Error(`${replacement.stageName} already has an overlapping active booking.`);

    const totalCompensationCents = calculateCompensationCents({
      compensationType: current.compensationType,
      startsAt,
      endsAt,
      talentRateCents: current.talentRateCents,
      fixedFeeCents: current.fixedFeeCents,
    });
    await tx.update(assignments).set({
      talentId: replacement.id,
      setName: replacement.stageName,
      source: normalizedManagedSource(actor, current.source, current.economicsMode),
      startsAt,
      endsAt,
      bookingStatus: current.bookingStatus === "open" ? "confirmed" : current.bookingStatus,
      totalCompensationCents,
      updatedAt: new Date(),
    }).where(eq(assignments.id, current.id));
    await tx.insert(auditLog).values({
      residencyId: current.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "assignment_rescheduled",
      entityType: "assignment",
      entityId: current.id,
      details: {
        previousTalentId: current.talentId,
        replacementTalentId: replacement.id,
        previousStartsAt: current.startsAt.toISOString(),
        previousEndsAt: current.endsAt.toISOString(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
    });
  });
}
