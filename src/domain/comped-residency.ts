import type { PlatformBillingCadence } from "./platform-billing";

export const COMPED_UNIT_AMOUNT_CENTS = 0;
export const COMPED_DEFAULT_STORED_UNIT_AMOUNT_CENTS = 6_000;

export function compedResidencyConfirmationPhrase(residencyName: string, comped: boolean) {
  return comped
    ? `SET ${residencyName} AS PERMANENTLY COMPED`
    : `REMOVE PERMANENT COMP FROM ${residencyName}`;
}

export function assertCompedResidencyConfirmation(input: {
  residencyName: string;
  comped: boolean;
  confirmation: string;
}) {
  const requiredPhrase = compedResidencyConfirmationPhrase(input.residencyName, input.comped);
  if (input.confirmation !== requiredPhrase) {
    throw new Error(`Type “${requiredPhrase}” exactly to ${input.comped ? "enable" : "remove"} permanent comp status.`);
  }
}

export function effectiveCompedPlan<T extends {
  cadence: PlatformBillingCadence;
  talentSessionUnitAmountCents: number;
  houseProgramUnitAmountCents: number;
}>(plan: T, comped: boolean): T {
  if (!comped) return plan;
  return {
    ...plan,
    talentSessionUnitAmountCents: COMPED_UNIT_AMOUNT_CENTS,
    houseProgramUnitAmountCents: COMPED_UNIT_AMOUNT_CENTS,
  };
}
