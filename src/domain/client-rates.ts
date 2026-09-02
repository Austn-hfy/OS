export function resolveClientHourlyRateCents(
  defaultRateCents: number | null,
  overrideRateCents: number | null,
): number | null {
  return overrideRateCents ?? defaultRateCents;
}

export function calculateClientOwedCents(
  startsAt: Date,
  endsAt: Date,
  hourlyRateCents: number | null,
): number | null {
  if (hourlyRateCents === null) return null;
  return Math.round(((endsAt.getTime() - startsAt.getTime()) / 3_600_000) * hourlyRateCents);
}
