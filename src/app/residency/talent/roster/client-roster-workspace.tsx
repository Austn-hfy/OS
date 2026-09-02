"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { getResidencyClientSafeRoster } from "@/data/residency-client";

type Artist = Awaited<ReturnType<typeof getResidencyClientSafeRoster>>[number];

export function ClientRosterWorkspace({ artists }: { artists: Artist[] }) {
  const [query, setQuery] = useState("");
  const visibleArtists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return artists.filter((artist) => !normalized || [artist.stageName, artist.homeMarket, artist.instagramHandle, ...artist.genres].some((value) => value.toLowerCase().includes(normalized)));
  }, [artists, query]);

  return <section className="company-roster-card client-company-roster-card">
    <div className="company-roster-toolbar client-roster-toolbar">
      <div className="field"><label htmlFor="client-roster-search">Search roster</label><input id="client-roster-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, genre, market, or Instagram" /></div>
      <Link className="button secondary client-roster-add" href="/residency/talent">+ New Artist</Link>
    </div>
    <div className="company-roster-summary"><strong>{visibleArtists.length}</strong> artist{visibleArtists.length === 1 ? "" : "s"}</div>
    <div className="company-roster-list">{visibleArtists.map((artist) => <article key={artist.id}>
      <div><strong>{artist.stageName}</strong><span>{artist.genres.join(" · ") || "Genre not set"}</span></div>
      <div><span>{artist.homeMarket || "Market not set"}</span><span>{artist.instagramHandle || "Instagram not set"}</span></div>
      <div><small>{artist.ownership === "residency" ? "Residency-owned artist" : "HFY artist assigned to this Residency"}</small><div className="company-roster-chips"><span>{artist.ownership === "residency" ? "Available for direct scheduling" : "Available through HFY"}</span></div></div>
      <Link className="button secondary" href={`/residency/talent?artist=${artist.id}`}>{artist.ownership === "residency" ? "Manage" : "View"}</Link>
    </article>)}{!visibleArtists.length ? <div className="empty">{artists.length ? "No artists match this search." : "No artists are assigned to this Residency yet."}</div> : null}</div>
  </section>;
}
