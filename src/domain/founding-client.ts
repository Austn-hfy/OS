import type { PlatformBillingCadence } from "./platform-billing";

export const FOUNDING_CLIENT_CUTOFF = new Date("2027-08-01T00:00:00.000Z");
export const FOUNDING_CLIENT_UNIT_AMOUNT_CENTS = 6_000;

export type FoundingClientWindow = {
  foundingClientSignedAt: Date | null;
  foundingClientEndsAt: Date | null;
};

export type FoundingClientState = {
  enrolled: boolean;
  active: boolean;
  needsCommitmentTierSelection: boolean;
  signedAt: Date | null;
  endsAt: Date | null;
};

function assertValidDate(value: Date, label: string) {
  if (Number.isNaN(value.getTime())) throw new Error(`${label} must be a valid date.`);
}

export function foundingClientEndsAt(signedAt: Date): Date {
  assertValidDate(signedAt, "Founding Client signing date");
  const targetMonth = signedAt.getUTCMonth() + 6;
  const targetYear = signedAt.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const endsAt = new Date(signedAt);
  endsAt.setUTCFullYear(targetYear, normalizedMonth, Math.min(signedAt.getUTCDate(), lastDayOfTargetMonth));
  return endsAt;
}

export function assertFoundingClientEnrollmentEligible(now: Date): void {
  assertValidDate(now, "Founding Client enrollment time");
  if (now >= FOUNDING_CLIENT_CUTOFF) {
    throw new Error("Founding Client enrollment closed on August 1, 2027.");
  }
}

export function getFoundingClientState(window: FoundingClientWindow, now = new Date()): FoundingClientState {
  assertValidDate(now, "Current time");
  const { foundingClientSignedAt: signedAt, foundingClientEndsAt: endsAt } = window;
  if (!signedAt && !endsAt) {
    return { enrolled: false, active: false, needsCommitmentTierSelection: false, signedAt: null, endsAt: null };
  }
  if (!signedAt || !endsAt) throw new Error("Founding Client window is incomplete.");
  assertValidDate(signedAt, "Founding Client signing date");
  assertValidDate(endsAt, "Founding Client end date");
  if (endsAt <= signedAt) throw new Error("Founding Client end date must be after its signing date.");
  const active = now >= signedAt && now < endsAt;
  return {
    enrolled: true,
    active,
    needsCommitmentTierSelection: now >= endsAt,
    signedAt,
    endsAt,
  };
}

export function enforceFoundingClientPlan<T extends {
  cadence: PlatformBillingCadence;
  talentSessionUnitAmountCents: number;
  houseProgramUnitAmountCents: number;
}>(plan: T, window: FoundingClientWindow, now = new Date()): T {
  if (!getFoundingClientState(window, now).active) return plan;
  return {
    ...plan,
    cadence: "monthly",
    talentSessionUnitAmountCents: FOUNDING_CLIENT_UNIT_AMOUNT_CENTS,
    houseProgramUnitAmountCents: FOUNDING_CLIENT_UNIT_AMOUNT_CENTS,
  };
}
