import { describe, expect, it } from "vitest";
import { LIVE_BILLING_HOLD_MESSAGE, LiveBillingNotApprovedError, isLiveBillingNotApprovedError, liveBillingApprovalPhrase } from "@/domain/live-billing";

describe("live-billing safety switch", () => {
  it("uses a Residency-specific typed approval phrase", () => {
    expect(liveBillingApprovalPhrase("Ace Hotel Palm Springs")).toBe("APPROVE LIVE BILLING FOR Ace Hotel Palm Springs");
  });

  it("provides the exact public hold message", () => {
    const error = new LiveBillingNotApprovedError();
    expect(error.message).toBe(LIVE_BILLING_HOLD_MESSAGE);
    expect(error.message).toBe("Live billing is not yet approved for this Residency.");
    expect(isLiveBillingNotApprovedError(error)).toBe(true);
    expect(isLiveBillingNotApprovedError(new Error(error.message))).toBe(false);
  });
});
