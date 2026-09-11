import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, residencies } from "@/db/schema";
import { LiveBillingNotApprovedError } from "@/domain/live-billing";
import type { AuditActor } from "@/lib/auth";

export type LiveBillingAction =
  | "platform_billing_email"
  | "stripe_checkout_session_create"
  | "stripe_invoice_item_create"
  | "stripe_subscription_create"
  | "stripe_subscription_update";

export async function getResidencyLiveBillingApproval(residencyId: string) {
  const [residency] = await getDb().select({
    id: residencies.id,
    name: residencies.name,
    liveBillingApproved: residencies.liveBillingApproved,
  }).from(residencies).where(eq(residencies.id, residencyId)).limit(1);
  if (!residency) throw new Error("Residency not found.");
  return residency;
}

export async function logLiveBillingBlock(input: {
  residencyId: string;
  action: LiveBillingAction;
  actor?: Pick<AuditActor, "userId" | "email">;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}) {
  await getDb().insert(auditLog).values({
    residencyId: input.residencyId,
    actorUserId: input.actor?.userId,
    actorLabel: input.actor?.email ?? "platform-billing-safety",
    action: "live_billing_action_blocked",
    entityType: input.entityType,
    entityId: input.entityId,
    details: {
      blockedAction: input.action,
      reason: "residency_live_billing_not_approved",
      ...input.details,
    },
  });
}

export async function requireResidencyLiveBillingApproval(input: {
  residencyId: string;
  action: Exclude<LiveBillingAction, "platform_billing_email">;
  actor?: Pick<AuditActor, "userId" | "email">;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}) {
  const residency = await getResidencyLiveBillingApproval(input.residencyId);
  if (residency.liveBillingApproved) return residency;
  await logLiveBillingBlock(input);
  throw new LiveBillingNotApprovedError();
}
