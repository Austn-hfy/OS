import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicCalendarByToken } from "@/data/public-calendar";
import PublicCalendarPage from "./page";

vi.mock("@/data/public-calendar", () => ({ getPublicCalendarByToken: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }) }));

const mockedLoader = vi.mocked(getPublicCalendarByToken);

describe("public shared calendar page", () => {
  beforeEach(() => mockedLoader.mockReset());

  it("lands on a month grid with navigation instead of a flat date list", async () => {
    mockedLoader.mockResolvedValue({ entries: [
      { instagramHandle: "dj-grid", date: "2026-09-04", startTime: "5:00 PM", endTime: "10:00 PM" },
      { instagramHandle: "@next-month", date: "2026-10-09", startTime: "6:00 PM", endTime: "9:00 PM" },
    ] });

    const view = await PublicCalendarPage({
      params: Promise.resolve({ token: "share-token" }),
      searchParams: Promise.resolve({ month: "2026-09" }),
    });
    const html = renderToStaticMarkup(view);

    expect(html).toContain("September 2026");
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="September 2026 programming calendar"');
    expect(html).toContain("@dj-grid");
    expect(html).not.toContain("@next-month");
    expect(html).not.toContain("public-calendar-list");
    expect(html).toContain("/share/calendar/share-token?month=2026-08");
    expect(html).toContain("/share/calendar/share-token?month=2026-10");
  });
});
