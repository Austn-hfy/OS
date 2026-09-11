import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeveloperResidencyList, getPlatformRevenueDashboard } from "@/data/internal";
import { requireInternalActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import PlatformBillingPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("@/data/internal", () => ({
  getDeveloperResidencyList: vi.fn(),
  getPlatformRevenueDashboard: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireInternalActor: vi.fn() }));
vi.mock("@/lib/platform-billing-stage", () => ({ isCurrentPlatformBillingAvailable: vi.fn() }));

describe("Platform billing page production hold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCurrentPlatformBillingAvailable).mockReturnValue(false);
  });

  it("responds as not found before authentication or billing data loads", async () => {
    await expect(PlatformBillingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireInternalActor).not.toHaveBeenCalled();
    expect(getDeveloperResidencyList).not.toHaveBeenCalled();
    expect(getPlatformRevenueDashboard).not.toHaveBeenCalled();
  });
});
