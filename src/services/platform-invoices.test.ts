import { describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { assertCurrentPlatformBillingStaging } from "@/lib/platform-billing-stage";
import { generatePlatformInvoicePdfSafely } from "./platform-invoices";

vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/platform-billing-stage", () => ({ assertCurrentPlatformBillingStaging: vi.fn() }));

describe("generatePlatformInvoicePdfSafely", () => {
  it("catches an unsupported-environment hold before touching invoice data", async () => {
    vi.mocked(assertCurrentPlatformBillingStaging).mockImplementation(() => {
      throw new Error("Platform billing can run only in production or the stable staging deployment.");
    });

    await expect(generatePlatformInvoicePdfSafely("00000000-0000-4000-8000-000000000001")).resolves.toEqual({
      status: "on_hold",
      error: "Platform billing can run only in production or the stable staging deployment.",
    });
    expect(getDb).not.toHaveBeenCalled();
  });
});
