export type PlatformPlanInputs = {
  talentProgramSessions: number;
  talentSessionUnitAmountCents: number;
  housePrograms: number;
  houseProgramUnitAmountCents: number;
  unitAmountCents?: number;
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
  if (input.unitAmountCents !== undefined) {
    if (!Number.isInteger(input.unitAmountCents) || input.unitAmountCents < 0) {
      throw new Error("Platform per-unit price must be a nonnegative whole number.");
    }
    return (input.talentProgramSessions + input.housePrograms) * input.unitAmountCents;
  }
  return (input.talentProgramSessions * input.talentSessionUnitAmountCents)
    + (input.housePrograms * input.houseProgramUnitAmountCents);
}

export type PlatformUsageCounts = {
  talentSessions: number;
  housePrograms: number;
  oneOffs: number;
};

export type PlatformCommitments = {
  talentProgramSessions: number;
  housePrograms: number;
  oneOffAllowance: number;
};

export type PlatformUsageMetricComparison = {
  committed: number;
  live: number;
  overBy: number;
  withinPlan: boolean;
};

export function comparePlatformUsage(plan: PlatformCommitments, usage: PlatformUsageCounts) {
  const metric = (committed: number, live: number): PlatformUsageMetricComparison => ({
    committed,
    live,
    overBy: Math.max(0, live - committed),
    withinPlan: live <= committed,
  });
  const comparison = {
    talentSessions: metric(plan.talentProgramSessions, usage.talentSessions),
    housePrograms: metric(plan.housePrograms, usage.housePrograms),
    oneOffs: metric(plan.oneOffAllowance, usage.oneOffs),
  };
  return {
    ...comparison,
    withinPlan: comparison.talentSessions.withinPlan && comparison.housePrograms.withinPlan && comparison.oneOffs.withinPlan,
    totalOverBy: comparison.talentSessions.overBy + comparison.housePrograms.overBy + comparison.oneOffs.overBy,
  };
}

export function platformCadenceInterval(cadence: PlatformBillingCadence): { interval: "month" | "year"; intervalCount: number } {
  if (cadence === "annual") return { interval: "year", intervalCount: 1 };
  return { interval: "month", intervalCount: cadence === "quarterly" ? 3 : 1 };
}

export function monthWindow(date = new Date()): { snapshotDate: string; periodStart: string; periodEnd: string } {
  const snapshotDate = date.toISOString().slice(0, 10);
  const [year, month] = snapshotDate.split("-").map(Number);
  const periodStart = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`;
  const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { snapshotDate, periodStart, periodEnd };
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
