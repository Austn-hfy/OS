import { describe, expect, it } from "vitest";
import { artistRosterCounts, filterAndSortArtistRoster, type ArtistRosterEntry } from "./artist-roster";

const artists: Array<ArtistRosterEntry & { id: string }> = [
  { id: "b", stageName: "Beta", fullName: "B", talentStatus: "active", archivedAt: null, totalOutstandingOwedCents: 40000, upcomingBookings: [{ serviceDate: "2026-09-10" }] },
  { id: "a", stageName: "Alpha", fullName: "A", talentStatus: "active", archivedAt: null, totalOutstandingOwedCents: 0, upcomingBookings: [{ serviceDate: "2026-09-02" }] },
  { id: "i", stageName: "Inactive", fullName: "I", talentStatus: "inactive", archivedAt: null, totalOutstandingOwedCents: 10000, upcomingBookings: [] },
  { id: "z", stageName: "Archived", fullName: "Z", talentStatus: "inactive", archivedAt: "2026-08-27T00:00:00Z", totalOutstandingOwedCents: 50000, upcomingBookings: [] },
];

describe("Artist roster views", () => {
  it("defaults can show active artists without inactive or archived records", () => {
    expect(filterAndSortArtistRoster(artists, "active", "", "name_asc").map((artist) => artist.id)).toEqual(["a", "b"]);
  });

  it("shows every non-archived artist who is owed", () => {
    expect(filterAndSortArtistRoster(artists, "owed", "", "owed_desc").map((artist) => artist.id)).toEqual(["b", "i"]);
  });

  it("keeps archived records isolated and searchable", () => {
    expect(filterAndSortArtistRoster(artists, "archived", "arch", "name_asc").map((artist) => artist.id)).toEqual(["z"]);
  });

  it("reports stable counts for each operational view", () => {
    expect(artistRosterCounts(artists)).toEqual({ active: 2, owed: 2, inactive: 1, archived: 1 });
  });
});
