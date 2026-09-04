"use server";

import { redirect } from "next/navigation";
import { requireResidencyActor } from "@/lib/auth";
import { createPlatformPaymentMethodCheckout, createPlatformSubscriptionCheckout } from "@/services/platform-stripe";

export async function startResidencyPlatformCheckoutAction() {
  const actor = await requireResidencyActor();
  if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
  const url = await createPlatformSubscriptionCheckout(actor, actor.residencyId);
  redirect(url);
}

export async function updateResidencyPlatformCardAction() {
  const actor = await requireResidencyActor();
  if (actor.accessRole !== "manager") throw new Error("Manager access is required.");
  const url = await createPlatformPaymentMethodCheckout(actor.residencyId);
  redirect(url);
}
