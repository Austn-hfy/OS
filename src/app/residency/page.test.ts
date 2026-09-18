import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getResidencyPlatformBilling } from "@/data/residency-client";
import { getResidencyClientOverview, type ResidencyClientOverview } from "@/data/residency-overview";
import type { ResidencyActor } from "@/lib/auth";
import { requireResidencyActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import ResidencyOverviewPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
}));
vi.mock("@/data/residency-client", () => ({ getResidencyPlatformBilling: vi.fn() }));
vi.mock("@/data/residency-overview", () => ({ getResidencyClientOverview: vi.fn() }));
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

const populatedOverview: ResidencyClientOverview = {
  asOfDate: "2026-09-18",
  week: [
    { date: "2026-09-18", scheduledCount: 2, pendingCount: 0, openCount: 0, services: [
      { id: "shift-1", name: "Pool DJ", room: "Pool", status: "scheduled" },
      { id: "occurrence-1", name: "Trivia", room: "Lounge", status: "scheduled" },
    ] },
    { date: "2026-09-19", scheduledCount: 1, pendingCount: 1, openCount: 0, services: [
      { id: "shift-2", name: "Dinner DJ", room: "Restaurant", status: "scheduled" },
      { id: "shift-3", name: "Late Night", room: "Lobby", status: "pending" },
    ] },
    { date: "2026-09-20", scheduledCount: 0, pendingCount: 0, openCount: 1, services: [
      { id: "projected-1", name: "Sunday Dinner", room: "Restaurant", status: "open" },
    ] },
    { date: "2026-09-21", scheduledCount: 0, pendingCount: 0, openCount: 1, services: [
      { id: "shift-4", name: "Lobby Set", room: "Lobby", status: "open" },
    ] },
    { date: "2026-09-22", scheduledCount: 0, pendingCount: 0, openCount: 0, services: [] },
    { date: "2026-09-23", scheduledCount: 0, pendingCount: 0, openCount: 0, services: [] },
    { date: "2026-09-24", scheduledCount: 0, pendingCount: 0, openCount: 0, services: [] },
  ],
  attention: {
    openServiceCount: 2,
    nextOpenService: { name: "Sunday Dinner", room: "Restaurant", serviceDate: "2026-09-20" },
    pendingConfirmationCount: 1,
    nextPendingConfirmation: { talentName: "Casey Rivera", activityName: "Late Night", serviceDate: "2026-09-19" },
    overdueInvoiceCount: 2,
    overdueInvoiceCents: 145_000,
  },
  finances: {
    currentMonthCommitmentsCents: 1_284_000,
    owedToResidencyTalentCents: 226_000,
    outstandingHfyInvoicesCents: 145_000,
    openInvoiceCount: 3,
    overdueInvoiceCount: 2,
  },
};

describe("Residency Overview availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireResidencyActor).mockResolvedValue(manager);
    vi.mocked(getResidencyClientOverview).mockResolvedValue(populatedOverview);
    vi.mocked(isCurrentPlatformBillingAvailable).mockImplementation(() => {
      throw new Error("Platform billing is unavailable");
    });
    vi.mocked(getResidencyPlatformBilling).mockRejectedValue(new Error("Platform billing data is unavailable"));
  });

  it("renders the real operational Overview for managers without consulting Platform billing", async () => {
    const html = renderToStaticMarkup(await ResidencyOverviewPage());

    expect(html).toContain("Welcome, Residency Manager");
    expect(html).toContain("Friday, September 18");
    expect(html).toContain("This week");
    expect(html).toContain("2 services need scheduling");
    expect(html).toContain("1 talent confirmation is pending");
    expect(html).toContain("2 talent invoices are overdue");
    expect(html).toContain("Casey Rivera");
    expect(html).not.toContain("Upcoming roster");
    expect(html).not.toContain("Maya James");
    expect(html).toContain("$12,840");
    expect(html).toContain("$2,260");
    expect(html).toContain("$1,450");
    expect(html).toContain('href="/residency/calendar"');
    expect(html).toContain('href="/residency/talent"');
    expect(html).toContain('href="/residency/finances"');
    expect(getResidencyClientOverview).toHaveBeenCalledWith("residency-1", "America/Los_Angeles");
    expect(isCurrentPlatformBillingAvailable).not.toHaveBeenCalled();
    expect(getResidencyPlatformBilling).not.toHaveBeenCalled();
    expect(html).not.toContain("Platform subscription");
    expect(html).not.toContain("monthly equivalent");
    expect(html).not.toContain("Plan pending");
  });

  it("renders calm empty and all-clear states when no operational exceptions exist", async () => {
    vi.mocked(getResidencyClientOverview).mockResolvedValue({
      ...populatedOverview,
      week: populatedOverview.week.map((day) => ({ ...day, scheduledCount: 0, pendingCount: 0, openCount: 0, services: [] })),
      attention: {
        openServiceCount: 0,
        nextOpenService: null,
        pendingConfirmationCount: 0,
        nextPendingConfirmation: null,
        overdueInvoiceCount: 0,
        overdueInvoiceCents: 0,
      },
      finances: {
        currentMonthCommitmentsCents: 0,
        owedToResidencyTalentCents: 0,
        outstandingHfyInvoicesCents: 0,
        openInvoiceCount: 0,
        overdueInvoiceCount: 0,
      },
    });

    const html = renderToStaticMarkup(await ResidencyOverviewPage());

    expect(html).toContain("Your operational work is clear right now.");
    expect(html).toContain("All clear");
    expect(html).toContain("No open scheduling gaps, pending confirmations, or overdue talent invoices need attention.");
    expect(html).not.toContain("Upcoming roster");
    expect(html.match(/>No program</g)).toHaveLength(7);
    expect(isCurrentPlatformBillingAvailable).not.toHaveBeenCalled();
    expect(getResidencyPlatformBilling).not.toHaveBeenCalled();
  });

  it("continues to redirect calendar viewers to access-limited before Overview data loads", async () => {
    vi.mocked(requireResidencyActor).mockResolvedValue({ ...manager, accessRole: "calendar_viewer" });

    await expect(ResidencyOverviewPage()).rejects.toThrow("NEXT_REDIRECT:/residency/access-limited");
    expect(getResidencyClientOverview).not.toHaveBeenCalled();
    expect(isCurrentPlatformBillingAvailable).not.toHaveBeenCalled();
    expect(getResidencyPlatformBilling).not.toHaveBeenCalled();
  });
});
