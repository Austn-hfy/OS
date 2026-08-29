import { describe, expect, it } from "vitest";
import { clientVisibleAccessContacts, selectResidencyMembership, type ResidencyMembershipOption } from "./residency-membership";

const memberships: ResidencyMembershipOption[] = [
  { residencyId: "ace", residencyName: "Ace Hotel", residencyTimezone: "America/Los_Angeles", accessRole: "manager", contactId: null, invitationStatus: null },
  { residencyId: "hotel-v", residencyName: "Hotel V", residencyTimezone: "America/Los_Angeles", accessRole: "manager", contactId: null, invitationStatus: null },
];

describe("Residency membership selection", () => {
  it("keeps normal customer accounts on their first permitted Residency", () => {
    expect(selectResidencyMembership(memberships, "hotel-v", false)?.residencyId).toBe("ace");
  });

  it("allows a flagged test account to select one of its own memberships", () => {
    expect(selectResidencyMembership(memberships, "hotel-v", true)?.residencyId).toBe("hotel-v");
  });

  it("rejects a stale or forged selection by falling back to an authorized membership", () => {
    expect(selectResidencyMembership(memberships, "foreign", true)?.residencyId).toBe("ace");
  });

  it("removes internal test accounts from client-facing access lists", () => {
    expect(clientVisibleAccessContacts([
      { name: "Michael", isInternalTest: false },
      { name: "HFY Internal Test", isInternalTest: true },
    ])).toEqual([{ name: "Michael", isInternalTest: false }]);
  });
});
