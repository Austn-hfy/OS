import { describe, expect, it } from "vitest";
import type { AuditActor } from "@/lib/auth";
import { resolveShiftChangeRequest } from "./shift-change-requests";

const requestId = "00000000-0000-4000-8000-000000000043";

describe("Shift change request resolution authorization", () => {
  it("rejects a Residency-scoped actor with 403 before accessing request data", async () => {
    const actor: AuditActor = {
      kind: "residency",
      userId: "00000000-0000-4000-8000-000000000099",
      email: "manager@example.com",
      displayName: "Residency manager",
      residencyId: "00000000-0000-4000-8000-000000000001",
      residencyName: "Residency A",
      residencyTimezone: "America/Los_Angeles",
      residencyTier: "operations_only",
      accessRole: "manager",
      isViewAs: false,
      isInternalTest: false,
      availableResidencies: [],
    };

    await expect(resolveShiftChangeRequest(actor, {
      requestId,
      decision: "approved",
      resolutionNote: "",
    })).rejects.toMatchObject({ status: 403 });
  });

  it("requires a denial explanation before accessing request data", async () => {
    const actor: AuditActor = {
      kind: "internal",
      userId: "00000000-0000-4000-8000-000000000098",
      email: "owner@example.com",
      displayName: "Owner",
    };

    await expect(resolveShiftChangeRequest(actor, {
      requestId,
      decision: "denied",
      resolutionNote: "   ",
    })).rejects.toThrow("Add a resolution note explaining why this request is denied.");
  });
});
