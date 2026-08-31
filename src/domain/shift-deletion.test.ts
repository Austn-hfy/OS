import { describe, expect, it } from "vitest";
import { shiftDeletionBlockReason } from "./shift-deletion";

describe("Shift deletion safeguards", () => {
  it("allows an operational Shift to be deleted without depending on its Daypart", () => {
    expect(shiftDeletionBlockReason(null, [{ bookingStatus: "confirmed", payoutStatus: "not_ready" }])).toBeNull();
    expect(shiftDeletionBlockReason("draft", [])).toBeNull();
  });

  it("preserves finalized Invoice and payout history", () => {
    expect(shiftDeletionBlockReason("approved", [])).toMatch(/finalized Invoice/);
    expect(shiftDeletionBlockReason(null, [{ bookingStatus: "completed", payoutStatus: "ready_to_pay" }])).toMatch(/completed or payable/);
    expect(shiftDeletionBlockReason(null, [{ bookingStatus: "confirmed", payoutStatus: "paid" }])).toMatch(/completed or payable/);
  });
});
