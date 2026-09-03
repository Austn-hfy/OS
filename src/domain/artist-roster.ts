export type ArtistRosterView = "active" | "owed" | "inactive" | "archived";
export type ArtistRosterSort = "name_asc" | "name_desc" | "owed_desc" | "booking_asc";

export type ArtistRosterEntry = {
  stageName: string;
  fullName: string;
  talentStatus: "active" | "inactive";
  archivedAt: Date | string | null;
  totalOutstandingOwedCents: number;
  hasRateNeeded: boolean;
  upcomingBookings: Array<{ serviceDate: string }>;
};

export function artistRosterCounts<T extends ArtistRosterEntry>(artists: T[]) {
  return {
    active: artists.filter((artist) => !artist.archivedAt && artist.talentStatus === "active").length,
    owed: artists.filter((artist) => !artist.archivedAt && (artist.totalOutstandingOwedCents > 0 || artist.hasRateNeeded)).length,
    inactive: artists.filter((artist) => !artist.archivedAt && artist.talentStatus === "inactive").length,
    archived: artists.filter((artist) => Boolean(artist.archivedAt)).length,
  };
}

export function filterAndSortArtistRoster<T extends ArtistRosterEntry>(
  artists: T[],
  view: ArtistRosterView,
  query: string,
  sort: ArtistRosterSort,
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  const visible = artists.filter((artist) => {
    const matchesView = view === "archived"
      ? Boolean(artist.archivedAt)
      : !artist.archivedAt && (view === "owed"
        ? artist.totalOutstandingOwedCents > 0 || artist.hasRateNeeded
        : artist.talentStatus === view);
    if (!matchesView) return false;
    return !normalized
      || artist.stageName.toLocaleLowerCase().includes(normalized)
      || artist.fullName.toLocaleLowerCase().includes(normalized);
  });

  const nameOrder = (left: T, right: T) => left.stageName.localeCompare(right.stageName, "en", { numeric: true, sensitivity: "base" });
  return visible.toSorted((left, right) => {
    if (sort === "name_desc") return nameOrder(right, left);
    if (sort === "owed_desc") return right.totalOutstandingOwedCents - left.totalOutstandingOwedCents || nameOrder(left, right);
    if (sort === "booking_asc") {
      const leftDate = left.upcomingBookings[0]?.serviceDate ?? "9999-12-31";
      const rightDate = right.upcomingBookings[0]?.serviceDate ?? "9999-12-31";
      return leftDate.localeCompare(rightDate) || nameOrder(left, right);
    }
    return nameOrder(left, right);
  });
}
