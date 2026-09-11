"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PlatformBillingActionState } from "@/components/platform-billing-action-form";
import { requireInternalActor, requireInternalActorForMutation } from "@/lib/auth";
import { createPlatformSubscriptionCheckout, enrollFoundingClient, updateCommittedPlan } from "@/services/platform-stripe";
import { reconcilePlatformUsage } from "@/services/platform-usage";

export type PlatformPlanActionState = { status: "idle" | "success" | "error"; message: string };
export type FoundingClientActionState = PlatformPlanActionState;

const planSchema = z.object({
  residencyId: z.uuid(),
  cadence: z.enum(["monthly", "quarterly", "annual"]).optional().default("monthly"),
  commitmentTier: z.enum(["month_to_month", "three_month", "six_month", "twelve_month"]).optional(),
  talentProgramSessions: z.coerce.number().int().min(0).max(10_000),
  talentSessionUnitAmount: z.coerce.number().min(0).max(1_000_000).optional().default(60),
  housePrograms: z.coerce.number().int().min(0).max(10_000),
  houseProgramUnitAmount: z.coerce.number().min(0).max(1_000_000).optional().default(60),
  oneOffAllowance: z.coerce.number().int().min(0).max(10_000),
  startsOn: z.iso.date(),
  renewsOn: z.iso.date(),
  changeReason: z.string().trim().min(3).max(500),
});

export async function saveCommittedPlanAction(_previous: PlatformPlanActionState, formData: FormData): Promise<PlatformPlanActionState> {
  try {
    const actor = await requireInternalActor();
    const parsed = planSchema.parse(Object.fromEntries(formData));
    const talentSessionUnitAmountCents = Math.round(parsed.talentSessionUnitAmount * 100);
    const houseProgramUnitAmountCents = Math.round(parsed.houseProgramUnitAmount * 100);
    if (!Number.isSafeInteger(talentSessionUnitAmountCents)) throw new Error("Talent Program session rate is invalid.");
    if (!Number.isSafeInteger(houseProgramUnitAmountCents)) throw new Error("House Program Daypart rate is invalid.");
    if (parsed.renewsOn < parsed.startsOn) throw new Error("Renewal date cannot be before the plan start date.");
    await updateCommittedPlan(actor, {
      residencyId: parsed.residencyId,
      cadence: parsed.cadence,
      commitmentTier: parsed.commitmentTier ?? null,
      talentProgramSessions: parsed.talentProgramSessions,
      talentSessionUnitAmountCents,
      housePrograms: parsed.housePrograms,
      houseProgramUnitAmountCents,
      oneOffAllowance: parsed.oneOffAllowance,
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

export async function enrollFoundingClientAction(_previous: FoundingClientActionState, formData: FormData): Promise<FoundingClientActionState> {
  try {
    const actor = await requireInternalActorForMutation();
    const residencyId = z.uuid().parse(formData.get("residencyId"));
    const window = await enrollFoundingClient(actor, residencyId);
    revalidatePath("/app/platform-billing");
    revalidatePath("/residency/settings/billing");
    return {
      status: "success",
      message: `Founding Client pricing is active through ${window.endsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}.`,
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to enroll this Residency as a Founding Client." };
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
