import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, automationRuns, invoices, residencies, shifts } from "@/db/schema";
import { calculateCompensationCents, isPaymentEligible, nextPayoutStatus } from "@/domain/airtable-parity";
import { hasReachedDailyRunWindow, localDateKey } from "@/domain/time";
import { sendApprovedInvoice } from "@/services/invoice-delivery";
import { reconcileShiftInvoiceLinks } from "@/services/shifts";

export async function runAutoComplete(now = new Date()) {
  const database = getDb();
  const residencyRows = await database.select({ id: residencies.id, timezone: residencies.timezone })
    .from(residencies).where(and(eq(residencies.active, true), eq(residencies.operatingMode, "operations")));
  const results: { residencyId: string; status: string; changed: number }[] = [];

  for (const residency of residencyRows) {
    if (!hasReachedDailyRunWindow(now, residency.timezone, 6)) {
      results.push({ residencyId: residency.id, status: "before_window", changed: 0 });
      continue;
    }
    const localDate = localDateKey(now, residency.timezone);
    const [run] = await database.insert(automationRuns).values({
      residencyId: residency.id,
      automationName: "auto_complete_past_bookings",
      scheduledKey: localDate,
      status: "running",
    }).onConflictDoNothing().returning({ id: automationRuns.id });
    if (!run) {
      results.push({ residencyId: residency.id, status: "already_ran", changed: 0 });
      continue;
    }

    try {
      const candidates = await database.select({
        id: assignments.id,
        serviceDate: shifts.serviceDate,
        compensationType: assignments.compensationType,
        startsAt: assignments.startsAt,
        endsAt: assignments.endsAt,
        talentId: assignments.talentId,
        talentRateCents: assignments.talentRateCents,
        fixedFeeCents: assignments.fixedFeeCents,
        payoutStatus: assignments.payoutStatus,
      }).from(assignments).innerJoin(shifts, eq(assignments.shiftId, shifts.id)).where(and(
        eq(shifts.residencyId, residency.id),
        eq(assignments.bookingStatus, "confirmed"),
        lt(shifts.serviceDate, localDate),
      ));

      await database.transaction(async (tx) => {
        for (const candidate of candidates) {
          const totalCompensationCents = calculateCompensationCents(candidate);
          const eligible = isPaymentEligible({
            bookingStatus: "completed",
            compensationType: candidate.compensationType,
            hasTalent: Boolean(candidate.talentId),
            hasServiceDate: Boolean(candidate.serviceDate),
            totalCompensationCents,
          });
          await tx.update(assignments).set({
            bookingStatus: "completed",
            totalCompensationCents,
            payoutStatus: candidate.compensationType === "na" ? "na" : nextPayoutStatus(candidate.payoutStatus, eligible),
            updatedAt: now,
          }).where(eq(assignments.id, candidate.id));
          await tx.insert(auditLog).values({
            residencyId: residency.id,
            actorLabel: "automation:auto-complete",
            action: "assignment_auto_completed",
            entityType: "assignment",
            entityId: candidate.id,
            details: { serviceDate: candidate.serviceDate },
          });
        }
        await tx.update(automationRuns).set({ status: "succeeded", processedCount: candidates.length, changedCount: candidates.length, completedAt: now })
          .where(eq(automationRuns.id, run.id));
      });
      results.push({ residencyId: residency.id, status: "succeeded", changed: candidates.length });
    } catch (error) {
      await database.update(automationRuns).set({ status: "failed", error: error instanceof Error ? error.message : "Unknown error", completedAt: new Date() })
        .where(eq(automationRuns.id, run.id));
      throw error;
    }
  }
  return results;
}

export async function runReconciliation(now = new Date()) {
  const database = getDb();
  const residencyRows = await database.select({ id: residencies.id }).from(residencies).where(and(eq(residencies.active, true), eq(residencies.operatingMode, "operations")));
  const results = [];
  for (const residency of residencyRows) {
    const scheduledKey = now.toISOString().slice(0, 13);
    const [run] = await database.insert(automationRuns).values({
      residencyId: residency.id,
      automationName: "parity_reconciliation",
      scheduledKey,
      status: "running",
    }).onConflictDoNothing().returning({ id: automationRuns.id });
    if (!run) continue;
    try {
      const payoutCandidates = await database.select({
        id: assignments.id,
        serviceDate: shifts.serviceDate,
        compensationType: assignments.compensationType,
        startsAt: assignments.startsAt,
        endsAt: assignments.endsAt,
        talentId: assignments.talentId,
        talentRateCents: assignments.talentRateCents,
        fixedFeeCents: assignments.fixedFeeCents,
        totalCompensationCents: assignments.totalCompensationCents,
        payoutStatus: assignments.payoutStatus,
      }).from(assignments).innerJoin(shifts, eq(assignments.shiftId, shifts.id)).where(and(
        eq(shifts.residencyId, residency.id),
        eq(assignments.bookingStatus, "completed"),
        inArray(assignments.payoutStatus, ["not_ready", "ready_to_pay"]),
      ));
      let readyChanged = 0;
      for (const candidate of payoutCandidates) {
        const compensation = calculateCompensationCents(candidate);
        const eligible = isPaymentEligible({
          bookingStatus: "completed",
          compensationType: candidate.compensationType,
          hasTalent: Boolean(candidate.talentId),
          hasServiceDate: Boolean(candidate.serviceDate),
          totalCompensationCents: compensation,
        });
        const next = nextPayoutStatus(candidate.payoutStatus, eligible);
        if (next !== candidate.payoutStatus || compensation !== candidate.totalCompensationCents) {
          await database.update(assignments).set({ payoutStatus: next, totalCompensationCents: compensation, updatedAt: now }).where(eq(assignments.id, candidate.id));
          readyChanged += 1;
        }
      }
      const linked = await reconcileShiftInvoiceLinks(residency.id);
      const approvedInvoices = await database.select({ id: invoices.id }).from(invoices).where(and(
        eq(invoices.residencyId, residency.id),
        eq(invoices.status, "approved"),
      ));
      let invoicesSent = 0;
      for (const invoice of approvedInvoices) {
        try {
          const result = await sendApprovedInvoice(invoice.id);
          if (result.status === "sent") invoicesSent += 1;
        } catch {
          // sendApprovedInvoice records a visible Attention item; continue other reconciliation work.
        }
      }
      await database.update(automationRuns).set({
        status: "succeeded",
        processedCount: payoutCandidates.length + linked.processed + approvedInvoices.length,
        changedCount: readyChanged + linked.changed + invoicesSent,
        completedAt: now,
      }).where(eq(automationRuns.id, run.id));
      results.push({ residencyId: residency.id, readyChanged, shiftsLinked: linked.changed, invoicesSent });
    } catch (error) {
      await database.update(automationRuns).set({ status: "failed", error: error instanceof Error ? error.message : "Unknown error", completedAt: new Date() })
        .where(eq(automationRuns.id, run.id));
      throw error;
    }
  }
  return results;
}
