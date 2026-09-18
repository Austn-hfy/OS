import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getResidencyClientOverview, getResidencyPlatformBilling } from "@/data/residency-client";
import type { ResidencyActor } from "@/lib/auth";
import { requireResidencyActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import ResidencyOverviewPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
}));
vi.mock("@/data/residency-client", () => ({
  getResidencyClientOverview: vi.fn(),
  getResidencyPlatformBilling: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireResidencyActor: vi.fn() }));
vi.mock("@/lib/platform-billing-stage", () => ({ isCurrentPlatformBillingAvailable: vi.fn() }));

const manager: ResidencyActor = {
  kind: "residency",
  userId: "user-1",
  email: "manager@example.com",
  displayName: "Residency Manager",
  residencyId: "residency-1",
  residencyName: "Test Residency",
  residencyTimezone: "America/Los_Angeles",
  residencyTier: "operations_only",
  accessRole: "manager",
  isViewAs: false,
  isInternalTest: false,
  availableResidencies: [],
};

describe("Residency Overview availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireResidencyActor).mockResolvedValue(manager);
    vi.mocked(getResidencyClientOverview).mockResolvedValue({
      upcomingServiceCount: 3,
      nextServiceDate: "2026-09-21",
    });
    vi.mocked(isCurrentPlatformBillingAvailable).mockImplementation(() => {
      throw new Error("Platform billing is unavailable");
    });
    vi.mocked(getResidencyPlatformBilling).mockRejectedValue(new Error("Platform billing data is unavailable"));
  });

  it("renders for managers without consulting Platform billing availability or data", async () => {
    const html = renderToStaticMarkup(await ResidencyOverviewPage());

    expect(html).toContain("Welcome, Residency Manager");
    expect(html).toContain("3 upcoming services");
    expect(html).toContain("Next service Sep 21, 2026");
    expect(isCurrentPlatformBillingAvailable).not.toHaveBeenCalled();
    expect(getResidencyPlatformBilling).not.toHaveBeenCalled();
    expect(html).not.toContain("Platform subscription");
    expect(html).not.toContain("monthly equivalent");
    expect(html).not.toContain("Plan pending");
  });

  it("continues to redirect calendar viewers before Overview data loads", async () => {
    vi.mocked(requireResidencyActor).mockResolvedValue({ ...manager, accessRole: "calendar_viewer" });

    await expect(ResidencyOverviewPage()).rejects.toThrow("NEXT_REDIRECT:/residency/calendar");
    expect(getResidencyClientOverview).not.toHaveBeenCalled();
    expect(isCurrentPlatformBillingAvailable).not.toHaveBeenCalled();
    expect(getResidencyPlatformBilling).not.toHaveBeenCalled();
  });
});
