import { describe, expect, it } from "vitest";
import { enforcePublicCalendarResponse, hashPublicCalendarToken, issuePublicCalendarToken, projectPublicCalendarRows } from "./public-calendar";

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
    const entries = projectPublicCalendarRows([{
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
    }]);
    expect(entries).toEqual([{
      instagramHandle: "dj-safe",
      date: "2026-09-04",
      startTime: "12:00 PM",
      endTime: "3:00 PM",
    }]);
    expect(JSON.stringify(entries)).not.toMatch(/Private Person|private@example|555-0100|9000|27000|never public/);
  });

  it("re-applies the same exact allow-list at the response boundary", () => {
    const response = enforcePublicCalendarResponse({
      residencyName: "Private Hotel",
      entries: [{
        instagramHandle: "@safe",
        date: "2026-09-04",
        startTime: "12:00 PM",
        endTime: "3:00 PM",
        email: "private@example.test",
        rate: 500,
        notes: "private",
      }],
    });
    expect(response).toEqual({ entries: [{ instagramHandle: "@safe", date: "2026-09-04", startTime: "12:00 PM", endTime: "3:00 PM" }] });
    expect(Object.keys(response)).toEqual(["entries"]);
    expect(Object.keys(response.entries[0])).toEqual(["instagramHandle", "date", "startTime", "endTime"]);
  });
});
