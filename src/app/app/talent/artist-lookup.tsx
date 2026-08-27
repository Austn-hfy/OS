"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { updateArtistAction, type ResidencyActionState } from "@/app/app/actions";
import { Status } from "@/components/format";
import type { getArtistLookupData } from "@/data/internal";
import { monthGrid, monthLabel, shiftMonthKey } from "@/lib/calendar";

type ArtistRow = Awaited<ReturnType<typeof getArtistLookupData>>[number];
const initialActionState: ResidencyActionState = { status: "idle", message: "" };
const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function serviceDateLabel(serviceDate: string) {
  return new Date(`${serviceDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function timeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function ArtistBookingCalendar({ artistId, bookings }: { artistId: string; bookings: ArtistRow["upcomingBookings"] }) {
  const firstMonth = bookings[0]?.serviceDate.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const [selection, setSelection] = useState({ artistId, monthKey: firstMonth });
  const monthKey = selection.artistId === artistId ? selection.monthKey : firstMonth;
  const bookingCounts = useMemo(() => bookings.reduce<Record<string, number>>((counts, booking) => {
    counts[booking.serviceDate] = (counts[booking.serviceDate] ?? 0) + 1;
    return counts;
  }, {}), [bookings]);

  return <div className="artist-mini-calendar" aria-label={`${monthLabel(monthKey)} booking calendar`}>
    <div className="artist-mini-calendar-heading"><button type="button" aria-label="Previous booking month" onClick={() => setSelection({ artistId, monthKey: shiftMonthKey(monthKey, -1) })}>←</button><strong>{monthLabel(monthKey)}</strong><button type="button" aria-label="Next booking month" onClick={() => setSelection({ artistId, monthKey: shiftMonthKey(monthKey, 1) })}>→</button></div>
    <div className="artist-mini-calendar-grid">{weekdayLabels.map((weekday, index) => <span className="artist-mini-weekday" key={`${weekday}-${index}`}>{weekday}</span>)}{monthGrid(monthKey).map((day) => {
      const count = bookingCounts[day.iso] ?? 0;
      return <div className={`artist-mini-day ${day.inMonth ? "" : "outside"} ${count ? "booked" : ""}`} title={count ? `${count} booking${count === 1 ? "" : "s"}` : undefined} key={day.iso}><time dateTime={day.iso}>{day.day}</time>{count ? <span>{count}</span> : null}</div>;
    })}</div>
  </div>;
}

export function ArtistLookup({ artists, residencyName }: { artists: ArtistRow[]; residencyName?: string }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const selected = artists.find((artist) => artist.id === selectedId) ?? null;
  const filteredArtists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? artists.filter((artist) => artist.stageName.toLowerCase().includes(normalized) || artist.fullName.toLowerCase().includes(normalized)) : artists;
  }, [artists, query]);
  const saveArtist = async (previous: ResidencyActionState, formData: FormData) => {
    const result = await updateArtistAction(previous, formData);
    if (result.status === "success") setEditing(false);
    return result;
  };
  const [state, formAction, pending] = useActionState(saveArtist, initialActionState);

  useEffect(() => {
    if (!editing) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setEditing(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [editing]);

  return <div className="artist-lookup-shell">
    <aside className="artist-roster-panel">
      <div className="artist-search-field"><label htmlFor="artist-lookup-search">Search artists</label><div><span aria-hidden="true">⌕</span><input id="artist-lookup-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by artist name" /></div></div>
      <div className="artist-roster-count"><strong>{filteredArtists.length}</strong><span>{filteredArtists.length === 1 ? "artist" : "artists"}</span></div>
      <div className="artist-roster-list">{filteredArtists.map((artist) => <button className={`artist-roster-row ${selectedId === artist.id ? "selected" : ""}`} type="button" onClick={() => { setSelectedId(artist.id); setEditing(false); }} key={artist.id}>
        <span className="artist-roster-row-heading"><strong>{artist.stageName}</strong><Status value={artist.talentStatus} /></span>
        <span className="artist-roster-meta">{artist.homeMarket || "Market not set"}</span>
        <span className="artist-roster-genres">{artist.genres.join(" · ") || "Genres not set"}</span>
        <span className="artist-roster-flags"><small>{artist.rosterStatus === "ready" ? "Roster ready" : "Needs review"}</small>{artist.approvedForCurrentResidency === null ? <small>{artist.approvedResidencies.length} Residency list{artist.approvedResidencies.length === 1 ? "" : "s"}</small> : <small className={artist.approvedForCurrentResidency ? "approved" : "not-approved"}>{artist.approvedForCurrentResidency ? `Approved for ${residencyName}` : `Not approved for ${residencyName}`}</small>}</span>
      </button>)}{!filteredArtists.length ? <div className="empty artist-list-empty">No artists match “{query}”.</div> : null}</div>
    </aside>

    <section className="artist-detail-panel">
      {!selected ? <div className="artist-detail-empty"><span>HFY</span><h2>Select an artist</h2><p>Choose someone from the roster to see what they are owed, upcoming bookings, contact information, and payment details.</p></div> : <>
        <header className="artist-detail-header"><div><p className="eyebrow">Artist record</p><h2>{selected.stageName}</h2>{selected.fullName ? <p>{selected.fullName}</p> : null}</div><div className="artist-detail-actions"><Status value={selected.talentStatus} /><button className="button secondary" type="button" onClick={() => setEditing(true)}>Edit Artist</button></div></header>

        <section className="artist-owed-total"><span>Total outstanding owed</span><strong>{currency(selected.totalOutstandingOwedCents)}</strong><small>{selected.outstandingAssignments.length ? `${selected.outstandingAssignments.length} HFY OS unpaid Assignment${selected.outstandingAssignments.length === 1 ? "" : "s"}` : "No HFY OS ready-to-pay Assignments"}{selected.legacyOutstandingOwedCents ? ` · Includes ${currency(selected.legacyOutstandingOwedCents)} imported from Airtable` : ""}</small></section>

        <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Owed from</p><h3>Unpaid Assignments</h3></div><strong>{currency(selected.totalOutstandingOwedCents)}</strong></div>{selected.outstandingAssignments.length ? <div className="artist-owed-list">{selected.outstandingAssignments.map((assignment) => <article key={assignment.id}><div><strong>{assignment.residencyName}</strong><span>{assignment.shiftName} · {serviceDateLabel(assignment.serviceDate)}</span></div><strong>{currency(assignment.amountCents)}</strong></article>)}</div> : null}{selected.legacyOutstandingOwedCents ? <article className="artist-legacy-financial"><div><strong>Airtable outstanding snapshot</strong><span>{selected.legacyOwedFrom || "Itemized Airtable source was blank."}</span></div><strong>{currency(selected.legacyOutstandingOwedCents)}</strong></article> : null}{!selected.outstandingAssignments.length && !selected.legacyOutstandingOwedCents ? <p className="artist-section-empty">Nothing is currently outstanding for this artist.</p> : null}</section>

        <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Upcoming bookings</p><h3>{selected.upcomingBookings.length} scheduled</h3></div></div><div className="artist-booking-layout"><div className="artist-booking-list">{selected.upcomingBookings.map((booking) => <article key={booking.id}><time dateTime={booking.serviceDate}>{serviceDateLabel(booking.serviceDate)}</time><strong>{booking.residencyName}</strong><span>{booking.shiftName} · {booking.room}</span><small>{timeLabel(booking.startsAt, booking.residencyTimezone)}–{timeLabel(booking.endsAt, booking.residencyTimezone)}</small></article>)}{!selected.upcomingBookings.length ? <p className="artist-section-empty">No upcoming bookings.</p> : null}</div><ArtistBookingCalendar artistId={selected.id} bookings={selected.upcomingBookings} /></div></section>

        <div className="artist-detail-info-grid">
          <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Contact</p><h3>Artist details</h3></div></div><dl className="artist-definition-list"><div><dt>Phone</dt><dd>{selected.phone || "Not provided"}</dd></div><div><dt>Email</dt><dd>{selected.email || "Not provided"}</dd></div><div><dt>Instagram</dt><dd>{selected.instagramHandle || "Not provided"}</dd></div></dl></section>
          <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Payment details</p><h3>{selected.paymentProfile?.paymentMethod || "Not configured"}</h3></div></div><dl className="artist-definition-list"><div><dt>Zelle email</dt><dd>{selected.paymentProfile?.zelleEmail || "—"}</dd></div><div><dt>Zelle phone</dt><dd>{selected.paymentProfile?.zellePhone || "—"}</dd></div><div><dt>ACH account</dt><dd>{selected.paymentProfile?.lastFour ? `Ending in ${selected.paymentProfile.lastFour}` : "—"}</dd></div><div><dt>W-9</dt><dd>{selected.hasW9 ? "On file" : "Not on file"}</dd></div></dl></section>
        </div>
        {selected.airtableImportedAt ? <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Historical snapshot</p><h3>Airtable record</h3></div></div><dl className="artist-definition-list"><div><dt>Total earnings (all time)</dt><dd>{currency(selected.legacyTotalEarningsCents)}</dd></div><div><dt>Airtable roster status</dt><dd>{selected.airtableRosterStatusLabel || "Blank"}</dd></div><div><dt>Airtable talent status</dt><dd>{selected.airtableTalentStatusLabel || "Blank"}</dd></div><div><dt>Imported</dt><dd>{new Date(selected.airtableImportedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</dd></div><div><dt>Upcoming-bookings snapshot</dt><dd>{selected.legacyUpcomingBookings || "None recorded at import"}</dd></div></dl></section> : null}
      </>}
    </section>

    {editing && selected ? <div className="artist-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditing(false); }}><aside className="artist-editor-drawer" role="dialog" aria-modal="true" aria-labelledby="artist-editor-title"><form action={formAction} className="artist-editor-form">
      <input name="talentId" type="hidden" value={selected.id} />
      <header className="artist-editor-heading"><div><p className="eyebrow">Full Talent record</p><h2 id="artist-editor-title">Edit {selected.stageName}</h2></div><button className="quick-modal-close" type="button" aria-label="Close artist editor" onClick={() => setEditing(false)}>×</button></header>
      <div className="artist-editor-scroll">
        <section><h3>Identity and contact</h3><div className="artist-editor-grid"><div className="field"><label>Stage name</label><input name="stageName" defaultValue={selected.stageName} required /></div><div className="field"><label>Full name</label><input name="fullName" defaultValue={selected.fullName} /></div><div className="field"><label>Email</label><input name="email" type="email" defaultValue={selected.email} /></div><div className="field"><label>Phone</label><input name="phone" defaultValue={selected.phone} /></div><div className="field"><label>Instagram handle</label><input name="instagramHandle" defaultValue={selected.instagramHandle} /></div><div className="field"><label>Home market</label><input name="homeMarket" defaultValue={selected.homeMarket} /></div></div></section>
        <section><h3>Roster</h3><div className="artist-editor-grid"><div className="field wide"><label>Genres <span>comma separated</span></label><input name="genres" defaultValue={selected.genres.join(", ")} /></div><div className="field"><label>Priority</label><input name="priority" type="number" min="1" max="5" defaultValue={selected.priority ?? ""} /></div><div className="field"><label>Roster status</label><select name="rosterStatus" defaultValue={selected.rosterStatus}><option value="needs_review">Needs review</option><option value="ready">Ready</option></select></div><div className="field"><label>Talent status</label><select name="talentStatus" defaultValue={selected.talentStatus}><option value="active">Active</option><option value="inactive">Inactive</option></select></div><div className="field wide"><label>Talent notes</label><textarea name="talentNotes" rows={4} defaultValue={selected.talentNotes} /></div></div></section>
        <section><h3>Payment information</h3><div className="artist-editor-grid"><div className="field"><label>Payment method</label><input name="paymentMethod" defaultValue={selected.paymentProfile?.paymentMethod ?? ""} placeholder="Zelle, ACH, check…" /></div><div className="field"><label>Zelle email</label><input name="zelleEmail" type="email" defaultValue={selected.paymentProfile?.zelleEmail ?? ""} /></div><div className="field"><label>Zelle phone</label><input name="zellePhone" defaultValue={selected.paymentProfile?.zellePhone ?? ""} /></div><div className="field"><label>ACH last four</label><input name="lastFour" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" defaultValue={selected.paymentProfile?.lastFour ?? ""} /></div></div><p className="privacy-note">Full routing and account numbers remain encrypted and are never displayed in this interface.</p></section>
        <section><h3>Record status</h3><dl className="artist-definition-list"><div><dt>W-9</dt><dd>{selected.hasW9 ? "On file" : "Not on file"}</dd></div><div><dt>Documents</dt><dd>{selected.documentCount}</dd></div><div><dt>Approved Residency lists</dt><dd>{selected.approvedResidencies.map((residency) => residency.name).join(", ") || "None"}</dd></div></dl></section>
        {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
      </div>
      <footer className="artist-editor-actions"><button className="button secondary" type="button" onClick={() => setEditing(false)}>Cancel</button><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save Artist"}</button></footer>
    </form></aside></div> : null}
  </div>;
}
