"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PlatformBillingActionState } from "@/components/platform-billing-action-form";
import { requireResidencyActor } from "@/lib/auth";
import { beginResidencyAnnualSwitch, createPlatformPaymentMethodCheckout, createPlatformSubscriptionCheckout, previewResidencyAnnualSwitch } from "@/services/platform-stripe";

export type AnnualSwitchPreviewState =
  | { status: "error"; message: string }
  | { status: "already_annual"; message: string }
  | {
    status: "success";
    amountDueCents: number;
    prorationDate: number | null;
    paymentPath: "charge_card_immediately" | "collect_card_and_start_annual" | "collect_card_then_charge_immediately";
  };

export async function previewResidencyPlatformPlanAnnualSwitchAction(): Promise<AnnualSwitchPreviewState> {
  try {
    const actor = await requireResidencyActor();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    const result = await previewResidencyAnnualSwitch(actor);
    if (result.kind === "already_annual") return { status: "already_annual", message: "Your plan is already annual." };
    return { status: "success", amountDueCents: result.amountDueCents, prorationDate: result.prorationDate, paymentPath: result.paymentPath };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to preview the exact Stripe charge." };
  }
}

export async function switchResidencyPlatformPlanToAnnualAction(_previous: PlatformBillingActionState, formData: FormData): Promise<PlatformBillingActionState> {
  void _previous;
  let checkoutUrl: string | null = null;
  try {
    const actor = await requireResidencyActor();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    if (formData.get("confirmation") !== "switch_to_annual") throw new Error("Review and confirm the annual plan before continuing.");
    const rawProrationDate = formData.get("prorationDate");
    const prorationDate = rawProrationDate ? Number(rawProrationDate) : null;
    const result = await beginResidencyAnnualSwitch(actor, prorationDate);
    if (result.kind === "checkout") checkoutUrl = result.url;
    revalidatePath("/residency/settings/billing");
    revalidatePath("/app/platform-billing");
    if (result.kind === "already_annual") return { status: "success", message: "Your plan is already annual." };
    if (result.kind === "activated") {
      const charged = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(result.amountChargedCents / 100);
      return { status: "success", message: `Annual billing is active. Stripe charged ${charged} today.` };
    }
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to switch to annual billing." };
  }
  redirect(checkoutUrl!);
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
