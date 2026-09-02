"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, auditLog, clientAssignmentTerms, residencies, residencyTalent, shifts, talent } from "@/db/schema";
import { requireResidencyActor } from "@/lib/auth";
import { resolveClientArtistGenre } from "@/domain/talent-genres";

export type ClientSettingsActionState = { status: "idle" | "success" | "error"; message: string };

export async function createClientOwnedArtistAction(
  _previous: ClientSettingsActionState,
  formData: FormData,
): Promise<ClientSettingsActionState> {
  try {
    const actor = await requireResidencyActor();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    const parsed = z.object({
      name: z.string().trim().min(1).max(200),
      contact: z.string().trim().max(300),
      genre: z.string(),
      customGenre: z.string().default(""),
    }).parse(Object.fromEntries(formData));
    const genre = resolveClientArtistGenre(parsed.genre, parsed.customGenre);
    const database = getDb();
    await database.transaction(async (tx) => {
      const duplicate = await tx.select({ id: talent.id }).from(talent).where(and(
        eq(talent.owningResidencyId, actor.residencyId),
        sql`lower(${talent.stageName}) = lower(${parsed.name})`,
      )).limit(1);
      if (duplicate.length) throw new Error("An artist with this name is already in your roster.");
      const [artist] = await tx.insert(talent).values({
        stageName: parsed.name,
        clientContact: parsed.contact,
        genres: [genre],
        ownership: "residency",
        owningResidencyId: actor.residencyId,
        exclusiveResidencyId: actor.residencyId,
        rosterStatus: "ready",
        talentStatus: "active",
      }).returning({ id: talent.id });
      await tx.insert(residencyTalent).values({
        residencyId: actor.residencyId,
        talentId: artist.id,
        active: true,
        approvedByUserId: actor.userId,
      });
      await tx.insert(auditLog).values({
        residencyId: actor.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "client_owned_artist_created",
        entityType: "talent",
        entityId: artist.id,
        details: { ownership: "residency" },
      });
    });
    revalidatePath("/residency/talent");
    revalidatePath("/residency/calendar");
    return { status: "success", message: `${parsed.name} added to your roster.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to add this artist." };
  }
}

export async function updateClientOwnedRateAction(
  _previous: ClientSettingsActionState,
  formData: FormData,
): Promise<ClientSettingsActionState> {
  try {
    const actor = await requireResidencyActor();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    const parsed = z.object({
      assignmentId: z.uuid(),
      rate: z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000)]),
    }).parse(Object.fromEntries(formData));
    const [owned] = await getDb().select({ id: assignments.id }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .innerJoin(clientAssignmentTerms, eq(clientAssignmentTerms.assignmentId, assignments.id))
      .where(and(
        eq(assignments.id, parsed.assignmentId),
        eq(assignments.source, "client_owned"),
        eq(shifts.residencyId, actor.residencyId),
        eq(clientAssignmentTerms.residencyId, actor.residencyId),
      )).limit(1);
    if (!owned) throw new Error("Client-owned assignment not found.");
    await getDb().update(clientAssignmentTerms).set({
      rateCents: parsed.rate === "" ? null : Math.round(parsed.rate * 100),
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    }).where(eq(clientAssignmentTerms.assignmentId, parsed.assignmentId));
    await getDb().insert(auditLog).values({
      residencyId: actor.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "client_owned_rate_updated",
      entityType: "assignment",
      entityId: parsed.assignmentId,
      details: { ledger: "client_only" },
    });
    revalidatePath("/residency/payouts");
    return { status: "success", message: "Rate saved." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save this rate." };
  }
}

export async function updateResidencyClientSettingsAction(
  _previous: ClientSettingsActionState,
  formData: FormData,
): Promise<ClientSettingsActionState> {
  try {
    const actor = await requireResidencyActor();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    const parsed = z.object({
      name: z.string().trim().min(2).max(160),
      cityState: z.string().trim().max(120),
      timezone: z.string().trim().min(3).max(100),
      primaryContactName: z.string().trim().max(160),
      primaryContactPhone: z.string().trim().max(50),
      primaryContactEmail: z.union([z.literal(""), z.email()]),
    }).parse(Object.fromEntries(formData));
    const [updated] = await getDb().update(residencies).set({
      ...parsed,
      updatedAt: new Date(),
    }).where(and(
      eq(residencies.id, actor.residencyId),
      eq(residencies.operatingMode, "operations"),
      eq(residencies.active, true),
    )).returning({ id: residencies.id });
    if (!updated) throw new Error("Residency not found.");
    await getDb().insert(auditLog).values({
      residencyId: actor.residencyId,
      actorUserId: actor.userId,
      actorLabel: actor.email,
      action: "residency_client_settings_updated",
      entityType: "residency",
      entityId: actor.residencyId,
      details: { name: parsed.name, cityState: parsed.cityState, timezone: parsed.timezone },
    });
    revalidatePath("/residency");
    revalidatePath("/residency/settings");
    revalidatePath("/residency/calendar");
    return { status: "success", message: "Residency settings saved." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save Residency settings." };
  }
}
