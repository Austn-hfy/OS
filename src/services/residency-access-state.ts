import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { platformSubscriptions } from "@/db/schema";

export type ResidencyAccessState = {
  operationalWritesAllowed: boolean;
  reason: "active" | "payment_grace" | "payment_restricted" | "paused" | "cancelled";
  graceEndsAt: string | null;
};

type AccessPlan = {
  status: typeof platformSubscriptions.$inferSelect.status;
  paymentFailedAt: Date | null;
  paymentGraceEndsAt: Date | null;
  pauseEffectiveAt: Date | null;
};

export function deriveResidencyAccessState(plan: AccessPlan | null, now = new Date()): ResidencyAccessState {
  if (!plan) return { operationalWritesAllowed: true, reason: "active", graceEndsAt: null };
  if (plan.status === "cancelled") return { operationalWritesAllowed: false, reason: "cancelled", graceEndsAt: null };
  if (plan.status === "paused" || (plan.pauseEffectiveAt && plan.pauseEffectiveAt <= now)) {
    return { operationalWritesAllowed: false, reason: "paused", graceEndsAt: null };
  }
  if (plan.paymentFailedAt && plan.paymentGraceEndsAt) {
    if (plan.paymentGraceEndsAt <= now) return { operationalWritesAllowed: false, reason: "payment_restricted", graceEndsAt: plan.paymentGraceEndsAt.toISOString() };
    return { operationalWritesAllowed: true, reason: "payment_grace", graceEndsAt: plan.paymentGraceEndsAt.toISOString() };
  }
  return { operationalWritesAllowed: true, reason: "active", graceEndsAt: null };
}

export async function getResidencyAccessState(residencyId: string, now = new Date()): Promise<ResidencyAccessState> {
  const [plan] = await getDb().select({
    status: platformSubscriptions.status,
    paymentFailedAt: platformSubscriptions.paymentFailedAt,
    paymentGraceEndsAt: platformSubscriptions.paymentGraceEndsAt,
    pauseEffectiveAt: platformSubscriptions.pauseEffectiveAt,
  }).from(platformSubscriptions).where(eq(platformSubscriptions.residencyId, residencyId)).limit(1);
  return deriveResidencyAccessState(plan ?? null, now);
}

export async function assertResidencyOperationalWriteAllowed(residencyId: string) {
  const state = await getResidencyAccessState(residencyId);
  if (state.operationalWritesAllowed) return state;
  if (state.reason === "payment_restricted") throw new Error("Operational changes are temporarily restricted because the 14-day payment grace period has ended. A manager can resolve the invoice in Billing.");
  if (state.reason === "paused") throw new Error("Operational changes are unavailable while this subscription is paused.");
  throw new Error("Operational changes are unavailable because this subscription has ended.");
}
