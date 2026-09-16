"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PlatformBillingActionState } from "@/components/platform-billing-action-form";
import { requireResidencyActor } from "@/lib/auth";
import { createPlatformPaymentMethodCheckout, createPlatformSubscriptionCheckout, switchResidencyCommittedPlanToAnnual } from "@/services/platform-stripe";

export async function switchResidencyPlatformPlanToAnnualAction(_previous: PlatformBillingActionState, _formData: FormData): Promise<PlatformBillingActionState> {
  void _previous;
  void _formData;
  try {
    const actor = await requireResidencyActor();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    await switchResidencyCommittedPlanToAnnual(actor);
    revalidatePath("/residency/settings/billing");
    revalidatePath("/app/platform-billing");
    return { status: "success", message: "Annual billing is scheduled for your next renewal." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to switch to annual billing." };
  }
}

export async function startResidencyPlatformCheckoutAction(_previous: PlatformBillingActionState, _formData: FormData): Promise<PlatformBillingActionState> {
  void _previous;
  void _formData;
  let url: string;
  try {
    const actor = await requireResidencyActor();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    url = await createPlatformSubscriptionCheckout(actor, actor.residencyId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to start Platform Checkout." };
  }
  redirect(url);
}

export async function updateResidencyPlatformCardAction(_previous: PlatformBillingActionState, _formData: FormData): Promise<PlatformBillingActionState> {
  void _previous;
  void _formData;
  let url: string;
  try {
    const actor = await requireResidencyActor();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    url = await createPlatformPaymentMethodCheckout(actor, actor.residencyId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to update the Platform payment method." };
  }
  redirect(url);
}
