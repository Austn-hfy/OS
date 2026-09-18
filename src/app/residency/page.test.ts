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

function service(
  id: string,
  name: string,
  room: string,
  status: "scheduled" | "pending" | "open",
  talentNames: string[] = [],
): ResidencyClientOverview["week"][number]["services"][number] {
  return { id, calendarEventId: id, daypartId: `daypart-${id}`, name, room, timeLabel: "6:00 PM–9:00 PM", talentNames, status };
}

const populatedOverview: ResidencyClientOverview = {
  asOfDate: "2026-09-18",
  week: [
    { date: "2026-09-18", scheduledCount: 2, pendingCount: 0, openCount: 0, services: [
      service("shift-1", "Pool DJ", "Pool", "scheduled", ["Casey Rivera"]),
      service("occurrence-1", "Trivia", "Lounge", "scheduled", ["Maya James"]),
    ] },
    { date: "2026-09-19", scheduledCount: 1, pendingCount: 1, openCount: 0, services: [
      service("shift-2", "Dinner DJ", "Restaurant", "scheduled"),
      service("shift-3", "Late Night", "Lobby", "pending"),
    ] },
    { date: "2026-09-20", scheduledCount: 0, pendingCount: 0, openCount: 1, services: [
      service("projected-1", "Sunday Dinner", "Restaurant", "open"),
    ] },
    { date: "2026-09-21", scheduledCount: 0, pendingCount: 0, openCount: 1, services: [
      service("shift-4", "Lobby Set", "Lobby", "open"),
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
    const html = renderToStaticMarkup(await ResidencyOverviewPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Welcome, Residency Manager");
    expect(html).toContain("Friday, September 18");
    expect(html).toContain("This week");
    expect(html).toContain("Day focus");
    expect(html).toContain('class="residency-overview-day-detail is-ready"');
    expect(html).toContain("View or edit");
    expect(html).toContain("6:00 PM–9:00 PM · Pool");
    expect(html).toContain('href="/residency/calendar?calendarView=week&amp;week=2026-09-18&amp;event=shift-1&amp;returnTo=%2Fresidency%3Fday%3D2026-09-18"');
    expect(html).toContain("2 services need scheduling");
    expect(html).toContain("1 talent confirmation is pending");
    expect(html).toContain("2 talent invoices are overdue");
    expect(html).toContain("Casey Rivera");
    expect(html).not.toContain("Upcoming roster");
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

  it("selects a requested day and exposes the exact scheduling action", async () => {
    const html = renderToStaticMarkup(await ResidencyOverviewPage({ searchParams: Promise.resolve({ day: "2026-09-20" }) }));

    expect(html).toContain("Sunday, September 20");
    expect(html).toContain("Day focus · Sunday selected");
    expect(html).toContain('class="residency-overview-day-detail needs-attention"');
    expect(html).toContain('aria-label="Needs attention"');
    expect(html).toContain("Schedule talent");
    expect(html).toContain("Talent has not been assigned");
    expect(html).toContain('href="/residency/calendar?calendarView=week&amp;week=2026-09-20&amp;event=projected-1&amp;returnTo=%2Fresidency%3Fday%3D2026-09-20"');
    expect(html).toContain('href="/residency?day=2026-09-20"');
    expect(html).toContain('aria-current="date"');
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

    const html = renderToStaticMarkup(await ResidencyOverviewPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Your operational work is clear right now.");
    expect(html).toContain("All clear");
    expect(html).toContain("No open scheduling gaps, pending confirmations, or overdue talent invoices need attention.");
    expect(html).toContain("No programming scheduled");
    expect(html).toContain("Add activity");
    expect(html).toContain('href="/residency/calendar?calendarView=week&amp;week=2026-09-18&amp;date=2026-09-18&amp;returnTo=%2Fresidency%3Fday%3D2026-09-18"');
    expect(html).not.toContain("Upcoming roster");
    expect(html.match(/>No program</g)).toHaveLength(7);
    expect(isCurrentPlatformBillingAvailable).not.toHaveBeenCalled();
    expect(getResidencyPlatformBilling).not.toHaveBeenCalled();
  });

  it("continues to redirect calendar viewers to access-limited before Overview data loads", async () => {
    vi.mocked(requireResidencyActor).mockResolvedValue({ ...manager, accessRole: "calendar_viewer" });

    await expect(ResidencyOverviewPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/residency/access-limited");
    expect(getResidencyClientOverview).not.toHaveBeenCalled();
    expect(isCurrentPlatformBillingAvailable).not.toHaveBeenCalled();
    expect(getResidencyPlatformBilling).not.toHaveBeenCalled();
  });
});
