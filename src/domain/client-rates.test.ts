import { describe, expect, it } from "vitest";
import { calculateClientOwedCents, resolveClientHourlyRateCents } from "./client-rates";

describe("client-managed rates", () => {
  it("uses a per-date override before the snapshotted Daypart default", () => {
    expect(resolveClientHourlyRateCents(15_000, 18_500)).toBe(18_500);
    expect(resolveClientHourlyRateCents(15_000, null)).toBe(15_000);
    expect(resolveClientHourlyRateCents(null, null)).toBeNull();
  });

  it("calculates owed totals from the effective client-owned rate", () => {
    const startsAt = new Date("2026-09-05T18:00:00.000Z");
    const endsAt = new Date("2026-09-05T22:30:00.000Z");
    expect(calculateClientOwedCents(startsAt, endsAt, 12_000)).toBe(54_000);
    expect(calculateClientOwedCents(startsAt, endsAt, null)).toBeNull();
  });
});
