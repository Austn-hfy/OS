import { beforeEach, describe, expect, it, vi } from "vitest";
import { getResidencyPlatformBilling } from "@/data/residency-client";
import { requireResidencyActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import ResidencyPlatformBillingPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn(),
}));
vi.mock("@/data/residency-client", () => ({ getResidencyPlatformBilling: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireResidencyActor: vi.fn() }));
vi.mock("@/lib/platform-billing-stage", () => ({ isCurrentPlatformBillingAvailable: vi.fn() }));

describe("Residency billing page production hold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCurrentPlatformBillingAvailable).mockReturnValue(false);
  });

  it("responds as not found before authentication or billing data loads", async () => {
    await expect(ResidencyPlatformBillingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireResidencyActor).not.toHaveBeenCalled();
    expect(getResidencyPlatformBilling).not.toHaveBeenCalled();
  });
});
