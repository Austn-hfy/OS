import type { DaypartBillingMode, DaypartType } from "@/domain/dayparts";

export type DaypartRateAttentionAudience = "all" | "hfy" | "residency";

export type DaypartRateAttentionInput = {
  active: boolean;
  type: DaypartType | null;
  billingMode: DaypartBillingMode | null;
  defaultTalentRateCents: number | null;
  clientDefaultRateCents: number | null;
};

function hasPositiveRate(rateCents: number | null): boolean {
  return Number.isInteger(rateCents) && rateCents! > 0;
}

export function daypartNeedsDefaultArtistRate(
  daypart: DaypartRateAttentionInput,
  audience: DaypartRateAttentionAudience = "all",
): boolean {
  if (!daypart.active || daypart.type !== "dj_artist") return false;
  if (daypart.billingMode === "billed_by_hfy") {
    return audience !== "residency" && !hasPositiveRate(daypart.defaultTalentRateCents);
  }
  if (daypart.billingMode === "tracking_only") {
    return audience !== "hfy" && !hasPositiveRate(daypart.clientDefaultRateCents);
  }
  return false;
}
