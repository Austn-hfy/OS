import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicCalendarByToken } from "@/data/public-calendar";
import { GET } from "./route";

vi.mock("@/data/public-calendar", () => ({ getPublicCalendarByToken: vi.fn() }));

const mockedLoader = vi.mocked(getPublicCalendarByToken);

describe("GET /api/public/calendar/:token", () => {
  beforeEach(() => mockedLoader.mockReset());

  it("returns only the public field allow-list even if its loader returns expanded data", async () => {
    mockedLoader.mockResolvedValue({
      residencyName: "Test 1",
      billingEmail: "billing@private.test",
      entries: [{
        daypartName: "Sunset DJ Set",
        room: "Rooftop",
        color: "#2783DC",
        date: "2026-09-04",
        startTime: "12:00 PM",
        endTime: "3:00 PM",
        artists: [{
          name: "DJ Public",
          instagramHandle: "@public-handle",
          email: "artist@private.test",
          phone: "555-0199",
        }],
        fullName: "Private Name",
        talentRateCents: 8000,
        clientRateCents: 12500,
        internalNotes: "secret",
      }],
    } as never);

    const response = await GET(new Request("https://hfy.app/api/public/calendar/token"), { params: Promise.resolve({ token: "x".repeat(43) }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    const body = await response.json();
    expect(body).toEqual({
      residencyName: "Test 1",
      entries: [{
        daypartName: "Sunset DJ Set",
        room: "Rooftop",
        color: "#2783DC",
        date: "2026-09-04",
        startTime: "12:00 PM",
        endTime: "3:00 PM",
        artists: [{ name: "DJ Public", instagramHandle: "@public-handle" }],
      }],
    });
    expect(JSON.stringify(body)).not.toMatch(/billing@|Private Name|artist@private|555-0199|8000|12500|secret/);
  });

  it("returns a generic 404 without leaking token or Residency details", async () => {
    mockedLoader.mockResolvedValue(null);
    const response = await GET(new Request("https://hfy.app/api/public/calendar/bad"), { params: Promise.resolve({ token: "bad" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Calendar not found." });
  });
});
