export const MISSING_RESIDENCY_TALENT_RATE_MESSAGE = "Set a default hourly talent rate in Residency Setup before assigning an artist.";
export const MISSING_RESIDENCY_CLIENT_RATE_MESSAGE = "Set a default hourly client rate in Residency Setup before fulfilling an HFY request.";

export function assertResidencyTalentRateConfigured(defaultTalentRateCents: number): void {
  if (!Number.isInteger(defaultTalentRateCents) || defaultTalentRateCents <= 0) {
    throw new Error(MISSING_RESIDENCY_TALENT_RATE_MESSAGE);
  }
}

export function assertResidencyClientRateConfigured(clientHourlyRateCents: number): void {
  if (!Number.isInteger(clientHourlyRateCents) || clientHourlyRateCents <= 0) {
    throw new Error(MISSING_RESIDENCY_CLIENT_RATE_MESSAGE);
  }
}
