"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, residencies } from "@/db/schema";
import { requireResidencyActor } from "@/lib/auth";

export type ClientSettingsActionState = { status: "idle" | "success" | "error"; message: string };

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
