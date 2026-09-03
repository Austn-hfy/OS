import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, hfyTalentRequests, invoiceLineItems, invoices, residencies, shifts, talentInvoiceAdjustments } from "@/db/schema";
import { calculateBillableAmountCents, resolveRateCents } from "@/domain/airtable-parity";
import type { AuditActor, InternalActor } from "@/lib/auth";
import { shiftDeletionBlockReason } from "@/domain/shift-deletion";
import { carryForwardAdjustmentDescription } from "@/domain/talent-invoicing";
import { findOrCreateResidencyRoom } from "@/services/rooms";

export type CreateShiftInput = {
  residencyId: string;
  daypartId?: string | null;
  name: string;
  serviceDate: string;
  room: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string;
  clientRateOverrideCents?: number | null;
};

export async function createShift(actor: InternalActor, input: CreateShiftInput) {
  if (input.endsAt <= input.startsAt) throw new Error("Shift end must be after start.");
  return getDb().transaction(async (tx) => {
    const [residency] = await tx.select().from(residencies)
      .where(and(eq(residencies.id, input.residencyId), eq(residencies.active, true), eq(residencies.operatingMode, "operations"))).limit(1);
    if (!residency) throw new Error("Residency not found.");
    const room = await findOrCreateResidencyRoom(tx, residency.id, input.room);

    const coveringInvoices = await tx.select({ id: invoices.id, status: invoices.status }).from(invoices).where(and(
      eq(invoices.residencyId, residency.id),
      eq(invoices.kind, "scheduled_period"),
      lte(invoices.billingPeriodStart, input.serviceDate),
      gte(invoices.billingPeriodEnd, input.serviceDate),
      ne(invoices.status, "void"),
    ));
    const draftInvoice = coveringInvoices.length === 1 && coveringInvoices[0].status === "draft" ? coveringInvoices[0] : null;
    const finalizedInvoice = residency.tier === "complete" && coveringInvoices.length === 1 && coveringInvoices[0].status !== "draft" ? coveringInvoices[0] : null;
    const clientRateCents = resolveRateCents(input.clientRateOverrideCents, residency.clientHourlyRateCents);
    const [shift] = await tx.insert(shifts).values({
      residencyId: residency.id,
      roomId: room.id,
      daypartId: input.daypartId ?? null,
      invoiceId: draftInvoice?.id ?? null,
      name: input.name.trim(),
      serviceDate: input.serviceDate,
      room: room.name,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      notes: input.notes?.trim() ?? "",
      clientRateOverrideCents: input.clientRateOverrideCents ?? null,
      clientRateCents,
      billingStatus: finalizedInvoice ? "pending_adjustment" : "pending",
      invoiceLinkIssue: !finalizedInvoice && !draftInvoice,
      invoiceLinkNote: finalizedInvoice
        ? "Added after the service month was invoiced; carried to the next HFY Talent Invoice."
        : draftInvoice
        ? ""
        : coveringInvoices.length
          ? "More than one Invoice covers this Shift."
          : "No Invoice period covers this Shift.",
    }).returning({ id: shifts.id });
    if (finalizedInvoice) {
      const adjustmentCents = calculateBillableAmountCents(input.startsAt, input.endsAt, clientRateCents);
      if (adjustmentCents <= 0) throw new Error("A positive client talent rate is required before adding service to an invoiced Full Programming month.");
      await tx.insert(talentInvoiceAdjustments).values({
        residencyId: residency.id,
        sourceInvoiceId: finalizedInvoice.id,
        sourceShiftId: shift.id,
        serviceDate: input.serviceDate,
        reason: "schedule_added_after_invoice",
        description: carryForwardAdjustmentDescription({ serviceDate: input.serviceDate, shiftName: input.name.trim(), kind: "added" }),
        amountCents: adjustmentCents,
        createdByUserId: actor.userId,
      });
    }
    await tx.insert(auditLog).values({
      residencyId: residency.id,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "shift_created",
      entityType: "shift",
      entityId: shift.id,
      details: {
        daypartId: input.daypartId ?? null,
        roomId: room.id,
        invoiceId: draftInvoice?.id ?? null,
        invoiceLinkIssue: !finalizedInvoice && !draftInvoice,
        pendingAdjustmentSourceInvoiceId: finalizedInvoice?.id ?? null,
      },
    });
    return shift;
  });
}

export async function updateCalendarShiftDetails(
  actor: AuditActor,
  shiftId: string,
  input: { notes: string; clientRateOverrideCents?: number | null },
) {
  return getDb().transaction(async (tx) => {
    const [shift] = await tx.select({
      id: shifts.id,
      residencyId: shifts.residencyId,
      economicsMode: shifts.economicsMode,
      invoiceId: shifts.invoiceId,
      invoiceStatus: invoices.status,
      clientRateOverrideCents: shifts.clientRateOverrideCents,
      defaultClientRateCents: residencies.clientHourlyRateCents,
    }).from(shifts)
      .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
      .leftJoin(invoices, eq(shifts.invoiceId, invoices.id))
      .where(eq(shifts.id, shiftId))
      .limit(1);
    if (!shift) throw new Error("Shift not found.");
    if (actor.kind === "residency" && shift.economicsMode !== "client_owned") throw new Error("HFY-managed Shifts cannot be changed by the client.");
    if (actor.kind === "internal" && shift.economicsMode !== "hfy") throw new Error("Client-owned and pending-request Shifts are controlled through their own workflow.");

    const rateChanged = actor.kind === "internal"
      && input.clientRateOverrideCents !== undefined
      && input.clientRateOverrideCents !== shift.clientRateOverrideCents;
    if (rateChanged && shift.invoiceStatus && shift.invoiceStatus !== "draft") {
      throw new Error("Billing is locked because this Shift's Invoice is finalized.");
    }
    const clientRateOverrideCents = actor.kind === "internal" && input.clientRateOverrideCents !== undefined
      ? input.clientRateOverrideCents
      : shift.clientRateOverrideCents;
    await tx.update(shifts).set({
      notes: input.notes.trim(),
      ...(actor.kind === "internal" ? {
        clientRateOverrideCents,
        clientRateCents: resolveRateCents(clientRateOverrideCents, shift.defaultClientRateCents),
      } : {}),
      updatedAt: new Date(),
    }).where(eq(shifts.id, shift.id));

    if (rateChanged && shift.invoiceId && shift.invoiceStatus === "draft") {
      await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.sourceShiftId, shift.id));
      const [remaining] = await tx.select({ total: sql<number>`coalesce(sum(${invoiceLineItems.totalCents}), 0)` })
        .from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, shift.invoiceId));
      await tx.update(invoices).set({ totalCents: Number(remaining?.total ?? 0), updatedAt: new Date() }).where(eq(invoices.id, shift.invoiceId));
    }
    await tx.insert(auditLog).values({
      residencyId: shift.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "calendar_shift_details_updated",
      entityType: "shift",
      entityId: shift.id,
      details: { rateChanged, clientRateOverrideCents: actor.kind === "internal" ? clientRateOverrideCents : undefined },
    });
  });
}

export async function deleteShift(actor: AuditActor, shiftId: string) {
  return getDb().transaction(async (tx) => {
    const [shift] = await tx.select({
      id: shifts.id,
      residencyId: shifts.residencyId,
      invoiceId: shifts.invoiceId,
      invoiceStatus: invoices.status,
      serviceDate: shifts.serviceDate,
      name: shifts.name,
      economicsMode: shifts.economicsMode,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      clientRateCents: shifts.clientRateCents,
      residencyTier: residencies.tier,
    }).from(shifts)
      .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
      .leftJoin(invoices, eq(shifts.invoiceId, invoices.id))
      .where(eq(shifts.id, shiftId))
      .limit(1);
    if (!shift) throw new Error("Shift not found.");
    const finalizedFullProgrammingShift = shift.residencyTier === "complete" && Boolean(shift.invoiceId && shift.invoiceStatus && shift.invoiceStatus !== "draft");
    if (actor.kind === "residency" && shift.economicsMode === "hfy" && shift.residencyTier !== "complete") throw new Error("HFY-managed Shifts cannot be deleted by the client.");
    if (actor.kind === "internal" && shift.economicsMode !== "hfy") throw new Error("Client-owned and pending-request Shifts are controlled through their own workflow.");
    const assignmentRows = await tx.select({
      bookingStatus: assignments.bookingStatus,
      payoutStatus: assignments.payoutStatus,
    }).from(assignments).where(eq(assignments.shiftId, shift.id));
    const blockReason = shiftDeletionBlockReason(finalizedFullProgrammingShift ? null : shift.invoiceStatus, assignmentRows);
    if (blockReason) throw new Error(blockReason);
    if (finalizedFullProgrammingShift && shift.invoiceId) {
      const adjustmentCents = calculateBillableAmountCents(shift.startsAt, shift.endsAt, shift.clientRateCents);
      if (adjustmentCents <= 0) throw new Error("This invoiced service has no billable amount to credit.");
      await tx.insert(talentInvoiceAdjustments).values({
        residencyId: shift.residencyId,
        sourceInvoiceId: shift.invoiceId,
        sourceShiftId: shift.id,
        serviceDate: shift.serviceDate,
        reason: "schedule_cancelled_after_invoice",
        description: carryForwardAdjustmentDescription({ serviceDate: shift.serviceDate, shiftName: shift.name, kind: "cancelled" }),
        amountCents: -adjustmentCents,
        createdByUserId: actor.userId,
      });
    }
    await tx.delete(hfyTalentRequests).where(eq(hfyTalentRequests.shiftId, shift.id));
    await tx.delete(assignments).where(eq(assignments.shiftId, shift.id));
    if (!finalizedFullProgrammingShift) await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.sourceShiftId, shift.id));
    await tx.delete(shifts).where(eq(shifts.id, shift.id));
    if (shift.invoiceId && !finalizedFullProgrammingShift) {
      const [remaining] = await tx.select({ total: sql<number>`coalesce(sum(${invoiceLineItems.totalCents}), 0)` }).from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, shift.invoiceId));
      await tx.update(invoices).set({ totalCents: Number(remaining?.total ?? 0), updatedAt: new Date() }).where(eq(invoices.id, shift.invoiceId));
    }
    await tx.insert(auditLog).values({
      residencyId: shift.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "shift_deleted",
      entityType: "shift",
      entityId: shift.id,
      details: { serviceDate: shift.serviceDate, name: shift.name, draftInvoiceId: finalizedFullProgrammingShift ? null : shift.invoiceId, pendingTalentInvoiceAdjustment: finalizedFullProgrammingShift },
    });
    return shift;
  });
}

export function shiftInvoiceReconciliationStatement(residencyId: string) {
  return sql`
    WITH eligible_shifts AS MATERIALIZED (
      SELECT id, service_date, invoice_id
      FROM shifts
      WHERE residency_id = ${residencyId}
        AND billing_status IN ('pending', 'reviewed')
    ),
    coverage AS MATERIALIZED (
      SELECT
        candidate.id,
        count(covering_invoice.id)::integer AS invoice_count,
        max(covering_invoice.id::text)::uuid AS invoice_id
      FROM eligible_shifts AS candidate
      LEFT JOIN invoices AS covering_invoice
        ON covering_invoice.residency_id = ${residencyId}
        AND covering_invoice.kind = 'scheduled_period'
        AND covering_invoice.billing_period_start <= candidate.service_date
        AND covering_invoice.billing_period_end >= candidate.service_date
        AND covering_invoice.status <> 'void'
      WHERE candidate.invoice_id IS NULL
      GROUP BY candidate.id
    ),
    updated_shifts AS (
      UPDATE shifts AS candidate
      SET
        invoice_id = CASE WHEN coverage.invoice_count = 1 THEN coverage.invoice_id ELSE NULL END,
        invoice_link_issue = coverage.invoice_count <> 1,
        invoice_link_note = CASE
          WHEN coverage.invoice_count = 1 THEN ''
          WHEN coverage.invoice_count > 1 THEN 'More than one Invoice covers this Shift.'
          ELSE 'No Invoice period covers this Shift.'
        END,
        updated_at = now()
      FROM coverage
      WHERE candidate.id = coverage.id
      RETURNING coverage.invoice_count
    )
    SELECT
      (SELECT count(*)::integer FROM eligible_shifts) AS processed,
      (SELECT count(*)::integer FROM updated_shifts WHERE invoice_count = 1) AS changed
  `;
}

export async function reconcileShiftInvoiceLinks(residencyId: string) {
  const database = getDb();
  const result = await database.execute<{ processed: number; changed: number }>(shiftInvoiceReconciliationStatement(residencyId));
  const summary = result.rows[0];
  if (!summary) throw new Error("Shift invoice reconciliation did not return a summary.");
  return { processed: Number(summary.processed), changed: Number(summary.changed) };
}
