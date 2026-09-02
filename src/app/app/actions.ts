"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accountSetupTokens, assignments, auditLog, clientAccounts, dayparts, invoiceLineItems, invoices, publicCalendarLinkDayparts, publicCalendarLinks, residencies, residencyContacts, residencyMemberships, residencyTalent, scheduleOccurrences, shifts, talent, talentPaymentProfiles, users } from "@/db/schema";
import { buildAccountSetupUrl, issueAccountSetupToken } from "@/domain/account-setup";
import { calculateBillableAmountCents } from "@/domain/airtable-parity";
import { zonedLocalDateTimeToUtc } from "@/domain/time";
import { requireActorForResidency, requireInternalActor } from "@/lib/auth";
import { changeAssignmentPaidDate, markAssignmentPaid, replaceAssignmentTalent, rescheduleAssignment, transitionAssignment } from "@/services/assignments";
import { clearDaypartDateException, removeDaypart, saveDaypart, saveDaypartDateOverride, skipDaypartDate } from "@/services/dayparts";
import { saveInvoiceBranding } from "@/services/invoice-branding";
import { addAssignmentToShift, createResidencyDateBooking, deleteOneTimeOccurrence, updateOneTimeOccurrence, updateOneTimeShift } from "@/services/residency-bookings";
import { createShift, deleteShift } from "@/services/shifts";
import { parseTalentGenres } from "@/domain/talent-genres";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issuePublicCalendarToken } from "@/domain/public-calendar";
import { cancelHfyTalentRequest, fulfillHfyTalentRequest } from "@/services/hfy-talent-requests";
import { requestOrigin } from "@/lib/request-origin";

export type ResidencyActionState = { status: "idle" | "success" | "error"; message: string };
export type PublicCalendarLinkActionState = ResidencyActionState & { url?: string };
export type CredentialLinkActionState = ResidencyActionState & { setupLink?: string };
export type ArtistRosterOperation = "active" | "inactive" | "archive" | "restore" | "add_to_residency";

function centsFromDollars(value: FormDataEntryValue | null): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error("Enter a valid dollar amount.");
  return Math.round(amount * 100);
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function requireManagerForAssignment(assignmentId: string) {
  const [row] = await getDb().select({ residencyId: shifts.residencyId })
    .from(assignments)
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!row) throw new Error("Assignment not found.");
  return requireActorForResidency(row.residencyId, { manager: true });
}

async function requireManagerForShift(shiftId: string) {
  const [row] = await getDb().select({ residencyId: shifts.residencyId })
    .from(shifts)
    .where(eq(shifts.id, shiftId))
    .limit(1);
  if (!row) throw new Error("Shift not found.");
  return requireActorForResidency(row.residencyId, { manager: true });
}

async function requireManagerForOccurrence(occurrenceId: string) {
  const [row] = await getDb().select({ residencyId: scheduleOccurrences.residencyId })
    .from(scheduleOccurrences)
    .where(eq(scheduleOccurrences.id, occurrenceId))
    .limit(1);
  if (!row) throw new Error("Calendar activity not found.");
  return requireActorForResidency(row.residencyId, { manager: true });
}

export async function updateInvoiceBrandingAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({
      companyName: z.string().trim().min(2).max(100),
      billingEmail: z.email(),
      billingAddress: z.string().trim().max(500),
    }).parse(Object.fromEntries(formData));
    const logoValue = formData.get("logo");
    if (logoValue !== null && !(logoValue instanceof File)) throw new Error("Choose a valid logo image.");
    await saveInvoiceBranding(actor, { ...parsed, logoFile: logoValue instanceof File && logoValue.size > 0 ? logoValue : null });
    revalidatePath("/app/setup");
    return { status: "success", message: "Invoice branding saved. New approvals will use these details." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save Invoice branding." };
  }
}

export async function createResidencyAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({
      clientName: z.string().trim().min(2),
      residencyName: z.string().trim().min(2),
      cityState: z.string().trim(),
      timezone: z.string().trim().min(3),
      tier: z.enum(["operations_only", "complete"]),
      invoicePrefix: z.string().trim().min(2).max(12),
      billingContactEmail: z.email(),
      billingContactName: z.string().trim().min(2),
      paymentTermsDays: z.coerce.number().int().min(0).max(365),
    }).parse(Object.fromEntries(formData));
    const database = getDb();
    await database.transaction(async (tx) => {
      const [account] = await tx.insert(clientAccounts).values({ name: parsed.clientName }).returning({ id: clientAccounts.id });
      const [residency] = await tx.insert(residencies).values({
        clientAccountId: account.id,
        slug: slugify(parsed.residencyName),
        name: parsed.residencyName,
        cityState: parsed.cityState,
        timezone: parsed.timezone,
        tier: parsed.tier,
        defaultTalentRateCents: centsFromDollars(formData.get("defaultTalentRate")),
        clientHourlyRateCents: centsFromDollars(formData.get("clientHourlyRate")),
        paymentTermsDays: parsed.paymentTermsDays,
        billingContactEmail: parsed.billingContactEmail,
        billingContactName: parsed.billingContactName,
        invoicePrefix: parsed.invoicePrefix.toUpperCase(),
        autoSendInvoices: formData.get("autoSendInvoices") === "on",
        autoSendReason: formData.get("autoSendInvoices") === "on" ? "Enabled for pilot Residency" : "Manual send",
      }).returning({ id: residencies.id });
      await tx.insert(auditLog).values({
        residencyId: residency.id,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "residency_created",
        entityType: "residency",
        entityId: residency.id,
        details: { clientName: parsed.clientName, tier: parsed.tier },
      });
    });
    revalidatePath("/app");
    revalidatePath("/app/setup");
    return { status: "success", message: `${parsed.residencyName} is ready in Operations.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create this Residency." };
  }
}

export async function rotatePublicCalendarLinkAction(_previous: PublicCalendarLinkActionState, formData: FormData): Promise<PublicCalendarLinkActionState> {
  try {
    const { residencyId, scope } = z.object({
      residencyId: z.uuid(),
      scope: z.enum(["all", "selected"]),
    }).parse(Object.fromEntries(formData));
    const actor = await requireActorForResidency(residencyId, { manager: true });
    const baseUrl = requestOrigin(await headers());
    const selectedDaypartIds = z.array(z.uuid()).max(100).parse([...new Set(formData.getAll("daypartIds").map(String))]);
    if (scope === "selected" && !selectedDaypartIds.length) throw new Error("Select at least one Daypart for this link.");
    const { token, tokenHash } = issuePublicCalendarToken();
    const database = getDb();
    await database.transaction(async (tx) => {
      const [residency] = await tx.select({ id: residencies.id, name: residencies.name }).from(residencies).where(and(
        eq(residencies.id, residencyId),
        eq(residencies.active, true),
        eq(residencies.operatingMode, "operations"),
      )).limit(1);
      if (!residency) throw new Error("Residency not found.");

      if (scope === "selected") {
        const allowedDayparts = await tx.select({ id: dayparts.id }).from(dayparts).where(and(
          eq(dayparts.residencyId, residencyId),
          eq(dayparts.active, true),
          inArray(dayparts.id, selectedDaypartIds),
        ));
        if (allowedDayparts.length !== selectedDaypartIds.length) throw new Error("One or more selected Dayparts are unavailable for this Residency.");
      }

      await tx.insert(publicCalendarLinks).values({
        residencyId,
        tokenHash,
        scope,
        rotatedByUserId: actor.userId,
      }).onConflictDoUpdate({
        target: publicCalendarLinks.residencyId,
        set: { tokenHash, scope, rotatedByUserId: actor.userId, rotatedAt: new Date() },
      });
      await tx.delete(publicCalendarLinkDayparts).where(eq(publicCalendarLinkDayparts.residencyId, residencyId));
      if (scope === "selected") {
        await tx.insert(publicCalendarLinkDayparts).values(selectedDaypartIds.map((daypartId) => ({ residencyId, daypartId })));
      }
      await tx.insert(auditLog).values({
        residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "public_calendar_link_rotated",
        entityType: "residency",
        entityId: residencyId,
        details: { residencyName: residency.name, scope, daypartIds: scope === "selected" ? selectedDaypartIds : [] },
      });
    });
    revalidatePath("/app/calendar");
    revalidatePath("/app/setup");
    return {
      status: "success",
      message: "New public calendar link created. The previous link, if any, is now invalid.",
      url: new URL(`/share/calendar/${token}`, baseUrl).toString(),
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create a public calendar link." };
  }
}

const leadContactSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  primaryContactName: z.string().trim().min(1).max(120),
  primaryContactPhone: z.string().trim().max(60),
  primaryContactEmail: z.union([z.literal(""), z.email()]),
  source: z.enum(["inbound", "outbound"]),
  pipelineStatus: z.enum(["contacted", "call_scheduled", "call_complete", "discovery_scheduled", "discovery_complete", "proposal_sent", "won", "lost"]),
  notes: z.string().max(20_000),
});

export async function createLeadAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = leadContactSchema.omit({ pipelineStatus: true }).parse({
      ...Object.fromEntries(formData),
      pipelineStatus: undefined,
    });
    const token = randomUUID().replaceAll("-", "").slice(0, 10);
    const database = getDb();
    await database.transaction(async (tx) => {
      const [account] = await tx.insert(clientAccounts).values({ name: parsed.companyName }).returning({ id: clientAccounts.id });
      const [lead] = await tx.insert(residencies).values({
        clientAccountId: account.id,
        slug: `${slugify(parsed.companyName) || "lead"}-${token}`,
        name: parsed.companyName,
        invoicePrefix: `LEAD-${token.toUpperCase()}`,
        operatingMode: "pipeline",
        primaryContactName: parsed.primaryContactName,
        primaryContactPhone: parsed.primaryContactPhone,
        primaryContactEmail: parsed.primaryContactEmail,
        leadSource: parsed.source,
        pipelineStatus: "contacted",
        pipelineStatusChangedAt: new Date(),
        leadNotes: parsed.notes,
      }).returning({ id: residencies.id });
      await tx.insert(auditLog).values({
        residencyId: lead.id,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "lead_created",
        entityType: "residency",
        entityId: lead.id,
        details: { source: parsed.source, pipelineStatus: "contacted" },
      });
    });
    revalidatePath("/app/leads");
    return { status: "success", message: `${parsed.companyName} added to Contacted.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create this Lead." };
  }
}

export async function updateLeadAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const leadId = z.uuid().parse(formData.get("leadId"));
    const parsed = leadContactSchema.parse(Object.fromEntries(formData));
    const conversion = parsed.pipelineStatus === "won" ? z.object({
      cityState: z.string().trim().min(2).max(120),
      timezone: z.string().trim().min(3).max(100),
      tier: z.enum(["operations_only", "complete"]),
      invoicePrefix: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()),
      defaultTalentRate: z.coerce.number().min(0).max(100_000),
      clientHourlyRate: z.coerce.number().min(0).max(100_000),
      billingContactName: z.string().trim().min(1).max(120),
      billingContactEmail: z.email(),
      billingAddress: z.string().trim().max(600),
      paymentTermsDays: z.coerce.number().int().min(0).max(365),
      invoiceFrequency: z.enum(["weekly", "monthly", "manual"]),
      billingCycleStartWeekday: z.coerce.number().int().min(0).max(6),
      billingCycleLengthDays: z.coerce.number().int().min(1).max(31),
      invoiceLinePresentation: z.enum(["service_detail", "daily_summary", "period_summary"]),
    }).parse(Object.fromEntries(formData)) : null;

    const database = getDb();
    await database.transaction(async (tx) => {
      const [lead] = await tx.select({
        id: residencies.id,
        clientAccountId: residencies.clientAccountId,
        status: residencies.pipelineStatus,
      }).from(residencies).where(and(
        eq(residencies.id, leadId),
        eq(residencies.operatingMode, "pipeline"),
        eq(residencies.active, true),
      )).limit(1);
      if (!lead) throw new Error("Lead not found or already converted.");
      const now = new Date();
      const becameWon = parsed.pipelineStatus === "won";
      await tx.update(clientAccounts).set({ name: parsed.companyName, updatedAt: now }).where(eq(clientAccounts.id, lead.clientAccountId));
      const [updated] = await tx.update(residencies).set({
        name: parsed.companyName,
        primaryContactName: parsed.primaryContactName,
        primaryContactPhone: parsed.primaryContactPhone,
        primaryContactEmail: parsed.primaryContactEmail,
        leadSource: parsed.source,
        pipelineStatus: parsed.pipelineStatus,
        pipelineStatusChangedAt: lead.status === parsed.pipelineStatus ? undefined : now,
        leadNotes: parsed.notes,
        operatingMode: becameWon ? "operations" : "pipeline",
        convertedAt: becameWon ? now : null,
        ...(conversion ? {
          cityState: conversion.cityState,
          timezone: conversion.timezone,
          tier: conversion.tier,
          invoicePrefix: conversion.invoicePrefix,
          defaultTalentRateCents: Math.round(conversion.defaultTalentRate * 100),
          clientHourlyRateCents: Math.round(conversion.clientHourlyRate * 100),
          billingContactName: conversion.billingContactName,
          billingContactEmail: conversion.billingContactEmail,
          billingAddress: conversion.billingAddress,
          paymentTermsDays: conversion.paymentTermsDays,
          invoiceFrequency: conversion.invoiceFrequency,
          billingCycleStartWeekday: conversion.billingCycleStartWeekday,
          billingCycleLengthDays: conversion.billingCycleLengthDays,
          invoiceLinePresentation: conversion.invoiceLinePresentation,
          autoSendInvoices: formData.get("autoSendInvoices") === "on",
          autoSendReason: formData.get("autoSendInvoices") === "on" ? "Enabled at Lead conversion" : "Manual send",
        } : {}),
        updatedAt: now,
      }).where(eq(residencies.id, lead.id)).returning({ id: residencies.id });
      await tx.insert(auditLog).values({
        residencyId: lead.id,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: becameWon ? "lead_converted_to_residency" : "lead_updated",
        entityType: "residency",
        entityId: lead.id,
        details: { fromStatus: lead.status, toStatus: parsed.pipelineStatus, source: parsed.source, operatingMode: becameWon ? "operations" : "pipeline" },
      });
      return updated;
    });
    revalidatePath("/app/leads");
    if (parsed.pipelineStatus === "won") revalidatePath("/app");
    return { status: "success", message: parsed.pipelineStatus === "won" ? `${parsed.companyName} converted to an Operations Residency.` : `${parsed.companyName} saved.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to update this Lead." };
  }
}

export async function createTalentAction(formData: FormData) {
  const actor = await requireInternalActor();
  const parsed = z.object({
    stageName: z.string().trim().min(1),
    fullName: z.string().trim(),
    email: z.union([z.literal(""), z.email()]),
    phone: z.string().trim(),
    homeMarket: z.string().trim(),
    priority: z.coerce.number().int().min(1).max(5),
  }).parse(Object.fromEntries(formData));
  const genres = parseTalentGenres(formData);
  const [artist] = await getDb().insert(talent).values({
    stageName: parsed.stageName,
    fullName: parsed.fullName,
    email: parsed.email,
    phone: parsed.phone,
    homeMarket: parsed.homeMarket,
    genres,
    priority: parsed.priority,
    rosterStatus: "ready",
    talentStatus: "active",
  }).returning({ id: talent.id });
  await getDb().insert(auditLog).values({
    actorUserId: actor.userId,
    actorLabel: actor.email,
    action: "talent_created",
    entityType: "talent",
    entityId: artist.id,
    details: { stageName: parsed.stageName },
  });
  revalidatePath("/app/talent");
  revalidatePath("/app/setup");
}

export async function createArtistLookupAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    await createTalentAction(formData);
    return { status: "success", message: `${String(formData.get("stageName") ?? "Artist")} added to the shared roster.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to add this artist." };
  }
}

export async function updateArtistAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({
      talentId: z.uuid(),
      stageName: z.string().trim().min(1),
      fullName: z.string().trim(),
      email: z.union([z.literal(""), z.email()]),
      phone: z.string().trim(),
      instagramHandle: z.string().trim(),
      homeMarket: z.string().trim(),
      priority: z.union([z.literal(""), z.coerce.number().int().min(1).max(5)]),
      rosterStatus: z.enum(["needs_review", "ready"]),
      talentStatus: z.enum(["active", "inactive"]),
      talentNotes: z.string(),
      paymentMethod: z.string().trim(),
      zelleEmail: z.union([z.literal(""), z.email()]),
      zellePhone: z.string().trim(),
      lastFour: z.union([z.literal(""), z.string().regex(/^\d{4}$/)]),
    }).parse(Object.fromEntries(formData));
    const genres = parseTalentGenres(formData);
    const database = getDb();
    await database.transaction(async (tx) => {
      const [artist] = await tx.update(talent).set({
        stageName: parsed.stageName,
        fullName: parsed.fullName,
        email: parsed.email,
        phone: parsed.phone,
        instagramHandle: parsed.instagramHandle,
        homeMarket: parsed.homeMarket,
        genres,
        priority: parsed.priority === "" ? null : parsed.priority,
        rosterStatus: parsed.rosterStatus,
        talentStatus: parsed.talentStatus,
        talentNotes: parsed.talentNotes,
        updatedAt: new Date(),
      }).where(eq(talent.id, parsed.talentId)).returning({ id: talent.id });
      if (!artist) throw new Error("Artist not found.");
      await tx.insert(talentPaymentProfiles).values({
        talentId: parsed.talentId,
        paymentMethod: parsed.paymentMethod,
        zelleEmail: parsed.zelleEmail,
        zellePhone: parsed.zellePhone,
        lastFour: parsed.lastFour,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: talentPaymentProfiles.talentId,
        set: {
          paymentMethod: parsed.paymentMethod,
          zelleEmail: parsed.zelleEmail,
          zellePhone: parsed.zellePhone,
          lastFour: parsed.lastFour,
          updatedAt: new Date(),
        },
      });
      await tx.insert(auditLog).values({
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "talent_updated",
        entityType: "talent",
        entityId: parsed.talentId,
        details: { stageName: parsed.stageName, rosterStatus: parsed.rosterStatus, talentStatus: parsed.talentStatus, paymentMethod: parsed.paymentMethod },
      });
    });
    revalidatePath("/app/talent");
    revalidatePath("/app/talent/roster");
    revalidatePath("/app/calendar");
    revalidatePath("/app/setup");
    return { status: "success", message: `${parsed.stageName} saved.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save this artist." };
  }
}

export async function bulkUpdateArtistsAction(input: {
  talentIds: string[];
  operation: ArtistRosterOperation;
  residencyId?: string;
}): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({
      talentIds: z.array(z.uuid()).min(1).max(250).transform((ids) => [...new Set(ids)]),
      operation: z.enum(["active", "inactive", "archive", "restore", "add_to_residency"]),
      residencyId: z.uuid().optional(),
    }).parse(input);
    const database = getDb();
    const artistRows = await database.select({
      id: talent.id,
      stageName: talent.stageName,
      archivedAt: talent.archivedAt,
      exclusiveResidencyId: talent.exclusiveResidencyId,
    })
      .from(talent)
      .where(inArray(talent.id, parsed.talentIds));
    if (artistRows.length !== parsed.talentIds.length) throw new Error("One or more artists could not be found.");

    let residencyName = "";
    if (parsed.operation === "add_to_residency") {
      if (!parsed.residencyId) throw new Error("Choose a Residency first.");
      const [residency] = await database.select({ id: residencies.id, name: residencies.name })
        .from(residencies)
        .where(and(eq(residencies.id, parsed.residencyId), eq(residencies.active, true), eq(residencies.operatingMode, "operations")))
        .limit(1);
      if (!residency) throw new Error("Residency not found.");
      if (artistRows.some((artist) => artist.archivedAt)) throw new Error("Restore archived artists before adding them to a Residency.");
      if (artistRows.some((artist) => artist.exclusiveResidencyId && artist.exclusiveResidencyId !== parsed.residencyId)) {
        throw new Error("One or more exclusive artists can only be assigned to their exclusive Residency.");
      }
      residencyName = residency.name;
    }

    await database.transaction(async (tx) => {
      if (parsed.operation === "active") {
        await tx.update(talent).set({ talentStatus: "active", archivedAt: null, updatedAt: new Date() }).where(inArray(talent.id, parsed.talentIds));
      } else if (parsed.operation === "inactive") {
        await tx.update(talent).set({ talentStatus: "inactive", updatedAt: new Date() }).where(inArray(talent.id, parsed.talentIds));
      } else if (parsed.operation === "archive") {
        await tx.update(talent).set({ talentStatus: "inactive", archivedAt: new Date(), updatedAt: new Date() }).where(inArray(talent.id, parsed.talentIds));
        await tx.update(residencyTalent).set({ active: false }).where(inArray(residencyTalent.talentId, parsed.talentIds));
      } else if (parsed.operation === "restore") {
        await tx.update(talent).set({ talentStatus: "inactive", archivedAt: null, updatedAt: new Date() }).where(inArray(talent.id, parsed.talentIds));
      } else if (parsed.residencyId) {
        await tx.insert(residencyTalent).values(parsed.talentIds.map((talentId) => ({
          residencyId: parsed.residencyId!,
          talentId,
          approvedByUserId: actor.userId,
          active: true,
        }))).onConflictDoUpdate({
          target: [residencyTalent.residencyId, residencyTalent.talentId],
          set: { active: true, approvedByUserId: actor.userId },
        });
      }

      await tx.insert(auditLog).values(parsed.talentIds.map((talentId) => ({
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: `talent_${parsed.operation}`,
        entityType: "talent",
        entityId: talentId,
        residencyId: parsed.operation === "add_to_residency" ? parsed.residencyId : null,
        details: { operation: parsed.operation, residencyName: residencyName || undefined },
      })));
    });

    revalidatePath("/app/talent");
    revalidatePath("/app/talent/roster");
    revalidatePath("/app/calendar");
    revalidatePath("/app/setup");
    const count = parsed.talentIds.length;
    const subject = `${count} artist${count === 1 ? "" : "s"}`;
    const message = parsed.operation === "add_to_residency"
      ? `${subject} added to ${residencyName}.`
      : parsed.operation === "active"
        ? `${subject} set to Active.`
        : parsed.operation === "inactive"
          ? `${subject} set to Inactive.`
          : parsed.operation === "archive"
            ? `${subject} archived.`
            : `${subject} restored as Inactive.`;
    return { status: "success", message };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to update the selected artists." };
  }
}

export async function updateArtistResidenciesAction(input: {
  talentId: string;
  residencyIds: string[];
}): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({
      talentId: z.uuid(),
      residencyIds: z.array(z.uuid()).max(250).transform((ids) => [...new Set(ids)]),
    }).parse(input);
    const database = getDb();
    const [artist] = await database.select({
      id: talent.id,
      stageName: talent.stageName,
      archivedAt: talent.archivedAt,
      exclusiveResidencyId: talent.exclusiveResidencyId,
    })
      .from(talent)
      .where(eq(talent.id, parsed.talentId))
      .limit(1);
    if (!artist) throw new Error("Artist not found.");
    if (artist.archivedAt && parsed.residencyIds.length) throw new Error("Restore this artist before adding Residency access.");
    if (artist.exclusiveResidencyId && parsed.residencyIds.some((residencyId) => residencyId !== artist.exclusiveResidencyId)) {
      throw new Error("An exclusive artist can only be assigned to their exclusive Residency.");
    }

    const validResidencies = parsed.residencyIds.length ? await database.select({ id: residencies.id })
      .from(residencies)
      .where(and(inArray(residencies.id, parsed.residencyIds), eq(residencies.active, true), eq(residencies.operatingMode, "operations"))) : [];
    if (validResidencies.length !== parsed.residencyIds.length) throw new Error("One or more Residencies could not be found.");

    await database.transaction(async (tx) => {
      await tx.update(residencyTalent).set({ active: false }).where(eq(residencyTalent.talentId, parsed.talentId));
      if (parsed.residencyIds.length) {
        await tx.insert(residencyTalent).values(parsed.residencyIds.map((residencyId) => ({
          residencyId,
          talentId: parsed.talentId,
          approvedByUserId: actor.userId,
          active: true,
        }))).onConflictDoUpdate({
          target: [residencyTalent.residencyId, residencyTalent.talentId],
          set: { active: true, approvedByUserId: actor.userId },
        });
      }
      await tx.insert(auditLog).values({
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "talent_residencies_updated",
        entityType: "talent",
        entityId: parsed.talentId,
        details: { residencyIds: parsed.residencyIds },
      });
    });
    revalidatePath("/app/talent");
    revalidatePath("/app/talent/roster");
    revalidatePath("/app/calendar");
    revalidatePath("/app/setup");
    return { status: "success", message: `${artist.stageName}'s Residency assignments were saved.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to update Residency access." };
  }
}

export async function updateArtistRosterPlacementAction(input: {
  talentId: string;
  exclusiveResidencyId: string | null;
  residencyIds: string[];
}): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({
      talentId: z.uuid(),
      exclusiveResidencyId: z.uuid().nullable(),
      residencyIds: z.array(z.uuid()).max(250).transform((ids) => [...new Set(ids)]),
    }).parse(input);
    const database = getDb();
    const [artist] = await database.select({ id: talent.id, stageName: talent.stageName, archivedAt: talent.archivedAt })
      .from(talent)
      .where(eq(talent.id, parsed.talentId))
      .limit(1);
    if (!artist) throw new Error("Artist not found.");
    if (artist.archivedAt) throw new Error("Restore this artist before changing Residency eligibility.");

    if (parsed.exclusiveResidencyId && parsed.residencyIds.some((residencyId) => residencyId !== parsed.exclusiveResidencyId)) {
      throw new Error("An exclusive artist can only be assigned to their exclusive Residency.");
    }
    const desiredResidencyIds = parsed.exclusiveResidencyId ? [parsed.exclusiveResidencyId] : parsed.residencyIds;
    const validResidencies = desiredResidencyIds.length ? await database.select({ id: residencies.id, name: residencies.name })
      .from(residencies)
      .where(and(
        inArray(residencies.id, desiredResidencyIds),
        eq(residencies.active, true),
        eq(residencies.operatingMode, "operations"),
      )) : [];
    if (validResidencies.length !== desiredResidencyIds.length) throw new Error("One or more Residencies could not be found.");
    const residencyName = parsed.exclusiveResidencyId
      ? validResidencies.find((residency) => residency.id === parsed.exclusiveResidencyId)?.name ?? "the selected Residency"
      : null;

    await database.transaction(async (tx) => {
      // Clear prior exclusivity before changing assignment rows so moving an
      // exclusive artist remains one atomic, database-valid operation.
      await tx.update(talent).set({ exclusiveResidencyId: null, updatedAt: new Date() }).where(eq(talent.id, parsed.talentId));
      await tx.update(residencyTalent).set({ active: false }).where(eq(residencyTalent.talentId, parsed.talentId));
      if (desiredResidencyIds.length) {
        await tx.insert(residencyTalent).values(desiredResidencyIds.map((residencyId) => ({
          residencyId,
          talentId: parsed.talentId,
          approvedByUserId: actor.userId,
          active: true,
        }))).onConflictDoUpdate({
          target: [residencyTalent.residencyId, residencyTalent.talentId],
          set: { active: true, approvedByUserId: actor.userId },
        });
      }
      await tx.update(talent).set({
        exclusiveResidencyId: parsed.exclusiveResidencyId,
        updatedAt: new Date(),
      }).where(eq(talent.id, parsed.talentId));
      await tx.insert(auditLog).values({
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "talent_roster_placement_updated",
        entityType: "talent",
        entityId: parsed.talentId,
        residencyId: parsed.exclusiveResidencyId,
        details: {
          eligibility: parsed.exclusiveResidencyId ? "exclusive" : "shared",
          exclusiveResidencyId: parsed.exclusiveResidencyId,
          residencyName,
          residencyIds: desiredResidencyIds,
        },
      });
    });
    revalidatePath("/app/talent");
    revalidatePath("/app/talent/roster");
    revalidatePath("/app/calendar");
    revalidatePath("/app/setup");
    return {
      status: "success",
      message: parsed.exclusiveResidencyId
        ? `${artist.stageName} is exclusive to and assigned to ${residencyName}.`
        : `${artist.stageName}'s shared Residency assignments were saved.`,
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to update roster placement." };
  }
}

export async function approveResidencyTalentAction(formData: FormData) {
  const actor = await requireInternalActor();
  const parsed = z.object({ residencyId: z.uuid(), talentId: z.uuid() }).parse(Object.fromEntries(formData));
  await getDb().insert(residencyTalent).values({
    residencyId: parsed.residencyId,
    talentId: parsed.talentId,
    approvedByUserId: actor.userId,
    active: true,
  }).onConflictDoUpdate({
    target: [residencyTalent.residencyId, residencyTalent.talentId],
    set: { active: true, approvedByUserId: actor.userId },
  });
  revalidatePath("/app/setup");
  revalidatePath("/app/talent/roster");
}

export async function updateResidencyApprovedTalentAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const raw = z.string().min(2).parse(formData.get("payload"));
    const parsed = z.object({
      residencyId: z.uuid(),
      talentIds: z.array(z.uuid()).max(1_000).transform((ids) => [...new Set(ids)]),
    }).parse(JSON.parse(raw));
    const database = getDb();
    const [residency] = await database.select({ id: residencies.id, name: residencies.name }).from(residencies)
      .where(and(eq(residencies.id, parsed.residencyId), eq(residencies.active, true), eq(residencies.operatingMode, "operations")))
      .limit(1);
    if (!residency) throw new Error("Residency not found.");
    const validTalent = parsed.talentIds.length ? await database.select({ id: talent.id }).from(talent).where(and(
      inArray(talent.id, parsed.talentIds),
      eq(talent.talentStatus, "active"),
      isNull(talent.archivedAt),
      or(isNull(talent.exclusiveResidencyId), eq(talent.exclusiveResidencyId, residency.id)),
    )) : [];
    if (validTalent.length !== parsed.talentIds.length) throw new Error("One or more selected DJs are no longer active.");
    await database.transaction(async (tx) => {
      await tx.update(residencyTalent).set({ active: false }).where(eq(residencyTalent.residencyId, residency.id));
      if (parsed.talentIds.length) {
        await tx.insert(residencyTalent).values(parsed.talentIds.map((talentId) => ({
          residencyId: residency.id,
          talentId,
          active: true,
          approvedByUserId: actor.userId,
        }))).onConflictDoUpdate({
          target: [residencyTalent.residencyId, residencyTalent.talentId],
          set: { active: true, approvedByUserId: actor.userId },
        });
      }
      await tx.insert(auditLog).values({
        residencyId: residency.id,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "residency_approved_talent_updated",
        entityType: "residency",
        entityId: residency.id,
        details: { talentIds: parsed.talentIds, count: parsed.talentIds.length },
      });
    });
    revalidatePath("/app/setup");
    revalidatePath("/app/talent");
    revalidatePath("/app/talent/roster");
    revalidatePath("/app/calendar");
    return { status: "success", message: `${parsed.talentIds.length} approved DJ${parsed.talentIds.length === 1 ? "" : "s"} saved for ${residency.name}.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save the approved DJ list." };
  }
}

const residencyContactSchema = z.object({
  id: z.union([z.literal(""), z.uuid()]),
  residencyId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  title: z.string().trim().max(120),
  email: z.union([z.literal(""), z.email()]).transform((value) => value.toLocaleLowerCase()),
  phone: z.string().trim().max(50),
  accessRole: z.enum(["none", "manager", "calendar_viewer"]),
  isPrimary: z.boolean(),
});

export async function saveResidencyContactAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = residencyContactSchema.parse({
      ...Object.fromEntries(formData),
      isPrimary: formData.get("isPrimary") === "on",
    });
    if (parsed.accessRole !== "none" && !parsed.email) throw new Error("An email is required before login access can be assigned.");
    const database = getDb();
    const [residency] = await database.select({ id: residencies.id, name: residencies.name }).from(residencies).where(and(
      eq(residencies.id, parsed.residencyId),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    )).limit(1);
    if (!residency) throw new Error("Residency not found.");

    await database.transaction(async (tx) => {
      if (parsed.isPrimary) await tx.update(residencyContacts).set({ isPrimary: false }).where(eq(residencyContacts.residencyId, residency.id));
      const values = {
        residencyId: residency.id,
        name: parsed.name,
        title: parsed.title,
        email: parsed.email,
        phone: parsed.phone,
        accessRole: parsed.accessRole === "none" ? null : parsed.accessRole,
        isPrimary: parsed.isPrimary,
        updatedAt: new Date(),
      } as const;
      const [saved] = parsed.id
        ? await tx.update(residencyContacts).set(values).where(and(eq(residencyContacts.id, parsed.id), eq(residencyContacts.residencyId, residency.id))).returning({ id: residencyContacts.id, userId: residencyContacts.userId })
        : await tx.insert(residencyContacts).values(values).returning({ id: residencyContacts.id, userId: residencyContacts.userId });
      if (!saved) throw new Error("Contact not found.");
      if (saved.userId) {
        await tx.update(residencyMemberships).set({
          active: parsed.accessRole !== "none",
          ...(parsed.accessRole !== "none" ? { accessRole: parsed.accessRole } : {}),
        }).where(and(eq(residencyMemberships.userId, saved.userId), eq(residencyMemberships.residencyId, residency.id)));
      }
      await tx.insert(auditLog).values({
        residencyId: residency.id,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: parsed.id ? "residency_contact_updated" : "residency_contact_created",
        entityType: "residency_contact",
        entityId: saved.id,
        details: { accessRole: parsed.accessRole, isPrimary: parsed.isPrimary },
      });
    });
    revalidatePath("/app/setup");
    return { status: "success", message: `${parsed.name} was saved for ${residency.name}.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save this contact." };
  }
}

export async function inviteResidencyContactAction(input: { contactId: string }): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const { contactId } = z.object({ contactId: z.uuid() }).parse(input);
    const database = getDb();
    const [contact] = await database.select({
      id: residencyContacts.id,
      residencyId: residencyContacts.residencyId,
      name: residencyContacts.name,
      email: residencyContacts.email,
      accessRole: residencyContacts.accessRole,
      userId: residencyContacts.userId,
      residencyName: residencies.name,
    }).from(residencyContacts).innerJoin(residencies, eq(residencyContacts.residencyId, residencies.id)).where(and(
      eq(residencyContacts.id, contactId),
      eq(residencyContacts.active, true),
      eq(residencies.active, true),
    )).limit(1);
    if (!contact) throw new Error("Contact not found.");
    if (!contact.email || !contact.accessRole) throw new Error("Add an email and access level before sending an invitation.");

    const admin = createSupabaseAdminClient();
    const existingLocal = (await database.select({ id: users.id }).from(users).where(eq(users.email, contact.email)).limit(1))[0];
    let authUserId = existingLocal?.id ?? contact.userId ?? null;
    let invitationStatus: "active" | "invited" = existingLocal ? "active" : "invited";
    if (!authUserId) {
      const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1_000 });
      if (listError) throw listError;
      const existingAuth = listed.users.find((user) => user.email?.toLocaleLowerCase() === contact.email);
      if (existingAuth) {
        authUserId = existingAuth.id;
        invitationStatus = "active";
      } else {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hfy.app";
        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(contact.email, {
          data: { display_name: contact.name },
          redirectTo: `${siteUrl}/auth/invite`,
        });
        if (inviteError) throw inviteError;
        authUserId = invited.user.id;
      }
    }
    if (!authUserId) throw new Error("The invitation did not create an account.");

    await database.transaction(async (tx) => {
      await tx.insert(users).values({
        id: authUserId,
        email: contact.email,
        displayName: contact.name,
        role: "hotel_user",
        active: true,
      }).onConflictDoUpdate({ target: users.id, set: { email: contact.email, displayName: contact.name, role: "hotel_user", active: true, updatedAt: new Date() } });
      await tx.insert(residencyMemberships).values({
        userId: authUserId,
        residencyId: contact.residencyId,
        accessRole: contact.accessRole!,
        active: true,
      }).onConflictDoUpdate({
        target: [residencyMemberships.userId, residencyMemberships.residencyId],
        set: { accessRole: contact.accessRole!, active: true },
      });
      await tx.update(residencyContacts).set({
        userId: authUserId,
        invitationStatus,
        invitedAt: invitationStatus === "invited" ? new Date() : undefined,
        acceptedAt: invitationStatus === "active" ? new Date() : undefined,
        updatedAt: new Date(),
      }).where(eq(residencyContacts.id, contact.id));
      await tx.insert(auditLog).values({
        residencyId: contact.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: invitationStatus === "invited" ? "residency_contact_invited" : "residency_contact_access_activated",
        entityType: "residency_contact",
        entityId: contact.id,
        details: { accessRole: contact.accessRole },
      });
    });
    revalidatePath("/app/setup");
    return { status: "success", message: invitationStatus === "invited" ? `Invitation sent to ${contact.email}.` : `${contact.email} already has an account and now has access.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to invite this contact." };
  }
}

export async function generateResidencySetupLinkAction(input: { contactId: string }): Promise<CredentialLinkActionState> {
  try {
    const actor = await requireInternalActor();
    const { contactId } = z.object({ contactId: z.uuid() }).parse(input);
    const [contact] = await getDb().select({
      id: residencyContacts.id,
      residencyId: residencyContacts.residencyId,
      email: residencyContacts.email,
      userId: residencyContacts.userId,
    }).from(residencyContacts)
      .innerJoin(users, eq(residencyContacts.userId, users.id))
      .where(and(
        eq(residencyContacts.id, contactId),
        eq(residencyContacts.active, true),
        eq(users.active, true),
        eq(users.role, "hotel_user"),
      ))
      .limit(1);
    if (!contact?.userId || !contact.email) throw new Error("This contact does not have an active login account.");
    const issuedAt = new Date();
    const credential = issueAccountSetupToken(issuedAt);
    await getDb().transaction(async (tx) => {
      await tx.update(accountSetupTokens).set({ revokedAt: issuedAt }).where(and(
        eq(accountSetupTokens.userId, contact.userId!),
        isNull(accountSetupTokens.usedAt),
        isNull(accountSetupTokens.revokedAt),
      ));
      const [setupToken] = await tx.insert(accountSetupTokens).values({
        userId: contact.userId!,
        residencyId: contact.residencyId,
        contactId: contact.id,
        tokenHash: credential.tokenHash,
        expiresAt: credential.expiresAt,
        createdByUserId: actor.userId,
        createdAt: issuedAt,
      }).returning({ id: accountSetupTokens.id });
      await tx.insert(auditLog).values({
        residencyId: contact.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "residency_setup_link_generated",
        entityType: "residency_contact",
        entityId: contact.id,
        details: { userId: contact.userId, setupTokenId: setupToken.id, expiresAt: credential.expiresAt.toISOString() },
      });
    });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hfy.app";
    return {
      status: "success",
      message: "A one-time setup link was copied. It expires in 7 days and is used only after a password is saved.",
      setupLink: buildAccountSetupUrl(siteUrl, credential.token),
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create a setup link." };
  }
}

const customInvoiceLineSchema = z.object({
  serviceDate: z.union([z.literal(""), z.iso.date()]).nullable().optional(),
  description: z.string().trim().min(1).max(250),
  quantity: z.coerce.number().positive().max(100_000),
  unitLabel: z.string().trim().min(1).max(40),
  unitAmount: z.coerce.number().min(0).max(10_000_000),
});

export async function createResidencyInvoiceAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({
      residencyId: z.uuid(),
      kind: z.enum(["scheduled_period", "custom"]),
      invoiceNumber: z.string().trim().min(1).max(80),
      billingPeriodStart: z.iso.date(),
      billingPeriodEnd: z.iso.date(),
      invoiceDate: z.iso.date(),
      notes: z.string().trim().max(2_000),
    }).parse(Object.fromEntries(formData));
    if (parsed.billingPeriodEnd < parsed.billingPeriodStart) throw new Error("The period end must be on or after the start date.");

    const database = getDb();
    const [residency] = await database.select({
      id: residencies.id,
      paymentTermsDays: residencies.paymentTermsDays,
      defaultInvoiceNote: residencies.defaultInvoiceNote,
    }).from(residencies).where(eq(residencies.id, parsed.residencyId)).limit(1);
    if (!residency) throw new Error("Residency not found.");

    const shiftIds = z.array(z.uuid()).parse(formData.getAll("shiftIds"));
    const customLines = parsed.kind === "custom"
      ? z.array(customInvoiceLineSchema).min(1).max(100).parse(JSON.parse(z.string().parse(formData.get("manualLinesJson"))))
      : [];
    if (parsed.kind === "scheduled_period" && !shiftIds.length) throw new Error("Select at least one scheduled service.");

    await database.transaction(async (tx) => {
      let scheduledRows: Array<{ id: string; serviceDate: string; startsAt: Date; endsAt: Date; clientRateCents: number }> = [];
      if (parsed.kind === "scheduled_period") {
        scheduledRows = await tx.select({
          id: shifts.id,
          serviceDate: shifts.serviceDate,
          startsAt: shifts.startsAt,
          endsAt: shifts.endsAt,
          clientRateCents: shifts.clientRateCents,
        }).from(shifts).where(and(
          eq(shifts.residencyId, parsed.residencyId),
          inArray(shifts.id, shiftIds),
        ));
        if (scheduledRows.length !== new Set(shiftIds).size) throw new Error("One or more selected services no longer belongs to this Residency.");
        for (const shift of scheduledRows) {
          if (shift.serviceDate < parsed.billingPeriodStart || shift.serviceDate > parsed.billingPeriodEnd) throw new Error("Every selected service must fall inside the billing period.");
        }
        const occupied = await tx.select({ id: shifts.id }).from(shifts).where(and(inArray(shifts.id, shiftIds), inArray(shifts.billingStatus, ["invoiced", "not_billable"])));
        if (occupied.length) throw new Error("One or more selected services is already invoiced or marked not billable.");
        const alreadyLinked = await tx.select({ id: shifts.id }).from(shifts).where(and(inArray(shifts.id, shiftIds), isNotNull(shifts.invoiceId)));
        if (alreadyLinked.length) throw new Error("One or more selected services is already linked to an Invoice.");
      }

      const manualValues = customLines.map((line, index) => {
        const quantityThousandths = Math.round(Number(line.quantity) * 1_000);
        const unitAmountCents = Math.round(Number(line.unitAmount) * 100);
        return {
          type: "special_event" as const,
          serviceDate: line.serviceDate || null,
          description: line.description,
          quantityThousandths,
          unitLabel: line.unitLabel,
          unitAmountCents,
          totalCents: Math.round((quantityThousandths * unitAmountCents) / 1_000),
          sortOrder: index,
        };
      });
      const totalCents = parsed.kind === "scheduled_period"
        ? scheduledRows.reduce((sum, shift) => sum + calculateBillableAmountCents(shift.startsAt, shift.endsAt, shift.clientRateCents), 0)
        : manualValues.reduce((sum, line) => sum + line.totalCents, 0);
      if (totalCents <= 0) throw new Error("The Invoice total must be greater than zero.");

      const [invoice] = await tx.insert(invoices).values({
        residencyId: parsed.residencyId,
        invoiceNumber: parsed.invoiceNumber,
        billingPeriodStart: parsed.billingPeriodStart,
        billingPeriodEnd: parsed.billingPeriodEnd,
        invoiceDate: parsed.invoiceDate,
        paymentTermsDays: residency.paymentTermsDays,
        kind: parsed.kind,
        notes: parsed.notes || residency.defaultInvoiceNote,
        totalCents,
        status: "draft",
      }).returning({ id: invoices.id });

      if (parsed.kind === "scheduled_period") {
        await tx.update(shifts).set({
          invoiceId: invoice.id,
          billingStatus: "invoiced",
          invoiceLinkIssue: false,
          invoiceLinkNote: "",
          updatedAt: new Date(),
        }).where(inArray(shifts.id, shiftIds));
      } else {
        await tx.insert(invoiceLineItems).values(manualValues.map((line) => ({ ...line, invoiceId: invoice.id })));
      }
      await tx.insert(auditLog).values({
        residencyId: parsed.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "invoice_created",
        entityType: "invoice",
        entityId: invoice.id,
        details: { invoiceNumber: parsed.invoiceNumber, kind: parsed.kind, totalCents, shiftCount: scheduledRows.length, lineCount: manualValues.length },
      });
    });
    revalidatePath("/app/invoices");
    revalidatePath("/app/calendar");
    return { status: "success", message: `${parsed.invoiceNumber} saved as a Draft Invoice.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create this Invoice." };
  }
}

export async function updateResidencyInvoiceSettingsAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({
      residencyId: z.uuid(),
      billingContactName: z.string().trim().min(1).max(120),
      billingContactEmail: z.email(),
      billingAddress: z.string().trim().max(600),
      invoicePrefix: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()),
      paymentTermsDays: z.coerce.number().int().min(0).max(365),
      invoiceFrequency: z.enum(["weekly", "monthly", "manual"]),
      billingCycleStartWeekday: z.coerce.number().int().min(0).max(6),
      billingCycleLengthDays: z.coerce.number().int().min(1).max(31),
      invoiceLinePresentation: z.enum(["service_detail", "daily_summary", "period_summary"]),
      defaultInvoiceNote: z.string().trim().max(2_000),
      autoSendReason: z.string().trim().max(500),
    }).parse(Object.fromEntries(formData));
    const autoSendInvoices = formData.get("autoSendInvoices") === "on";
    const autoSendReason = autoSendInvoices ? "Enabled for approved Invoices" : (parsed.autoSendReason || "Manual send");
    const database = getDb();
    await database.transaction(async (tx) => {
      const [updated] = await tx.update(residencies).set({
        billingContactName: parsed.billingContactName,
        billingContactEmail: parsed.billingContactEmail,
        billingAddress: parsed.billingAddress,
        invoicePrefix: parsed.invoicePrefix,
        paymentTermsDays: parsed.paymentTermsDays,
        invoiceFrequency: parsed.invoiceFrequency,
        billingCycleStartWeekday: parsed.billingCycleStartWeekday,
        billingCycleLengthDays: parsed.billingCycleLengthDays,
        invoiceLinePresentation: parsed.invoiceLinePresentation,
        defaultInvoiceNote: parsed.defaultInvoiceNote,
        autoSendInvoices,
        autoSendReason,
        updatedAt: new Date(),
      }).where(eq(residencies.id, parsed.residencyId)).returning({ id: residencies.id });
      if (!updated) throw new Error("Residency not found.");
      await tx.insert(auditLog).values({
        residencyId: parsed.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "residency_invoice_settings_updated",
        entityType: "residency",
        entityId: parsed.residencyId,
        details: { invoiceFrequency: parsed.invoiceFrequency, invoiceLinePresentation: parsed.invoiceLinePresentation, autoSendInvoices },
      });
    });
    revalidatePath("/app/invoices");
    return { status: "success", message: "Residency Invoice setup saved." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save Invoice setup." };
  }
}

export async function createShiftAction(formData: FormData) {
  const actor = await requireInternalActor();
  const parsed = z.object({
    residencyId: z.uuid(),
    name: z.string().trim().min(1),
    serviceDate: z.iso.date(),
    room: z.string().trim().min(1),
    startsAtLocal: z.string().min(16),
    endsAtLocal: z.string().min(16),
    notes: z.string(),
  }).parse(Object.fromEntries(formData));
  const [residency] = await getDb().select({ timezone: residencies.timezone }).from(residencies).where(eq(residencies.id, parsed.residencyId)).limit(1);
  if (!residency) throw new Error("Residency not found.");
  await createShift(actor, {
    residencyId: parsed.residencyId,
    name: parsed.name,
    serviceDate: parsed.serviceDate,
    room: parsed.room,
    startsAt: zonedLocalDateTimeToUtc(parsed.startsAtLocal, residency.timezone),
    endsAt: zonedLocalDateTimeToUtc(parsed.endsAtLocal, residency.timezone),
    notes: parsed.notes,
  });
  revalidatePath("/app/calendar");
}

const daypartPayloadSchema = z.object({
  id: z.uuid().optional(),
  residencyId: z.uuid(),
  name: z.string().trim().min(1),
  room: z.string().trim().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  type: z.enum(["dj_artist", "house_activity"]),
  billingMode: z.enum(["billed_by_hfy", "tracking_only"]).nullable(),
  scheduleMode: z.enum(["standing_weekly", "calendar_only"]),
  suggestedStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
  suggestedEndMinute: z.number().int().min(1).max(2879).nullable().optional(),
  defaultTalentRateCents: z.number().int().min(0).nullable().optional(),
  clientDefaultRateCents: z.number().int().min(0).nullable().optional(),
  activeUntil: z.iso.date().nullable().optional(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  rules: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(2879),
    defaultDjCount: z.number().int().min(1).max(20).nullable(),
  })),
}).superRefine((daypart, context) => {
  if (daypart.type === "house_activity" && daypart.billingMode !== null) {
    context.addIssue({ code: "custom", message: "House Activities do not have a billing mode." });
  }
  if (daypart.type === "dj_artist" && daypart.billingMode === null) {
    context.addIssue({ code: "custom", message: "Choose how this DJ / Artist Daypart is billed." });
  }
  if (daypart.billingMode === "tracking_only" && daypart.defaultTalentRateCents != null) {
    context.addIssue({ code: "custom", message: "Client Managed Dayparts cannot include an HFY talent rate." });
  }
  if (daypart.billingMode !== "tracking_only" && daypart.clientDefaultRateCents != null) {
    context.addIssue({ code: "custom", message: "Only Client Managed Dayparts can include a client rate." });
  }
  if (daypart.scheduleMode === "standing_weekly" && !daypart.rules.length) {
    context.addIssue({ code: "custom", message: "Select at least one operating day." });
  }
  if (daypart.scheduleMode === "calendar_only" && (daypart.rules.length || daypart.suggestedStartMinute == null || daypart.suggestedEndMinute == null || daypart.suggestedEndMinute <= daypart.suggestedStartMinute)) {
    context.addIssue({ code: "custom", message: "Calendar Only Dayparts need valid suggested hours and no weekly rules." });
  }
});

export async function saveDaypartAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const raw = z.string().min(2).parse(formData.get("payload"));
    const parsed = daypartPayloadSchema.parse(JSON.parse(raw));
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    let protectedPayload = parsed;
    if (actor.kind === "residency") {
      const [existing] = parsed.id ? await getDb().select({ defaultTalentRateCents: dayparts.defaultTalentRateCents })
        .from(dayparts)
        .where(and(eq(dayparts.id, parsed.id), eq(dayparts.residencyId, parsed.residencyId)))
        .limit(1) : [];
      protectedPayload = {
        ...parsed,
        defaultTalentRateCents: parsed.type === "dj_artist" && parsed.billingMode === "billed_by_hfy"
          ? existing?.defaultTalentRateCents ?? null
          : null,
      };
    }
    await saveDaypart(actor, protectedPayload);
    revalidatePath("/app/setup");
    revalidatePath("/app/calendar");
    revalidatePath("/app/dayparts");
    revalidatePath("/residency/calendar");
    revalidatePath("/residency/dayparts");
    return { status: "success", message: `${parsed.name} saved.` };
  } catch (error) {
    const message = error instanceof Error && !error.message.startsWith("Failed query:")
      ? error.message
      : "Unable to save this Daypart. Please try again.";
    return { status: "error", message };
  }
}

export async function removeDaypartAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const parsed = z.object({ residencyId: z.uuid(), daypartId: z.uuid() }).parse(Object.fromEntries(formData));
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    const result = await removeDaypart(actor, parsed.residencyId, parsed.daypartId);
    revalidatePath("/app/setup");
    revalidatePath("/app/calendar");
    revalidatePath("/app/dayparts");
    revalidatePath("/app");
    revalidatePath("/residency/calendar");
    revalidatePath("/residency/dayparts");
    return {
      status: "success",
      message: result.mode === "archived"
        ? "Daypart archived. Existing calendar and financial history was preserved."
        : "Unused Daypart permanently deleted.",
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to remove this Daypart." };
  }
}

const daypartDateActionSchema = z.object({
  residencyId: z.uuid(),
  daypartId: z.uuid(),
  serviceDate: z.iso.date(),
});

function revalidateResidencyCalendars() {
  revalidatePath("/app/calendar");
  revalidatePath("/residency/calendar");
}

export async function saveDaypartDateOverrideAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const parsed = daypartDateActionSchema.extend({
      startMinute: z.coerce.number().int().min(0).max(1439),
      endMinute: z.coerce.number().int().min(1).max(2879),
    }).parse(Object.fromEntries(formData));
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    await saveDaypartDateOverride(actor, parsed);
    revalidateResidencyCalendars();
    return { status: "success", message: "This date now uses custom hours. The standing Daypart was not changed." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to change this date's hours." };
  }
}

export async function skipDaypartDateAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const parsed = daypartDateActionSchema.parse(Object.fromEntries(formData));
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    await skipDaypartDate(actor, parsed);
    revalidateResidencyCalendars();
    revalidatePath("/residency/payouts");
    revalidatePath("/residency/invoices");
    revalidatePath("/app/payouts");
    revalidatePath("/app/invoices");
    return { status: "success", message: "This date was skipped. The standing Daypart remains unchanged." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to skip this date." };
  }
}

export async function clearDaypartDateExceptionAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const parsed = daypartDateActionSchema.parse(Object.fromEntries(formData));
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    await clearDaypartDateException(actor, parsed);
    revalidateResidencyCalendars();
    return { status: "success", message: "This date now follows the standing Daypart again." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to restore the standing Daypart." };
  }
}

export async function updateResidencyRatesAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({
      residencyId: z.uuid(),
      defaultTalentRate: z.coerce.number().min(0).max(100_000),
      clientHourlyRate: z.coerce.number().min(0).max(100_000),
    }).parse(Object.fromEntries(formData));
    const defaultTalentRateCents = Math.round(parsed.defaultTalentRate * 100);
    const clientHourlyRateCents = Math.round(parsed.clientHourlyRate * 100);
    const database = getDb();
    await database.transaction(async (tx) => {
      const [residency] = await tx.select({ id: residencies.id, defaultTalentRateCents: residencies.defaultTalentRateCents, clientHourlyRateCents: residencies.clientHourlyRateCents })
        .from(residencies)
        .where(eq(residencies.id, parsed.residencyId))
        .limit(1);
      if (!residency) throw new Error("Residency not found.");
      await tx.update(residencies).set({ defaultTalentRateCents, clientHourlyRateCents, updatedAt: new Date() }).where(eq(residencies.id, parsed.residencyId));
      await tx.insert(auditLog).values({
        residencyId: parsed.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "residency_default_rates_updated",
        entityType: "residency",
        entityId: parsed.residencyId,
        details: {
          previousTalentRateCents: residency.defaultTalentRateCents,
          previousClientRateCents: residency.clientHourlyRateCents,
          defaultTalentRateCents,
          clientHourlyRateCents,
        },
      });
    });
    revalidatePath("/app/setup");
    revalidatePath("/app/calendar");
    return { status: "success", message: "Default talent and client rates saved." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save the Residency rate." };
  }
}

export async function updateResidencyProfileAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({
      residencyId: z.uuid(),
      name: z.string().trim().min(2).max(160),
      cityState: z.string().trim().max(120),
      timezone: z.string().trim().min(3).max(100),
      tier: z.enum(["operations_only", "complete"]),
      internalNotes: z.string().trim().max(10_000),
    }).parse(Object.fromEntries(formData));
    const [updated] = await getDb().update(residencies).set({
      name: parsed.name,
      cityState: parsed.cityState,
      timezone: parsed.timezone,
      tier: parsed.tier,
      internalNotes: parsed.internalNotes,
      updatedAt: new Date(),
    }).where(and(eq(residencies.id, parsed.residencyId), eq(residencies.operatingMode, "operations"))).returning({ id: residencies.id });
    if (!updated) throw new Error("Residency not found.");
    await getDb().insert(auditLog).values({
      residencyId: parsed.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "residency_profile_updated",
      entityType: "residency",
      entityId: parsed.residencyId,
      details: { name: parsed.name, cityState: parsed.cityState, timezone: parsed.timezone, tier: parsed.tier },
    });
    revalidatePath("/app");
    revalidatePath("/residency/calendar");
    revalidatePath("/app/setup");
    return { status: "success", message: "Residency profile saved." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save the Residency profile." };
  }
}

const residencyBookingPayloadSchema = z.object({
  residencyId: z.uuid(),
  serviceDate: z.iso.date(),
  dayparts: z.array(z.object({
    daypartId: z.uuid().nullable(),
    name: z.string().trim().min(1).optional(),
    room: z.string().trim().min(1).optional(),
    calendarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    type: z.enum(["dj_artist", "house_activity"]).optional(),
    billingMode: z.enum(["billed_by_hfy", "tracking_only"]).nullable().optional(),
    notes: z.string().trim().max(2_000).optional().default(""),
    programDetails: z.string().trim().max(500).optional().default(""),
    manualHostName: z.string().trim().max(160).optional().default(""),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(2879),
    clientRateOverrideCents: z.number().int().min(0).nullable().optional(),
    requestHfy: z.boolean().optional(),
    assignments: z.array(z.object({
      talentId: z.uuid().nullable().optional(),
      startsAtMinute: z.number().int().min(0).max(2879).optional(),
      endsAtMinute: z.number().int().min(1).max(2879).optional(),
      compensationType: z.enum(["hourly", "fixed", "na"]).optional(),
      talentRateOverrideCents: z.number().int().min(0).nullable().optional(),
      fixedFeeCents: z.number().int().min(0).nullable().optional(),
    })),
  }).superRefine((slot, context) => {
    if (slot.daypartId === null && (!slot.name || !slot.room || !slot.calendarColor)) {
      context.addIssue({ code: "custom", message: "A one-time slot needs a name, room, and calendar color." });
    }
    if (slot.daypartId === null && !slot.type) {
      context.addIssue({ code: "custom", message: "Choose Talent Activity or House Activity for this one-time slot." });
    }
    if (slot.daypartId === null && slot.type === "house_activity" && slot.billingMode != null) {
      context.addIssue({ code: "custom", message: "House Activities do not have a billing mode." });
    }
    if (slot.daypartId === null && slot.type === "dj_artist" && !slot.billingMode) {
      context.addIssue({ code: "custom", message: "Choose how this one-time Talent Activity is handled." });
    }
  })).min(1),
});

export async function bookResidencyDateAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const raw = z.string().min(2).parse(formData.get("payload"));
    const parsed = residencyBookingPayloadSchema.parse(JSON.parse(raw));
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    const protectedPayload = actor.kind === "residency" ? {
      ...parsed,
      dayparts: parsed.dayparts.map((slot) => ({
        ...slot,
        clientRateOverrideCents: null,
        assignments: slot.assignments.map((assignment) => ({
          ...assignment,
          compensationType: "na" as const,
          talentRateOverrideCents: null,
          fixedFeeCents: null,
        })),
      })),
    } : parsed;
    const created = await createResidencyDateBooking(actor, protectedPayload);
    revalidatePath("/app/calendar");
    revalidatePath("/app/payouts");
    revalidatePath("/app/invoices");
    revalidatePath("/app");
    revalidatePath("/residency/calendar");
    revalidatePath("/residency/payouts");
    const count = created.shiftIds.length + created.occurrenceIds.length;
    return { status: "success", message: `${count} calendar slot${count === 1 ? "" : "s"} scheduled.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to book this date." };
  }
}

export async function cancelHfyTalentRequestAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const parsed = z.object({
      residencyId: z.uuid(),
      shiftId: z.uuid(),
      daypartId: z.preprocess((value) => value === "" ? null : value, z.uuid().nullable()),
      serviceDate: z.iso.date(),
    }).parse(Object.fromEntries(formData));
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    await cancelHfyTalentRequest(actor, parsed);
    revalidateResidencyCalendars();
    revalidatePath("/app");
    return { status: "success", message: "HFY request cancelled for this date only. The date is Client Managed again." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to cancel this HFY request." };
  }
}

export async function fulfillHfyTalentRequestAction(
  _previous: ResidencyActionState,
  formData: FormData,
): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const raw = z.string().min(2).parse(formData.get("payload"));
    const parsed = z.object({
      requestId: z.uuid(),
      assignments: z.array(z.object({
        talentId: z.uuid(),
        startsAtMinute: z.number().int().min(0).max(2879),
        endsAtMinute: z.number().int().min(1).max(2879),
      })).min(1).max(20),
    }).parse(JSON.parse(raw));
    const result = await fulfillHfyTalentRequest(actor, {
      requestId: parsed.requestId,
      assignments: parsed.assignments,
    });
    revalidatePath("/app");
    revalidatePath("/app/calendar");
    revalidatePath("/app/payouts");
    revalidatePath("/app/invoices");
    revalidatePath("/residency/calendar");
    revalidatePath("/residency/payouts");
    revalidatePath("/residency/invoices");
    return { status: "success", message: `${result.artistNames.join(" + ")} assigned using the Residency rates.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to fulfill this HFY request." };
  }
}

export async function updateClientPaymentStatusVisibilityAction(
  _previous: ResidencyActionState,
  formData: FormData,
): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const residencyId = z.uuid().parse(formData.get("residencyId"));
    const visible = formData.get("visible") === "on";
    const [updated] = await getDb().update(residencies).set({
      clientPaymentStatusVisible: visible,
      updatedAt: new Date(),
    }).where(and(
      eq(residencies.id, residencyId),
      eq(residencies.operatingMode, "operations"),
    )).returning({ id: residencies.id });
    if (!updated) throw new Error("Residency not found.");
    await getDb().insert(auditLog).values({
      residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "client_payment_status_visibility_updated",
      entityType: "residency",
      entityId: residencyId,
      details: { visible },
    });
    revalidatePath("/app/setup");
    revalidatePath("/residency");
    revalidatePath("/residency/payouts");
    return { status: "success", message: visible ? "Payment Status is visible to this client." : "Payment Status is hidden from this client." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to update client visibility." };
  }
}

export async function transitionAssignmentAction(formData: FormData) {
  const actor = await requireInternalActor();
  const parsed = z.object({
    assignmentId: z.uuid(),
    targetStatus: z.enum(["open", "offered", "confirmed", "completed", "cancelled"]),
  }).parse(Object.fromEntries(formData));
  await transitionAssignment(actor, parsed.assignmentId, parsed.targetStatus);
  revalidatePath("/app/calendar");
  revalidatePath("/app/payouts");
}

export async function replaceAssignmentTalentAction(formData: FormData) {
  const parsed = z.object({ assignmentId: z.uuid(), talentId: z.uuid() }).parse(Object.fromEntries(formData));
  const actor = await requireManagerForAssignment(parsed.assignmentId);
  await replaceAssignmentTalent(actor, parsed.assignmentId, parsed.talentId);
  revalidatePath("/app/calendar");
  revalidatePath("/app/payouts");
}

function calendarAssignmentErrorMessage(error: unknown, fallback: string, operation: "reschedule" | "remove") {
  const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
  const databaseError = cause && typeof cause === "object" ? cause as Record<string, unknown> : {};
  console.error("Calendar assignment mutation failed", {
    operation,
    code: databaseError.code,
    constraint: databaseError.constraint_name ?? databaseError.constraint,
    detail: databaseError.detail,
    message: cause instanceof Error ? cause.message : undefined,
  });
  if (!(error instanceof Error)) return fallback;
  return error.message.startsWith("Failed query:") ? fallback : error.message;
}

export async function rescheduleAssignmentAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const parsed = z.object({
      assignmentId: z.uuid(),
      talentId: z.uuid(),
      startsAtMinute: z.coerce.number().int().min(0).max(2879),
      endsAtMinute: z.coerce.number().int().min(1).max(2879),
    }).parse(Object.fromEntries(formData));
    const actor = await requireManagerForAssignment(parsed.assignmentId);
    await rescheduleAssignment(actor, parsed.assignmentId, parsed);
    revalidatePath("/app/calendar");
    revalidatePath("/app/payouts");
    return { status: "success", message: "DJ and hours updated." };
  } catch (error) {
    return { status: "error", message: calendarAssignmentErrorMessage(error, "Unable to update this DJ. Refresh the page and try again.", "reschedule") };
  }
}

export async function removeCalendarAssignmentAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const assignmentId = z.uuid().parse(formData.get("assignmentId"));
    const actor = await requireManagerForAssignment(assignmentId);
    await transitionAssignment(actor, assignmentId, "cancelled");
    revalidatePath("/app/calendar");
    revalidatePath("/app/payouts");
    return { status: "success", message: "DJ removed from this Shift." };
  } catch (error) {
    return { status: "error", message: calendarAssignmentErrorMessage(error, "Unable to remove this DJ. Refresh the page and try again.", "remove") };
  }
}

export async function deleteCalendarShiftAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const shiftId = z.uuid().parse(formData.get("shiftId"));
    const actor = await requireManagerForShift(shiftId);
    await deleteShift(actor, shiftId);
    revalidatePath("/app/calendar");
    revalidatePath("/app/payouts");
    revalidatePath("/app/invoices");
    revalidatePath("/app");
    revalidatePath("/residency/calendar");
    revalidatePath("/residency/payouts");
    revalidatePath("/residency/invoices");
    return { status: "success", message: "Shift deleted." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to delete this Shift." };
  }
}

const oneTimeRecordSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(160),
  room: z.string().trim().min(1).max(160),
  calendarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  startMinute: z.coerce.number().int().min(0).max(1439),
  endMinute: z.coerce.number().int().min(1).max(2879),
  notes: z.string().trim().max(2_000),
  programDetails: z.string().trim().max(500),
  manualHostName: z.string().trim().max(160),
});

function revalidateOneTimeRecordViews() {
  revalidatePath("/app/calendar");
  revalidatePath("/app/payouts");
  revalidatePath("/app/invoices");
  revalidatePath("/residency/calendar");
  revalidatePath("/residency/payouts");
  revalidatePath("/residency/invoices");
}

export async function updateOneTimeShiftAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const parsed = oneTimeRecordSchema.parse(Object.fromEntries(formData));
    const actor = await requireManagerForShift(parsed.id);
    await updateOneTimeShift(actor, parsed);
    revalidateOneTimeRecordViews();
    return { status: "success", message: "One-time slot updated." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to update this one-time slot." };
  }
}

export async function updateOneTimeOccurrenceAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const parsed = oneTimeRecordSchema.parse(Object.fromEntries(formData));
    const actor = await requireManagerForOccurrence(parsed.id);
    await updateOneTimeOccurrence(actor, parsed);
    revalidateOneTimeRecordViews();
    return { status: "success", message: "One-time activity updated." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to update this one-time activity." };
  }
}

export async function deleteOneTimeOccurrenceAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const occurrenceId = z.uuid().parse(formData.get("occurrenceId"));
    const actor = await requireManagerForOccurrence(occurrenceId);
    await deleteOneTimeOccurrence(actor, occurrenceId);
    revalidateOneTimeRecordViews();
    return { status: "success", message: "One-time activity deleted." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to delete this one-time activity." };
  }
}

export async function addCalendarAssignmentAction(formData: FormData): Promise<ResidencyActionState> {
  try {
    const parsed = z.object({
      shiftId: z.uuid(),
      talentId: z.uuid(),
      startsAtMinute: z.coerce.number().int().min(0).max(2879),
      endsAtMinute: z.coerce.number().int().min(1).max(2879),
      compensationType: z.enum(["hourly", "fixed", "na"]),
      talentRateOverride: z.string(),
      fixedFee: z.string(),
    }).parse(Object.fromEntries(formData));
    const actor = await requireManagerForShift(parsed.shiftId);
    await addAssignmentToShift(actor, {
      shiftId: parsed.shiftId,
      talentId: parsed.talentId,
      startsAtMinute: parsed.startsAtMinute,
      endsAtMinute: parsed.endsAtMinute,
      compensationType: actor.kind === "residency" ? "hourly" : parsed.compensationType,
      talentRateOverrideCents: actor.kind === "residency" ? null : parsed.talentRateOverride.trim() ? centsFromDollars(parsed.talentRateOverride) : null,
      fixedFeeCents: actor.kind === "residency" ? null : parsed.fixedFee.trim() ? centsFromDollars(parsed.fixedFee) : null,
    });
    revalidatePath("/app/calendar");
    revalidatePath("/app/payouts");
    return { status: "success", message: "DJ added to this Shift." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to add this DJ." };
  }
}

export async function markAssignmentPaidAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const assignmentId = z.uuid().parse(formData.get("assignmentId"));
    const [assignment] = await getDb().select({
      totalCompensationCents: assignments.totalCompensationCents,
      paymentMethod: talentPaymentProfiles.paymentMethod,
    }).from(assignments)
      .leftJoin(talentPaymentProfiles, eq(assignments.talentId, talentPaymentProfiles.talentId))
      .where(eq(assignments.id, assignmentId)).limit(1);
    if (!assignment) throw new Error("Assignment not found.");
    const paidAt = new Date();
    await markAssignmentPaid(actor, assignmentId, {
      paidAt,
      paidAmountCents: assignment.totalCompensationCents,
      paymentReference: `${assignment.paymentMethod?.trim() || "Manual"} · HFY OS`,
    });
    revalidatePath("/app/payouts");
    revalidatePath("/app");
    return { status: "success", message: "Marked paid today." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to mark this payout paid." };
  }
}

export async function changeAssignmentPaidDateAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = z.object({ assignmentId: z.uuid(), paidAt: z.iso.date() }).parse(Object.fromEntries(formData));
    await changeAssignmentPaidDate(actor, parsed.assignmentId, new Date(`${parsed.paidAt}T12:00:00.000Z`));
    revalidatePath("/app/payouts");
    revalidatePath("/app");
    return { status: "success", message: "Paid date updated." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to change the paid date." };
  }
}
