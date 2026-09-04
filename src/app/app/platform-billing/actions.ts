"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalActor } from "@/lib/auth";
import { createPlatformSubscriptionCheckout, updateCommittedPlan } from "@/services/platform-stripe";
import { reconcilePlatformUsage } from "@/services/platform-usage";

export type PlatformPlanActionState = { status: "idle" | "success" | "error"; message: string };

const planSchema = z.object({
  residencyId: z.uuid(),
  cadence: z.enum(["monthly", "quarterly", "annual"]),
  talentProgramSessions: z.coerce.number().int().min(0).max(10_000),
  housePrograms: z.coerce.number().int().min(0).max(10_000),
  oneOffAllowance: z.coerce.number().int().min(0).max(10_000),
  unitAmount: z.coerce.number().min(0).max(1_000_000),
  startsOn: z.iso.date(),
  renewsOn: z.iso.date(),
  changeReason: z.string().trim().min(3).max(500),
});

export async function saveCommittedPlanAction(_previous: PlatformPlanActionState, formData: FormData): Promise<PlatformPlanActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = planSchema.parse(Object.fromEntries(formData));
    const unitAmountCents = Math.round(parsed.unitAmount * 100);
    if (!Number.isSafeInteger(unitAmountCents)) throw new Error("Per-unit rate is invalid.");
    if (parsed.renewsOn < parsed.startsOn) throw new Error("Renewal date cannot be before the plan start date.");
    await updateCommittedPlan(actor, { ...parsed, unitAmountCents });
    await reconcilePlatformUsage(parsed.residencyId);
    revalidatePath("/app/platform-billing");
    revalidatePath("/residency");
    revalidatePath("/residency/settings/billing");
    return { status: "success", message: "Committed Plan saved. Live Usage and overages did not change the bill." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save the Committed Plan." };
  }
}

export async function startPlatformStripeCheckoutAction(formData: FormData) {
  const actor = await requireInternalActor();
  const residencyId = z.uuid().parse(formData.get("residencyId"));
  const url = await createPlatformSubscriptionCheckout(actor, residencyId);
  redirect(url);
}

export async function refreshPlatformUsageAction(formData: FormData) {
  await requireInternalActor();
  const residencyId = z.uuid().parse(formData.get("residencyId"));
  await reconcilePlatformUsage(residencyId);
  revalidatePath("/app/platform-billing");
}
