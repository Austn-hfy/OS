import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, invoices, residencies, shifts } from "@/db/schema";
import { resolveRateCents } from "@/domain/airtable-parity";
import type { InternalActor } from "@/lib/auth";

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

export async function reconcileShiftInvoiceLinks(residencyId: string) {
  const database = getDb();
  const unlinked = await database.select().from(shifts).where(and(
    eq(shifts.residencyId, residencyId),
    inArray(shifts.billingStatus, ["pending", "reviewed"]),
  ));
  let changed = 0;
  for (const shift of unlinked.filter((item) => !item.invoiceId)) {
    const covering = await database.select({ id: invoices.id }).from(invoices).where(and(
      eq(invoices.residencyId, residencyId),
      eq(invoices.kind, "scheduled_period"),
      lte(invoices.billingPeriodStart, shift.serviceDate),
      gte(invoices.billingPeriodEnd, shift.serviceDate),
      ne(invoices.status, "void"),
    ));
    if (covering.length === 1) {
      await database.update(shifts).set({
        invoiceId: covering[0].id,
        invoiceLinkIssue: false,
        invoiceLinkNote: "",
        updatedAt: new Date(),
      }).where(eq(shifts.id, shift.id));
      changed += 1;
    } else {
      await database.update(shifts).set({
        invoiceLinkIssue: true,
        invoiceLinkNote: covering.length ? "More than one Invoice covers this Shift." : "No Invoice period covers this Shift.",
        updatedAt: new Date(),
      }).where(eq(shifts.id, shift.id));
    }
  }
  return { processed: unlinked.length, changed };
}
