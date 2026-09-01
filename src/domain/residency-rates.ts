export const MISSING_RESIDENCY_TALENT_RATE_MESSAGE = "Set a default hourly talent rate in Residency Setup before assigning an artist.";

export function assertResidencyTalentRateConfigured(defaultTalentRateCents: number): void {
  if (!Number.isInteger(defaultTalentRateCents) || defaultTalentRateCents <= 0) {
    throw new Error(MISSING_RESIDENCY_TALENT_RATE_MESSAGE);
  }
}
