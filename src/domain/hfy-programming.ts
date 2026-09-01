import type { DaypartBillingMode } from "@/domain/dayparts";

export function isHfyManagedEconomicsMode(mode: string | null | undefined): mode is "hfy" | "hfy_request" {
  return mode === "hfy" || mode === "hfy_request";
}

export function isStandingHfyDaypart(daypart: { type: string; billingMode: DaypartBillingMode | null }): boolean {
  return daypart.type === "dj_artist" && daypart.billingMode === "billed_by_hfy";
}
