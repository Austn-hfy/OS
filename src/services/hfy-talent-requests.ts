import { and, eq, gt, inArray, isNull, lt, or, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, hfyTalentRequests, invoices, residencyTalent, shifts, talent } from "@/db/schema";
import { calculateCompensationCents } from "@/domain/airtable-parity";
import { HFY_BOOKED_COLOR } from "@/domain/dayparts";
import type { InternalActor } from "@/lib/auth";

export type FulfillHfyTalentRequestInput = {
  requestId: string;
  talentId: string;
  clientRateCents: number;
  artistRateCents: number;
};

export async function fulfillHfyTalentRequest(actor: InternalActor, input: FulfillHfyTalentRequestInput) {
  if (!Number.isInteger(input.clientRateCents) || input.clientRateCents < 0) throw new Error("Enter a valid client-billed hourly rate.");
  if (!Number.isInteger(input.artistRateCents) || input.artistRateCents < 0) throw new Error("Enter a valid artist-paid hourly rate.");

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
    }).from(hfyTalentRequests)
      .innerJoin(shifts, eq(hfyTalentRequests.shiftId, shifts.id))
      .where(eq(hfyTalentRequests.id, input.requestId))
      .limit(1);
    if (!request || request.status !== "pending" || request.economicsMode !== "hfy_request") {
      throw new Error("This HFY request is no longer pending.");
    }

    const [selectedTalent] = await tx.select({ id: talent.id, stageName: talent.stageName }).from(talent).where(and(
      eq(talent.id, input.talentId),
      eq(talent.ownership, "hfy"),
      eq(talent.talentStatus, "active"),
      isNull(talent.archivedAt),
      or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, request.residencyId)),
    )).limit(1);
    if (!selectedTalent) throw new Error("Choose an active HFY artist available to this Residency.");

    const conflict = await tx.select({ id: assignments.id }).from(assignments).where(and(
      eq(assignments.talentId, selectedTalent.id),
      inArray(assignments.bookingStatus, ["pending_hfy_confirmation", "offered", "confirmed"]),
      lt(assignments.startsAt, request.endsAt),
      gt(assignments.endsAt, request.startsAt),
    )).limit(1);
    if (conflict.length) throw new Error(`${selectedTalent.stageName} already has an overlapping active booking.`);

    await tx.insert(residencyTalent).values({
      residencyId: request.residencyId,
      talentId: selectedTalent.id,
      approvedByUserId: actor.userId,
      active: true,
    }).onConflictDoUpdate({
      target: [residencyTalent.residencyId, residencyTalent.talentId],
      set: { active: true, approvedByUserId: actor.userId },
    });

    const totalCompensationCents = calculateCompensationCents({
      compensationType: "hourly",
      startsAt: request.startsAt,
      endsAt: request.endsAt,
      talentRateCents: input.artistRateCents,
      fixedFeeCents: null,
    });
    const [assignment] = await tx.insert(assignments).values({
      shiftId: request.shiftId,
      talentId: selectedTalent.id,
      createdByUserId: actor.userId,
      source: "hfy_request",
      setName: selectedTalent.stageName,
      startsAt: request.startsAt,
      endsAt: request.endsAt,
      bookingStatus: "confirmed",
      compensationType: "hourly",
      talentRateOverrideCents: input.artistRateCents,
      talentRateCents: input.artistRateCents,
      totalCompensationCents,
      payoutStatus: "not_ready",
    }).returning({ id: assignments.id });

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
      calendarColor: HFY_BOOKED_COLOR,
      invoiceId: coveringInvoices.length === 1 ? coveringInvoices[0].id : null,
      clientRateOverrideCents: input.clientRateCents,
      clientRateCents: input.clientRateCents,
      billingStatus: "pending",
      invoiceLinkIssue: coveringInvoices.length !== 1,
      invoiceLinkNote,
      updatedAt: new Date(),
    }).where(eq(shifts.id, request.shiftId));
    const fulfilledAt = new Date();
    await tx.update(hfyTalentRequests).set({
      status: "fulfilled",
      fulfilledAssignmentId: assignment.id,
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
        assignmentId: assignment.id,
        talentId: selectedTalent.id,
        clientRateCents: input.clientRateCents,
        artistRateCents: input.artistRateCents,
      },
    });
    return { assignmentId: assignment.id, artistName: selectedTalent.stageName };
  });
}
