import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, hfyTalentRequests, invoiceLineItems, invoices, residencies, shifts } from "@/db/schema";
import { resolveRateCents } from "@/domain/airtable-parity";
import type { AuditActor, InternalActor } from "@/lib/auth";
import { shiftDeletionBlockReason } from "@/domain/shift-deletion";

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

    const coveringInvoices = await tx.select({ id: invoices.id }).from(invoices).where(and(
      eq(invoices.residencyId, residency.id),
      eq(invoices.kind, "scheduled_period"),
      lte(invoices.billingPeriodStart, input.serviceDate),
      gte(invoices.billingPeriodEnd, input.serviceDate),
      ne(invoices.status, "void"),
    ));
    const [shift] = await tx.insert(shifts).values({
      residencyId: residency.id,
      daypartId: input.daypartId ?? null,
      invoiceId: coveringInvoices.length === 1 ? coveringInvoices[0].id : null,
      name: input.name.trim(),
      serviceDate: input.serviceDate,
      room: input.room.trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      notes: input.notes?.trim() ?? "",
      clientRateOverrideCents: input.clientRateOverrideCents ?? null,
      clientRateCents: resolveRateCents(input.clientRateOverrideCents, residency.clientHourlyRateCents),
      billingStatus: "pending",
      invoiceLinkIssue: coveringInvoices.length !== 1,
      invoiceLinkNote: coveringInvoices.length === 1
        ? ""
        : coveringInvoices.length
          ? "More than one Invoice covers this Shift."
          : "No Invoice period covers this Shift.",
    }).returning({ id: shifts.id });
    await tx.insert(auditLog).values({
      residencyId: residency.id,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "shift_created",
      entityType: "shift",
      entityId: shift.id,
      details: {
        daypartId: input.daypartId ?? null,
        invoiceId: coveringInvoices.length === 1 ? coveringInvoices[0].id : null,
        invoiceLinkIssue: coveringInvoices.length !== 1,
      },
    });
    return shift;
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
    }).from(shifts)
      .leftJoin(invoices, eq(shifts.invoiceId, invoices.id))
      .where(eq(shifts.id, shiftId))
      .limit(1);
    if (!shift) throw new Error("Shift not found.");
    if (actor.kind === "residency" && shift.economicsMode === "hfy") throw new Error("HFY-managed Shifts cannot be deleted by the client.");
    if (actor.kind === "internal" && shift.economicsMode !== "hfy") throw new Error("Client-owned and pending-request Shifts are controlled through their own workflow.");
    const assignmentRows = await tx.select({
      bookingStatus: assignments.bookingStatus,
      payoutStatus: assignments.payoutStatus,
    }).from(assignments).where(eq(assignments.shiftId, shift.id));
    const blockReason = shiftDeletionBlockReason(shift.invoiceStatus, assignmentRows);
    if (blockReason) throw new Error(blockReason);
    await tx.delete(hfyTalentRequests).where(eq(hfyTalentRequests.shiftId, shift.id));
    await tx.delete(assignments).where(eq(assignments.shiftId, shift.id));
    await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.sourceShiftId, shift.id));
    await tx.delete(shifts).where(eq(shifts.id, shift.id));
    if (shift.invoiceId) {
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
      details: { serviceDate: shift.serviceDate, name: shift.name, draftInvoiceId: shift.invoiceId },
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
