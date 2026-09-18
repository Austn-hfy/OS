import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getResidencyPaymentFailure } from "@/data/residency-client";
import type { ResidencyActor } from "@/lib/auth";
import { requireResidencyActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import ResidencyLayout from "./layout";

vi.mock("@/components/residency-shell", async () => {
  const { createElement } = await import("react");
  return {
    ResidencyShell: ({ children }: { children: React.ReactNode }) => createElement("div", { "data-residency-shell": true }, children),
  };
});
vi.mock("@/components/privacy-mode", async () => {
  const { createElement } = await import("react");
  return {
    PrivacyModeProvider: ({ children }: { children: React.ReactNode }) => createElement("div", { "data-privacy-provider": true }, children),
  };
});
vi.mock("@/data/residency-client", () => ({ getResidencyPaymentFailure: vi.fn() }));
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

describe("Residency failed-payment banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireResidencyActor).mockResolvedValue(manager);
    vi.mocked(isCurrentPlatformBillingAvailable).mockReturnValue(true);
  });

  it("still displays an actual payment failure", async () => {
    vi.mocked(getResidencyPaymentFailure).mockResolvedValue({
      failedAt: "2026-09-18T12:00:00.000Z",
      graceEndsAt: null,
      restrictedAt: null,
      message: "The payment method was declined.",
    });

    const html = renderToStaticMarkup(await ResidencyLayout({ children: "Overview content" }));

    expect(html).toContain("Platform subscription payment failed");
    expect(html).toContain("The payment method was declined.");
    expect(html).toContain('href="/residency/settings/billing"');
  });

  it("does not request payment-failure data when Platform billing is unavailable", async () => {
    vi.mocked(isCurrentPlatformBillingAvailable).mockReturnValue(false);

    const html = renderToStaticMarkup(await ResidencyLayout({ children: "Overview content" }));

    expect(getResidencyPaymentFailure).not.toHaveBeenCalled();
    expect(html).not.toContain("Platform subscription payment failed");
  });
});
