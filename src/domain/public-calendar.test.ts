import { describe, expect, it } from "vitest";
import { enforcePublicCalendarResponse, hashPublicCalendarToken, issuePublicCalendarToken, projectPublicCalendarRows, publicCalendarDaypartAllowed } from "./public-calendar";

describe("public calendar trust boundary", () => {
  it("issues a high-entropy bearer token and stores only its SHA-256 hash", () => {
    const first = issuePublicCalendarToken();
    const second = issuePublicCalendarToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPublicCalendarToken(first.token)).toBe(first.tokenHash);
    expect(second.tokenHash).not.toBe(first.tokenHash);
    expect(hashPublicCalendarToken(first.token)).not.toBe(second.tokenHash);
  });

  it("drops every non-allow-listed field even when the privileged query row expands", () => {
    const entries = projectPublicCalendarRows([
      {
        daypartName: "Sunset DJ Set",
        room: "Rooftop",
        color: "#2783DC",
        artistName: "DJ Safe",
        instagramHandle: "dj-safe",
        serviceDate: "2026-09-04",
        startsAt: new Date("2026-09-04T19:00:00Z"),
        endsAt: new Date("2026-09-04T22:00:00Z"),
        timezone: "America/Los_Angeles",
        fullName: "Private Person",
        email: "private@example.test",
        phone: "555-0100",
        talentRateCents: 9000,
        totalCompensationCents: 27000,
        internalNotes: "never public",
      },
      {
        daypartName: "Sunset DJ Set",
        room: "Rooftop",
        color: "#2783DC",
        artistName: "Second Artist",
        instagramHandle: "@second",
        serviceDate: "2026-09-04",
        startsAt: new Date("2026-09-04T19:00:00Z"),
        endsAt: new Date("2026-09-04T22:00:00Z"),
        timezone: "America/Los_Angeles",
      },
    ]);
    expect(entries).toEqual([{
      daypartName: "Sunset DJ Set",
      room: "Rooftop",
      color: "#2783DC",
      date: "2026-09-04",
      startTime: "12:00 PM",
      endTime: "3:00 PM",
      artists: [
        { name: "DJ Safe", instagramHandle: "dj-safe" },
        { name: "Second Artist", instagramHandle: "@second" },
      ],
    }]);
    expect(JSON.stringify(entries)).not.toMatch(/Private Person|private@example|555-0100|9000|27000|never public/);
  });

  it("fails closed when a public link is limited to selected Dayparts", () => {
    const allowed = new Set(["pool"]);
    expect(publicCalendarDaypartAllowed("all", allowed, "amigo")).toBe(true);
    expect(publicCalendarDaypartAllowed("selected", allowed, "pool")).toBe(true);
    expect(publicCalendarDaypartAllowed("selected", allowed, "amigo")).toBe(false);
    expect(publicCalendarDaypartAllowed("selected", allowed, null)).toBe(false);
    expect(publicCalendarDaypartAllowed("selected", new Set(), "pool")).toBe(false);
  });

  it("re-applies the same exact allow-list at the response boundary", () => {
    const response = enforcePublicCalendarResponse({
      residencyName: "Test 1",
      billingEmail: "billing@private.test",
      entries: [{
        daypartName: "Sunset DJ Set",
        room: "Rooftop",
        color: "#2783DC",
        date: "2026-09-04",
        startTime: "12:00 PM",
        endTime: "3:00 PM",
        artists: [{ name: "DJ Safe", instagramHandle: "@safe", email: "private@example.test" }],
        email: "private@example.test",
        rate: 500,
        notes: "private",
      }],
    });
    expect(response).toEqual({
      residencyName: "Test 1",
      entries: [{
        daypartName: "Sunset DJ Set",
        room: "Rooftop",
        color: "#2783DC",
        date: "2026-09-04",
        startTime: "12:00 PM",
        endTime: "3:00 PM",
        artists: [{ name: "DJ Safe", instagramHandle: "@safe" }],
      }],
    });
    expect(Object.keys(response)).toEqual(["residencyName", "entries"]);
    expect(Object.keys(response.entries[0])).toEqual(["daypartName", "room", "color", "date", "startTime", "endTime", "artists"]);
    expect(JSON.stringify(response)).not.toMatch(/billing@private|private@example|500|notes/);
  });
});
