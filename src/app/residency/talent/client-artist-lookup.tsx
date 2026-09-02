"use client";

import { useEffect, useMemo, useState } from "react";
import { ArtistBookingCalendar } from "@/components/artist-booking-calendar";
import { TalentWorkspaceShell } from "@/components/talent-workspace-shell";
import type { getResidencyClientTalentWorkspace } from "@/data/residency-client";
import { AddClientArtistForm } from "./add-client-artist-form";
import { ArchivedClientOwnedArtistCard, ClientOwnedArtistCard } from "./client-owned-artist-card";

type Artist = Awaited<ReturnType<typeof getResidencyClientTalentWorkspace>>[number];
type TalentView = "active" | "owed" | "archived";
type TalentSort = "name_asc" | "name_desc" | "owed_desc" | "booking_asc";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function serviceDateLabel(serviceDate: string) {
  return new Date(`${serviceDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function timeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function ClientArtistLookup({ artists, residencyName, timeZone, canManage, initialArtistId }: { artists: Artist[]; residencyName: string; timeZone: string; canManage: boolean; initialArtistId?: string }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TalentView>("active");
  const [sort, setSort] = useState<TalentSort>("name_asc");
  const [selectedId, setSelectedId] = useState(initialArtistId && artists.some((artist) => artist.id === initialArtistId) ? initialArtistId : null);
  const [creating, setCreating] = useState(false);
  const selected = artists.find((artist) => artist.id === selectedId) ?? null;
  const counts = useMemo(() => ({
    active: artists.filter((artist) => !artist.archivedAt).length,
    owed: artists.filter((artist) => !artist.archivedAt && artist.outstandingOwedCents > 0).length,
    archived: artists.filter((artist) => Boolean(artist.archivedAt)).length,
  }), [artists]);
  const filteredArtists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matchesView = artists.filter((artist) => view === "archived" ? Boolean(artist.archivedAt) : !artist.archivedAt && (view !== "owed" || artist.outstandingOwedCents > 0));
    return matchesView.filter((artist) => !normalized || [artist.stageName, artist.homeMarket, artist.instagramHandle, ...artist.genres].some((value) => value.toLowerCase().includes(normalized))).sort((left, right) => {
      if (sort === "owed_desc") return right.outstandingOwedCents - left.outstandingOwedCents || left.stageName.localeCompare(right.stageName);
      if (sort === "booking_asc") return (left.upcomingBookings[0]?.serviceDate ?? "9999-12-31").localeCompare(right.upcomingBookings[0]?.serviceDate ?? "9999-12-31") || left.stageName.localeCompare(right.stageName);
      const direction = sort === "name_desc" ? -1 : 1;
      return left.stageName.localeCompare(right.stageName) * direction;
    });
  }, [artists, query, sort, view]);

  useEffect(() => {
    if (!creating) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCreating(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [creating]);

  const tabs: Array<{ id: TalentView; label: string }> = [
    { id: "active", label: "Active" },
    { id: "owed", label: "Owed" },
    { id: "archived", label: "Archived" },
  ];

  return <TalentWorkspaceShell
    sidebar={<>
      <div className="artist-roster-toolbar">
        <div className="artist-roster-toolbar-heading"><div><p className="eyebrow">Residency roster</p><strong>Find an artist</strong></div>{canManage ? <button className="button secondary" type="button" onClick={() => setCreating(true)}>+ New Artist</button> : null}</div>
        <div className="artist-search-field"><label htmlFor="client-artist-lookup-search">Search artists</label><div><span aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg></span><input id="client-artist-lookup-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by artist name" /></div></div>
        <div className="artist-roster-tabs" role="tablist" aria-label="Artist status"><div>{tabs.map((tab) => <button className={view === tab.id ? "active" : ""} type="button" role="tab" aria-selected={view === tab.id} onClick={() => { setView(tab.id); setSort(tab.id === "owed" ? "owed_desc" : "name_asc"); setSelectedId(null); }} key={tab.id}><span>{tab.label}</span><strong>{counts[tab.id]}</strong></button>)}</div></div>
        <div className="artist-roster-sort"><span><strong>{filteredArtists.length}</strong> {filteredArtists.length === 1 ? "artist" : "artists"}</span><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as TalentSort)}><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="owed_desc">Amount owed</option><option value="booking_asc">Next booking</option></select></label></div>
      </div>
      <div className="artist-roster-list client-artist-roster-list">{filteredArtists.map((artist) => <div className={`artist-roster-row-wrap ${selectedId === artist.id ? "selected" : ""}`} key={artist.id}>
        <button className="artist-roster-row" type="button" onClick={() => setSelectedId(artist.id)}>
          <span className="artist-roster-row-heading"><strong>{artist.stageName}</strong>{artist.outstandingOwedCents > 0 ? <small className="artist-owed-chip">Owed {money(artist.outstandingOwedCents)}</small> : null}</span>
          <span className="artist-roster-meta">{artist.ownership === "residency" ? "Residency artist" : "HFY roster artist"}{artist.homeMarket ? ` · ${artist.homeMarket}` : ""}</span>
        </button>
      </div>)}{!filteredArtists.length ? <div className="empty artist-list-empty"><p>{!artists.length ? "No artists have been added to this Residency yet." : query ? `No artists match “${query}”.` : `No ${view} artists to show.`}</p></div> : null}</div>
    </>}
    detail={!selected ? <div className="artist-detail-empty"><span>HFY</span><h2>{artists.length ? "Select an artist" : "Build your roster"}</h2><p>{artists.length ? "Choose someone from the roster to see this Residency’s bookings, amount owed, and client-safe artist details." : "Use New Artist to add the first person to Artist Lookup."}</p></div> : <>
      {selected.ownership === "residency" ? selected.archivedAt ? <ArchivedClientOwnedArtistCard artist={selected} canManage={canManage} residencyName={residencyName} /> : <ClientOwnedArtistCard artist={selected} canManage={canManage} residencyName={residencyName} /> : <header className="artist-detail-header"><div><p className="eyebrow">HFY roster artist</p><h2>{selected.stageName}</h2><p>Explicitly assigned to {residencyName}</p></div><span className="status active">Active</span></header>}
      {!selected.archivedAt ? <>
        <section className="artist-owed-total"><span>{residencyName} outstanding owed</span><strong>{money(selected.outstandingOwedCents)}</strong><small>{selected.ownership === "residency" ? `${selected.outstandingAssignments.length} client-managed Assignment${selected.outstandingAssignments.length === 1 ? "" : "s"}` : "HFY-managed artist costs stay outside this Residency ledger"}</small></section>
        <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Owed from</p><h3>Client-managed Assignments</h3></div><strong>{money(selected.outstandingOwedCents)}</strong></div>{selected.outstandingAssignments.length ? <div className="artist-owed-list">{selected.outstandingAssignments.map((assignment) => <article key={assignment.id}><div><strong>{assignment.shiftName}</strong><span>{serviceDateLabel(assignment.serviceDate)}</span></div><strong>{assignment.amountCents === null ? "Rate needed" : money(assignment.amountCents)}</strong></article>)}</div> : <p className="artist-section-empty">Nothing is currently owed to this artist by {residencyName}.</p>}</section>
        <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Upcoming bookings</p><h3>{selected.upcomingBookings.length} scheduled</h3></div></div><div className="artist-booking-layout"><div className="artist-booking-list">{selected.upcomingBookings.map((booking) => <article key={booking.id}><time dateTime={booking.serviceDate}>{serviceDateLabel(booking.serviceDate)}</time><strong>{booking.shiftName}</strong><span>{booking.room}</span><small>{timeLabel(booking.startsAt, timeZone)}–{timeLabel(booking.endsAt, timeZone)}</small></article>)}{!selected.upcomingBookings.length ? <p className="artist-section-empty">No upcoming bookings.</p> : null}</div><ArtistBookingCalendar artistId={selected.id} bookings={selected.upcomingBookings} /></div></section>
        {selected.ownership === "hfy" ? <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Artist details</p><h3>Client-safe profile</h3></div></div><dl className="artist-definition-list"><div><dt>Genres</dt><dd>{selected.genres.join(", ") || "Not provided"}</dd></div><div><dt>Home market</dt><dd>{selected.homeMarket || "Not provided"}</dd></div><div><dt>Instagram</dt><dd>{selected.instagramHandle || "Not provided"}</dd></div></dl></section> : null}
      </> : null}
    </>}
    overlays={creating ? <div className="artist-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setCreating(false); }}><aside className="artist-editor-drawer artist-create-drawer" role="dialog" aria-modal="true" aria-labelledby="client-artist-create-title"><div className="artist-editor-form"><header className="artist-editor-heading"><div><p className="eyebrow">Residency roster</p><h2 id="client-artist-create-title">New Artist</h2><p>This creates a {residencyName}-owned artist and adds them to this roster.</p></div><button className="quick-modal-close" type="button" aria-label="Close new artist form" onClick={() => setCreating(false)}>×</button></header><div className="artist-editor-scroll"><AddClientArtistForm onSuccess={() => setCreating(false)} /></div></div></aside></div> : null}
  />;
}
