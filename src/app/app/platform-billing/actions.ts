"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PlatformBillingActionState } from "@/components/platform-billing-action-form";
import { requireInternalActor } from "@/lib/auth";
import { createPlatformSubscriptionCheckout, updateCommittedPlan } from "@/services/platform-stripe";
import { reconcilePlatformUsage } from "@/services/platform-usage";

export type PlatformPlanActionState = { status: "idle" | "success" | "error"; message: string };

const planSchema = z.object({
  residencyId: z.uuid(),
  term: z.enum(["month_to_month", "annual"]),
  talentBucketSize: z.coerce.number().int().refine((value) => [10, 20, 30, 40, 50, 60].includes(value), "Select a standard Talent bucket."),
  houseBucketSize: z.coerce.number().int().refine((value) => [5, 10, 15].includes(value), "Select a House bucket of at least 5 slots."),
  startsOn: z.iso.date(),
  renewsOn: z.iso.date(),
  changeReason: z.string().trim().min(3).max(500),
});

export async function saveCommittedPlanAction(_previous: PlatformPlanActionState, formData: FormData): Promise<PlatformPlanActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = planSchema.parse(Object.fromEntries(formData));
    if (parsed.renewsOn < parsed.startsOn) throw new Error("Renewal date cannot be before the plan start date.");
    await updateCommittedPlan(actor, {
      residencyId: parsed.residencyId,
      term: parsed.term,
      talentBucketSize: parsed.talentBucketSize,
      houseBucketSize: parsed.houseBucketSize,
      startsOn: parsed.startsOn,
      renewsOn: parsed.renewsOn,
      changeReason: parsed.changeReason,
    });
    await reconcilePlatformUsage(parsed.residencyId);
    revalidatePath("/app/platform-billing");
    revalidatePath("/residency");
    revalidatePath("/residency/settings/billing");
    return { status: "success", message: "Committed Plan saved. Live Usage and overages did not change the bill." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to save the Committed Plan." };
  }
}

export async function startPlatformStripeCheckoutAction(_previous: PlatformBillingActionState, formData: FormData): Promise<PlatformBillingActionState> {
  let url: string;
  try {
    const actor = await requireInternalActor();
    const residencyId = z.uuid().parse(formData.get("residencyId"));
    url = await createPlatformSubscriptionCheckout(actor, residencyId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to start Platform Checkout." };
  }
  redirect(url);
}

export async function refreshPlatformUsageAction(_previous: PlatformBillingActionState, formData: FormData): Promise<PlatformBillingActionState> {
  try {
    await requireInternalActor();
    const residencyId = z.uuid().parse(formData.get("residencyId"));
    await reconcilePlatformUsage(residencyId);
    revalidatePath("/app/platform-billing");
    return { status: "success", message: "Platform usage refreshed." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to refresh Platform usage." };
  }
}
