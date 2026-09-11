import { getFoundingClientState, type FoundingClientWindow } from "./founding-client";

export const MONTH_TO_MONTH_TALENT_RATE_CENTS = 9_000;
export const COMMITMENT_HOUSE_RATE_CENTS = 6_000;

export const COMMITMENT_TIERS = {
  month_to_month: { label: "Month-to-month", talentRateCents: 9_000, lengthMonths: 1, forgivenessAfterMonths: null },
  three_month: { label: "3-month", talentRateCents: 8_000, lengthMonths: 3, forgivenessAfterMonths: null },
  six_month: { label: "6-month", talentRateCents: 7_000, lengthMonths: 6, forgivenessAfterMonths: 4 },
  twelve_month: { label: "12-month", talentRateCents: 6_000, lengthMonths: 12, forgivenessAfterMonths: 9 },
} as const;

export type CommitmentTier = keyof typeof COMMITMENT_TIERS;

export type CommitmentTierWindow = {
  commitmentTier: CommitmentTier | null;
  commitmentStartedAt: Date | null;
  commitmentLengthMonths: number | null;
};

export type CommitmentClawback = {
  amountCents: number;
  talentSessionsBilled: number;
  unitAmountCents: number;
  applies: boolean;
  reason: "not_committed" | "unchanged" | "term_complete" | "forgiven" | "applies";
};

function assertValidDate(value: Date, label: string) {
  if (Number.isNaN(value.getTime())) throw new Error(label + " must be a valid date.");
}

function addCalendarMonths(value: Date, months: number) {
  assertValidDate(value, "Commitment start date");
  const targetMonth = value.getUTCMonth() + months;
  const targetYear = value.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const result = new Date(value);
  result.setUTCFullYear(targetYear, normalizedMonth, Math.min(value.getUTCDate(), lastDayOfTargetMonth));
  return result;
}

export function commitmentTierTerms(tier: CommitmentTier) {
  return COMMITMENT_TIERS[tier];
}

export function commitmentTermEndsAt(startedAt: Date, tier: CommitmentTier) {
  return addCalendarMonths(startedAt, commitmentTierTerms(tier).lengthMonths);
}

export function commitmentForgivenessStartsAt(startedAt: Date, tier: CommitmentTier) {
  const months = commitmentTierTerms(tier).forgivenessAfterMonths;
  return months === null ? null : addCalendarMonths(startedAt, months);
}

export function assertCommitmentTierSelectionAllowed(window: FoundingClientWindow, now = new Date()) {
  const foundingState = getFoundingClientState(window, now);
  if (foundingState.active) {
    throw new Error("A Residency inside its Founding Client window cannot select a commitment tier.");
  }
  if (!foundingState.needsCommitmentTierSelection) {
    throw new Error("Commitment tiers are only available after this Residency's Founding Client window ends.");
  }
}

export function applyCommitmentTier<T extends {
  cadence: "monthly" | "quarterly" | "annual";
  talentSessionUnitAmountCents: number;
  houseProgramUnitAmountCents: number;
}>(plan: T, tier: CommitmentTier): T {
  const terms = commitmentTierTerms(tier);
  return {
    ...plan,
    cadence: "monthly",
    talentSessionUnitAmountCents: terms.talentRateCents,
    houseProgramUnitAmountCents: COMMITMENT_HOUSE_RATE_CENTS,
  };
}

export function calculateCommitmentClawback(input: {
  currentTier: CommitmentTier;
  nextTier: CommitmentTier | null;
  commitmentStartedAt: Date;
  changedAt: Date;
  talentSessionsBilled: number;
}): CommitmentClawback {
  assertValidDate(input.commitmentStartedAt, "Commitment start date");
  assertValidDate(input.changedAt, "Commitment change date");
  if (!Number.isInteger(input.talentSessionsBilled) || input.talentSessionsBilled < 0) {
    throw new Error("Billed Talent sessions must be a nonnegative whole number.");
  }
  const terms = commitmentTierTerms(input.currentTier);
  const unitAmountCents = MONTH_TO_MONTH_TALENT_RATE_CENTS - terms.talentRateCents;
  const empty = (reason: CommitmentClawback["reason"]): CommitmentClawback => ({
    amountCents: 0,
    talentSessionsBilled: input.talentSessionsBilled,
    unitAmountCents: Math.max(0, unitAmountCents),
    applies: false,
    reason,
  });

  if (input.currentTier === "month_to_month") return empty("not_committed");
  if (input.nextTier === input.currentTier) return empty("unchanged");
  if (input.changedAt >= commitmentTermEndsAt(input.commitmentStartedAt, input.currentTier)) return empty("term_complete");
  const forgivenessStartsAt = commitmentForgivenessStartsAt(input.commitmentStartedAt, input.currentTier);
  if (forgivenessStartsAt && input.changedAt >= forgivenessStartsAt) return empty("forgiven");
  return {
    amountCents: unitAmountCents * input.talentSessionsBilled,
    talentSessionsBilled: input.talentSessionsBilled,
    unitAmountCents,
    applies: true,
    reason: "applies",
  };
}

export function getCommitmentTierState(window: CommitmentTierWindow, now = new Date()) {
  assertValidDate(now, "Current time");
  if (!window.commitmentTier && !window.commitmentStartedAt && window.commitmentLengthMonths === null) return null;
  if (!window.commitmentTier || !window.commitmentStartedAt || window.commitmentLengthMonths === null) {
    throw new Error("Commitment tier window is incomplete.");
  }
  const terms = commitmentTierTerms(window.commitmentTier);
  if (window.commitmentLengthMonths !== terms.lengthMonths) throw new Error("Commitment tier length does not match its tier.");
  const termEndsAt = commitmentTermEndsAt(window.commitmentStartedAt, window.commitmentTier);
  const forgivenessStartsAt = commitmentForgivenessStartsAt(window.commitmentStartedAt, window.commitmentTier);
  return {
    tier: window.commitmentTier,
    ...terms,
    startedAt: window.commitmentStartedAt,
    termEndsAt,
    forgivenessStartsAt,
    termComplete: now >= termEndsAt,
    pastForgivenessWindow: forgivenessStartsAt !== null && now >= forgivenessStartsAt,
  };
}
