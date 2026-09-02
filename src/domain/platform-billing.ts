export type PlatformPlanInputs = {
  talentProgramSessions: number;
  talentSessionUnitAmountCents: number;
  housePrograms: number;
  houseProgramUnitAmountCents: number;
};

export type PlatformBillingCadence = "monthly" | "quarterly" | "annual";

export function calculatePlatformMonthlyAmountCents(input: PlatformPlanInputs): number {
  const values = [
    input.talentProgramSessions,
    input.talentSessionUnitAmountCents,
    input.housePrograms,
    input.houseProgramUnitAmountCents,
  ];
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("Platform plan counts and unit prices must be nonnegative whole numbers.");
  }
  return (input.talentProgramSessions * input.talentSessionUnitAmountCents)
    + (input.housePrograms * input.houseProgramUnitAmountCents);
}

export function platformCadenceChargeCents(monthlyAmountCents: number, cadence: PlatformBillingCadence): number {
  if (!Number.isInteger(monthlyAmountCents) || monthlyAmountCents < 0) {
    throw new Error("Platform monthly amount must be a nonnegative whole number.");
  }
  return monthlyAmountCents * (cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12);
}

export function platformMonthlyEquivalentCents(chargeCents: number, cadence: PlatformBillingCadence): number {
  if (!Number.isInteger(chargeCents) || chargeCents < 0) {
    throw new Error("Platform charge must be a nonnegative whole number.");
  }
  return Math.round(chargeCents / (cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12));
}
