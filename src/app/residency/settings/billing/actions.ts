"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PlatformBillingActionState } from "@/components/platform-billing-action-form";
import { requireResidencyActorForMutation } from "@/lib/auth";
import { beginResidencyAnnualSwitch, createPlatformPaymentMethodCheckout, createPlatformSubscriptionCheckout, previewResidencyAnnualSwitch } from "@/services/platform-stripe";
import { payResidencyInvoiceNow, previewResidencyCancellation, previewResidencyPause, previewResidencyPlanDowngrade, scheduleResidencyCancellation, scheduleResidencyPause, scheduleResidencyPlanDowngrade } from "@/services/residency-billing-management";

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
    const actor = await requireResidencyActorForMutation();
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
    const actor = await requireResidencyActorForMutation();
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
    const actor = await requireResidencyActorForMutation();
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
    const actor = await requireResidencyActorForMutation();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    url = await createPlatformPaymentMethodCheckout(actor, actor.residencyId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to update the Platform payment method." };
  }
  redirect(url);
}

const planSelectionSchema = z.object({
  talentBucketSize: z.coerce.number().int(),
  houseBucketSize: z.coerce.number().int(),
  term: z.enum(["month_to_month", "annual"]),
});

export type SelfServicePreviewState =
  | { status: "error"; message: string }
  | { status: "success"; kind: "downgrade"; preview: Awaited<ReturnType<typeof previewResidencyPlanDowngrade>> }
  | { status: "success"; kind: "cancel"; preview: Awaited<ReturnType<typeof previewResidencyCancellation>> }
  | { status: "success"; kind: "pause"; preview: Awaited<ReturnType<typeof previewResidencyPause>> };

export async function previewResidencyPlanChangeAction(input: { kind: "downgrade" | "cancel" | "pause"; talentBucketSize?: number; houseBucketSize?: number; term?: "month_to_month" | "annual"; periods?: 1 | 2 | 3 }): Promise<SelfServicePreviewState> {
  try {
    const actor = await requireResidencyActorForMutation();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    if (input.kind === "downgrade") {
      const selection = planSelectionSchema.parse(input);
      return { status: "success", kind: "downgrade", preview: await previewResidencyPlanDowngrade(actor, selection) };
    }
    if (input.kind === "pause") {
      const periods = z.union([z.literal(1), z.literal(2), z.literal(3)]).parse(input.periods);
      return { status: "success", kind: "pause", preview: await previewResidencyPause(actor, periods) };
    }
    return { status: "success", kind: "cancel", preview: await previewResidencyCancellation(actor) };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to preview this billing change." };
  }
}

export async function confirmResidencyPlanChangeAction(_previous: PlatformBillingActionState, formData: FormData): Promise<PlatformBillingActionState> {
  try {
    const actor = await requireResidencyActorForMutation();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    if (formData.get("confirmation") !== "confirm") throw new Error("Review and confirm this billing change before continuing.");
    const kind = z.enum(["downgrade", "cancel", "pause"]).parse(formData.get("kind"));
    if (kind === "downgrade") {
      const selection = planSelectionSchema.parse(Object.fromEntries(formData));
      const result = await scheduleResidencyPlanDowngrade(actor, selection);
      revalidatePath("/residency/settings/billing");
      return { status: "success", message: `Your new plan is scheduled for ${new Date(result.effectiveAt).toLocaleDateString("en-US", { timeZone: "UTC" })}.` };
    }
    if (kind === "pause") {
      const periods = z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3)])).parse(formData.get("periods"));
      const result = await scheduleResidencyPause(actor, periods);
      revalidatePath("/residency/settings/billing");
      return { status: "success", message: `Your pause is scheduled. Billing resumes ${new Date(result.resumesAt).toLocaleDateString("en-US", { timeZone: "UTC" })}.` };
    }
    const result = await scheduleResidencyCancellation(actor);
    revalidatePath("/residency/settings/billing");
    return { status: "success", message: `Cancellation is scheduled for ${new Date(result.effectiveAt).toLocaleDateString("en-US", { timeZone: "UTC" })}. Enrolled users remain; pending invitations revoke then.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to schedule this billing change." };
  }
}

export async function payResidencyInvoiceNowAction(_previous: PlatformBillingActionState, formData: FormData): Promise<PlatformBillingActionState> {
  try {
    const actor = await requireResidencyActorForMutation();
    if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
    const invoiceId = z.string().uuid().parse(formData.get("invoiceId"));
    const result = await payResidencyInvoiceNow(actor, invoiceId);
    revalidatePath("/residency/settings/billing");
    return { status: result.paid ? "success" : "error", message: result.paid ? "Payment succeeded. The invoice and account access are updating now." : "Stripe did not mark this invoice paid. Review the payment method and try again." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to pay this invoice." };
  }
}
