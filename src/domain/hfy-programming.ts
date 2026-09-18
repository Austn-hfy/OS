import type { DaypartBillingMode } from "@/domain/dayparts";

export function isHfyManagedEconomicsMode(mode: string | null | undefined): mode is "hfy" | "hfy_request" {
  return mode === "hfy" || mode === "hfy_request";
}

export function isStandingHfyDaypart(daypart: { type: string; billingMode: DaypartBillingMode | null }): boolean {
  return daypart.type === "dj_artist" && daypart.billingMode === "billed_by_hfy";
}

export function isHfyManagedCalendarEvent(event: {
  recordType: "financial_shift" | "nonfinancial_occurrence" | "projected";
  daypartType: string;
  billingMode: DaypartBillingMode | null;
  economicsMode?: string | null;
}): boolean {
  if (event.daypartType !== "dj_artist") return false;
  if (event.recordType === "financial_shift") return isHfyManagedEconomicsMode(event.economicsMode);
  return event.billingMode === "billed_by_hfy";
}
