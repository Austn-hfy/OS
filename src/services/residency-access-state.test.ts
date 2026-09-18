import { describe, expect, it } from "vitest";
import { deriveResidencyAccessState } from "./residency-access-state";
import { readFile } from "node:fs/promises";

const failedAt = new Date("2026-09-01T12:00:00Z");
const graceEndsAt = new Date("2026-09-15T12:00:00Z");
const base = { status: "past_due" as const, paymentFailedAt: failedAt, paymentGraceEndsAt: graceEndsAt, pauseEffectiveAt: null };

describe("Residency subscription access state", () => {
  it("keeps full operational access through the complete 14-day payment grace period", () => {
    expect(graceEndsAt.getTime() - failedAt.getTime()).toBe(14 * 24 * 60 * 60 * 1_000);
    expect(deriveResidencyAccessState(base, new Date("2026-09-15T11:59:59Z"))).toEqual({
      operationalWritesAllowed: true,
      reason: "payment_grace",
      graceEndsAt: graceEndsAt.toISOString(),
    });
  });

  it("restricts operational writes at the exact deadline without deleting or hiding data", () => {
    expect(deriveResidencyAccessState(base, graceEndsAt)).toEqual({
      operationalWritesAllowed: false,
      reason: "payment_restricted",
      graceEndsAt: graceEndsAt.toISOString(),
    });
  });

  it("treats a paid-period pause and final cancellation as write-restricted states", () => {
    expect(deriveResidencyAccessState({ ...base, status: "active", paymentFailedAt: null, paymentGraceEndsAt: null, pauseEffectiveAt: new Date("2026-10-01T00:00:00Z") }, new Date("2026-10-01T00:00:00Z")).reason).toBe("paused");
    expect(deriveResidencyAccessState({ ...base, status: "cancelled", paymentFailedAt: null, paymentGraceEndsAt: null }, failedAt).reason).toBe("cancelled");
  });

  it("enforces the restriction at both client mutation entry points while leaving Account and Billing recovery available", async () => {
    const [auth, residencyActions, billingActions, accountActions] = await Promise.all([
      readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/residency/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/residency/settings/billing/actions.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/residency/settings/actions.ts", import.meta.url), "utf8"),
    ]);
    expect(auth).toContain("assertResidencyOperationalWriteAllowed(membership.residencyId)");
    expect(residencyActions.match(/assertResidencyOperationalWriteAllowed\(actor\.residencyId\)/g)).toHaveLength(6);
    expect(billingActions).toContain("payResidencyInvoiceNowAction");
    expect(accountActions).toContain("requestOwnEmailChangeAction");
  });
});
