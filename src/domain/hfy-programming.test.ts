import { describe, expect, it } from "vitest";
import { isHfyManagedCalendarEvent, isHfyManagedEconomicsMode, isStandingHfyDaypart } from "@/domain/hfy-programming";

describe("HFY Programming ownership scope", () => {
  it("includes only HFY financial shifts", () => {
    expect(isHfyManagedEconomicsMode("hfy")).toBe(true);
    expect(isHfyManagedEconomicsMode("hfy_request")).toBe(true);
    expect(isHfyManagedEconomicsMode("client_owned")).toBe(false);
    expect(isHfyManagedEconomicsMode(undefined)).toBe(false);
  });

  it("projects only standing HFY DJ Dayparts", () => {
    expect(isStandingHfyDaypart({ type: "dj_artist", billingMode: "billed_by_hfy" })).toBe(true);
    expect(isStandingHfyDaypart({ type: "dj_artist", billingMode: "tracking_only" })).toBe(false);
    expect(isStandingHfyDaypart({ type: "house_activity", billingMode: null })).toBe(false);
  });

  it("uses the concrete calendar record instead of the account tier to determine staffing ownership", () => {
    expect(isHfyManagedCalendarEvent({ recordType: "financial_shift", daypartType: "dj_artist", billingMode: "billed_by_hfy", economicsMode: "hfy" })).toBe(true);
    expect(isHfyManagedCalendarEvent({ recordType: "financial_shift", daypartType: "dj_artist", billingMode: "billed_by_hfy", economicsMode: "client_owned" })).toBe(false);
    expect(isHfyManagedCalendarEvent({ recordType: "projected", daypartType: "dj_artist", billingMode: "billed_by_hfy" })).toBe(true);
    expect(isHfyManagedCalendarEvent({ recordType: "nonfinancial_occurrence", daypartType: "dj_artist", billingMode: "billed_by_hfy" })).toBe(true);
    expect(isHfyManagedCalendarEvent({ recordType: "nonfinancial_occurrence", daypartType: "dj_artist", billingMode: "tracking_only" })).toBe(false);
  });
});
