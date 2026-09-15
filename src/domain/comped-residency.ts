export function compedResidencyConfirmationPhrase(residencyName: string, comped: boolean) {
  return comped ? `SET ${residencyName} AS PERMANENTLY COMPED` : `REMOVE PERMANENT COMP FROM ${residencyName}`;
}

export function assertCompedResidencyConfirmation(input: { residencyName: string; comped: boolean; confirmation: string }) {
  const requiredPhrase = compedResidencyConfirmationPhrase(input.residencyName, input.comped);
  if (input.confirmation !== requiredPhrase) {
    throw new Error(`Type “${requiredPhrase}” exactly to ${input.comped ? "enable" : "remove"} permanent comp status.`);
  }
}

export function effectiveCompedPlan<T extends { slotUnitAmountCents: number }>(plan: T, comped: boolean): T {
  return comped ? { ...plan, slotUnitAmountCents: 0 } : plan;
}
