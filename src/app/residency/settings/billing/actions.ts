"use server";

import { redirect } from "next/navigation";
import { isLiveBillingNotApprovedError } from "@/domain/live-billing";
import { requireResidencyActor } from "@/lib/auth";
import { createPlatformPaymentMethodCheckout, createPlatformSubscriptionCheckout } from "@/services/platform-stripe";

export async function startResidencyPlatformCheckoutAction() {
  const actor = await requireResidencyActor();
  if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
  let url: string;
  try {
    url = await createPlatformSubscriptionCheckout(actor, actor.residencyId);
  } catch (error) {
    if (isLiveBillingNotApprovedError(error)) redirect("/residency/settings/billing?liveBilling=blocked");
    throw error;
  }
  redirect(url);
}

export async function updateResidencyPlatformCardAction() {
  const actor = await requireResidencyActor();
  if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
  let url: string;
  try {
    url = await createPlatformPaymentMethodCheckout(actor, actor.residencyId);
  } catch (error) {
    if (isLiveBillingNotApprovedError(error)) redirect("/residency/settings/billing?liveBilling=blocked");
    throw error;
  }
  redirect(url);
}
