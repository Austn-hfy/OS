import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicCalendarByToken } from "@/data/public-calendar";
import PublicCalendarPage from "./page";

vi.mock("@/data/public-calendar", () => ({ getPublicCalendarByToken: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }) }));

const mockedLoader = vi.mocked(getPublicCalendarByToken);

describe("public shared calendar page", () => {
  beforeEach(() => mockedLoader.mockReset());

  it("mirrors the internal month calendar, preserves Daypart colors, and adds a chronological safe agenda", async () => {
    mockedLoader.mockResolvedValue({ residencyName: "Test 1", entries: [
      {
        daypartName: "Sunset DJ Set",
        room: "Rooftop",
        color: "#2783DC",
        date: "2026-09-04",
        startTime: "5:00 PM",
        endTime: "10:00 PM",
        artists: [{ name: "DJ Grid", instagramHandle: "dj-grid" }],
      },
      {
        daypartName: "HFY Pool",
        room: "Pool",
        color: "#EC4899",
        date: "2026-09-01",
        startTime: "6:00 PM",
        endTime: "9:00 PM",
        artists: [{ name: "Echo Park", instagramHandle: "echo-park" }],
      },
      {
        daypartName: "October Lounge",
        room: "Lobby",
        color: "#EC4899",
        date: "2026-10-09",
        startTime: "6:00 PM",
        endTime: "9:00 PM",
        artists: [{ name: "Next Month", instagramHandle: "@next-month" }],
      },
    ] });

    const view = await PublicCalendarPage({
      params: Promise.resolve({ token: "share-token" }),
      searchParams: Promise.resolve({ month: "2026-09" }),
    });
    const html = renderToStaticMarkup(view);

    expect(html).toContain("September 2026");
    expect(html).toContain("Test 1");
    expect(html).not.toContain(">Calendar<");
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="September 2026 programming calendar"');
    expect(html).toContain("Sunset DJ Set");
    expect(html).toContain("DJ Grid");
    expect(html).toContain("--daypart-color:#2783DC");
    expect(html).toContain('aria-label="Open Sunset DJ Set on 2026-09-04"');
    expect(html).toContain("At a glance");
    expect(html).toContain("2 slots, in chronological order.");
    expect(html.indexOf("Tue, Sep 1")).toBeLessThan(html.indexOf("Fri, Sep 4"));
    expect(html).not.toContain("October Lounge");
    expect(html).not.toContain("@next-month");
    expect(html).not.toContain("Shared schedule");
    expect(html).not.toContain("public-calendar-modal");
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Create New Daypart");
    expect(html).not.toContain("Color key");
    expect(html).toContain("/share/calendar/share-token?month=2026-08");
    expect(html).toContain("/share/calendar/share-token?month=2026-10");
  });
});
