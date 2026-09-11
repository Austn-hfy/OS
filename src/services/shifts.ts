import { and, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, hfyTalentRequests, invoiceLineItems, invoices, residencies, shifts, talentInvoiceAdjustments } from "@/db/schema";
import { addDays, calculateBillableAmountCents, resolveRateCents } from "@/domain/airtable-parity";
import { planShiftTimeEdit, type ShiftTimeEditPlan } from "@/domain/shift-time-editing";
import { localDateKey } from "@/domain/time";
import { ResidencyAccessError, type AuditActor, type InternalActor } from "@/lib/auth";
import { shiftDeletionBlockReason } from "@/domain/shift-deletion";
import { carryForwardAdjustmentDescription } from "@/domain/talent-invoicing";
import { findOrCreateResidencyRoom, type DatabaseTransaction } from "@/services/rooms";

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

export type UpdateShiftTimeInput = {
  shiftId: string;
  startsAt: Date;
  endsAt: Date;
};

type ShiftTimeSource = {
  id: string;
  residencyId: string;
  serviceDate: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  economicsMode: "hfy" | "client_owned" | "hfy_request";
  clientRateCents: number;
  invoiceId: string | null;
  invoiceStatus: "draft" | "approved" | "sent" | "paid" | "void" | null;
  residencyTier: "operations_only" | "complete";
  timezone: string;
};

type ShiftTimeAssignmentRow = {
  id: string;
  label: string;
  startsAt: Date;
  endsAt: Date;
  compensationType: "hourly" | "fixed" | "na";
  talentRateCents: number;
  fixedFeeCents: number | null;
  totalCompensationCents: number;
};

function assertInternalShiftTimeActor(actor: AuditActor): asserts actor is InternalActor {
  if (actor.kind !== "internal") {
    throw new ResidencyAccessError(403, "Owner/admin access is required to edit an HFY-managed Shift.");
  }
}

function assertShiftTimeCanBeEdited(shift: ShiftTimeSource) {
  if (shift.economicsMode !== "hfy") {
    throw new Error("Only Shifts billed by HFY can be edited with this action.");
  }
  const finalizedFullProgrammingShift = shift.residencyTier === "complete"
    && Boolean(shift.invoiceId && shift.invoiceStatus && shift.invoiceStatus !== "draft");
  if (shift.invoiceStatus && shift.invoiceStatus !== "draft" && !finalizedFullProgrammingShift) {
    throw new Error("This Shift is locked because its talent Invoice is finalized.");
  }
  return finalizedFullProgrammingShift;
}

function localClockMinute(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return (hour * 60) + minute;
}

function assertServiceDateWindow(shift: ShiftTimeSource, startsAt: Date, endsAt: Date) {
  const startDate = localDateKey(startsAt, shift.timezone);
  const endDate = localDateKey(endsAt, shift.timezone);
  const startMinute = localClockMinute(startsAt, shift.timezone);
  const endMinute = localClockMinute(endsAt, shift.timezone) + (endDate === addDays(shift.serviceDate, 1) ? 1_440 : 0);
  if (startDate !== shift.serviceDate
    || (endDate !== shift.serviceDate && endDate !== addDays(shift.serviceDate, 1))
    || endMinute <= startMinute
    || endMinute > startMinute + 1_440) {
    throw new Error("Choose valid Shift hours for this service date.");
  }
}

function buildShiftTimePlan(
  shift: ShiftTimeSource,
  assignmentRows: ShiftTimeAssignmentRow[],
  input: UpdateShiftTimeInput,
) {
  assertServiceDateWindow(shift, input.startsAt, input.endsAt);
  if (input.startsAt.getTime() === shift.startsAt.getTime() && input.endsAt.getTime() === shift.endsAt.getTime()) {
    throw new Error("Choose a different Shift start or end time.");
  }
  return planShiftTimeEdit({
    oldStartsAt: shift.startsAt,
    oldEndsAt: shift.endsAt,
    newStartsAt: input.startsAt,
    newEndsAt: input.endsAt,
    clientRateCents: shift.clientRateCents,
    assignments: assignmentRows,
  });
}

export async function previewShiftTimeEdit(actor: AuditActor, input: UpdateShiftTimeInput): Promise<ShiftTimeEditPlan> {
  assertInternalShiftTimeActor(actor);
  const database = getDb();
  const [shift] = await database.select({
    id: shifts.id,
    residencyId: shifts.residencyId,
    serviceDate: shifts.serviceDate,
    name: shifts.name,
    startsAt: shifts.startsAt,
    endsAt: shifts.endsAt,
    economicsMode: shifts.economicsMode,
    clientRateCents: shifts.clientRateCents,
    invoiceId: shifts.invoiceId,
    invoiceStatus: invoices.status,
    residencyTier: residencies.tier,
    timezone: residencies.timezone,
  }).from(shifts)
    .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
    .leftJoin(invoices, eq(shifts.invoiceId, invoices.id))
    .where(eq(shifts.id, input.shiftId))
    .limit(1);
  if (!shift) throw new Error("Shift not found.");
  assertShiftTimeCanBeEdited(shift);
  const assignmentRows = await database.select({
    id: assignments.id,
    label: assignments.setName,
    startsAt: assignments.startsAt,
    endsAt: assignments.endsAt,
    compensationType: assignments.compensationType,
    talentRateCents: assignments.talentRateCents,
    fixedFeeCents: assignments.fixedFeeCents,
    totalCompensationCents: assignments.totalCompensationCents,
  }).from(assignments).where(eq(assignments.shiftId, shift.id));
  return buildShiftTimePlan(shift, assignmentRows, input);
}

export async function updateShiftTimeInTransaction(
  tx: DatabaseTransaction,
  actor: AuditActor,
  input: UpdateShiftTimeInput,
): Promise<ShiftTimeEditPlan> {
  assertInternalShiftTimeActor(actor);
  const [shiftBase] = await tx.select({
      id: shifts.id,
      residencyId: shifts.residencyId,
      serviceDate: shifts.serviceDate,
      name: shifts.name,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
      economicsMode: shifts.economicsMode,
      clientRateCents: shifts.clientRateCents,
      invoiceId: shifts.invoiceId,
      residencyTier: residencies.tier,
      timezone: residencies.timezone,
  }).from(shifts)
    .innerJoin(residencies, eq(shifts.residencyId, residencies.id))
    .where(eq(shifts.id, input.shiftId))
    .limit(1)
    .for("update", { of: shifts });
  if (!shiftBase) throw new Error("Shift not found.");
  const [invoice] = shiftBase.invoiceId
    ? await tx.select({ id: invoices.id, status: invoices.status }).from(invoices)
      .where(eq(invoices.id, shiftBase.invoiceId)).limit(1).for("update")
    : [];
  const shift: ShiftTimeSource = { ...shiftBase, invoiceStatus: invoice?.status ?? null };
  const finalizedFullProgrammingShift = assertShiftTimeCanBeEdited(shift);
  const assignmentRows = await tx.select({
      id: assignments.id,
      label: assignments.setName,
      startsAt: assignments.startsAt,
      endsAt: assignments.endsAt,
      compensationType: assignments.compensationType,
      talentRateCents: assignments.talentRateCents,
      fixedFeeCents: assignments.fixedFeeCents,
      totalCompensationCents: assignments.totalCompensationCents,
  }).from(assignments).where(eq(assignments.shiftId, shift.id)).for("update");
  const plan = buildShiftTimePlan(shift, assignmentRows, input);
  const clientBilledDeltaCents = plan.newClientBilledTotalCents - plan.oldClientBilledTotalCents;
  const changedAt = new Date();

  if (finalizedFullProgrammingShift && shift.invoiceId && clientBilledDeltaCents !== 0) {
    await tx.insert(talentInvoiceAdjustments).values({
        residencyId: shift.residencyId,
        sourceInvoiceId: shift.invoiceId,
        sourceShiftId: shift.id,
        serviceDate: shift.serviceDate,
        reason: "schedule_hours_changed_after_invoice",
        description: carryForwardAdjustmentDescription({ serviceDate: shift.serviceDate, shiftName: shift.name, kind: "hours_changed" }),
        amountCents: clientBilledDeltaCents,
        createdByUserId: actor.userId,
    });
  }

  await tx.update(shifts).set({
      startsAt: plan.newStartsAt,
      endsAt: plan.newEndsAt,
      ...(finalizedFullProgrammingShift && clientBilledDeltaCents !== 0 ? {
        invoiceId: null,
        billingStatus: "pending_adjustment" as const,
        invoiceLinkIssue: false,
        invoiceLinkNote: "Schedule changed after the service month was invoiced; carried to the next HFY Talent Invoice.",
      } : {}),
      updatedAt: changedAt,
  }).where(eq(shifts.id, shift.id));

  for (const assignment of plan.assignments) {
    await tx.update(assignments).set({
        startsAt: assignment.newStartsAt,
        endsAt: assignment.newEndsAt,
        totalCompensationCents: assignment.newTotalCompensationCents,
        updatedAt: changedAt,
    }).where(eq(assignments.id, assignment.id));
  }

  if (shift.invoiceId && shift.invoiceStatus === "draft") {
    const invoiceShifts = await tx.select({
        startsAt: shifts.startsAt,
        endsAt: shifts.endsAt,
        clientRateCents: shifts.clientRateCents,
    }).from(shifts).where(eq(shifts.invoiceId, shift.invoiceId));
    const manualLines = await tx.select({ totalCents: invoiceLineItems.totalCents }).from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.invoiceId, shift.invoiceId), isNull(invoiceLineItems.sourceShiftId)));
    const invoiceTotalCents = invoiceShifts.reduce(
      (sum, invoiceShift) => sum + calculateBillableAmountCents(invoiceShift.startsAt, invoiceShift.endsAt, invoiceShift.clientRateCents),
      0,
    ) + manualLines.reduce((sum, line) => sum + line.totalCents, 0);
    await tx.update(invoices).set({ totalCents: invoiceTotalCents, updatedAt: changedAt })
      .where(eq(invoices.id, shift.invoiceId));
  }

  await tx.insert(auditLog).values({
      residencyId: shift.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "shift_time_updated",
      entityType: "shift",
      entityId: shift.id,
      details: {
        oldStartsAt: plan.oldStartsAt.toISOString(),
        oldEndsAt: plan.oldEndsAt.toISOString(),
        newStartsAt: plan.newStartsAt.toISOString(),
        newEndsAt: plan.newEndsAt.toISOString(),
        oldClientBilledTotalCents: plan.oldClientBilledTotalCents,
        newClientBilledTotalCents: plan.newClientBilledTotalCents,
        oldTalentCompensationTotalCents: plan.oldTalentCompensationTotalCents,
        newTalentCompensationTotalCents: plan.newTalentCompensationTotalCents,
        clientBilledDeltaCents,
        pendingTalentInvoiceAdjustmentCents: finalizedFullProgrammingShift ? clientBilledDeltaCents : 0,
        assignments: plan.assignments.map((assignment) => ({
          assignmentId: assignment.id,
          oldStartsAt: assignment.oldStartsAt.toISOString(),
          oldEndsAt: assignment.oldEndsAt.toISOString(),
          newStartsAt: assignment.newStartsAt.toISOString(),
          newEndsAt: assignment.newEndsAt.toISOString(),
          oldTotalCompensationCents: assignment.oldTotalCompensationCents,
          newTotalCompensationCents: assignment.newTotalCompensationCents,
        })),
      },
  });
  return plan;
}

export async function updateShiftTime(actor: AuditActor, input: UpdateShiftTimeInput): Promise<ShiftTimeEditPlan> {
  assertInternalShiftTimeActor(actor);
  return getDb().transaction((tx) => updateShiftTimeInTransaction(tx, actor, input));
}

export async function deleteShiftInTransaction(
  tx: DatabaseTransaction,
  actor: AuditActor,
  shiftId: string,
  options: { audit?: boolean } = {},
) {
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
    .limit(1)
    .for("update", { of: shifts });
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
  if (options.audit !== false) {
    await tx.insert(auditLog).values({
        residencyId: shift.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "shift_deleted",
        entityType: "shift",
        entityId: shift.id,
        details: { serviceDate: shift.serviceDate, name: shift.name, draftInvoiceId: finalizedFullProgrammingShift ? null : shift.invoiceId, pendingTalentInvoiceAdjustment: finalizedFullProgrammingShift },
    });
  }
  return shift;
}

export async function deleteShift(actor: AuditActor, shiftId: string) {
  return getDb().transaction((tx) => deleteShiftInTransaction(tx, actor, shiftId));
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
