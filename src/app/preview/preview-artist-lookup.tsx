"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { monthGrid, monthLabel, shiftMonthKey } from "@/lib/calendar";

type PreviewArtistRecord = {
  id: string;
  stageName: string;
  fullName: string;
  email: string;
  phone: string;
  instagramHandle: string;
  homeMarket: string;
  genres: string[];
  rosterStatus: "ready" | "needs_review";
  talentStatus: "active" | "inactive";
  priority: string;
  talentNotes: string;
  approvedResidencyIds: string[];
  outstandingAssignments: Array<{ id: string; residencyName: string; shiftName: string; serviceDate: string; amountCents: number }>;
  upcomingBookings: Array<{ id: string; residencyName: string; shiftName: string; room: string; serviceDate: string; time: string }>;
  paymentMethod: string;
  zelleEmail: string;
  zellePhone: string;
  achLastFour: string;
  hasW9: boolean;
};

const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];
const initialArtists: PreviewArtistRecord[] = [
  {
    id: "elaine",
    stageName: "Elaine",
    fullName: "Elaine Hart",
    email: "elaine@example.com",
    phone: "(323) 555-0142",
    instagramHandle: "@elaineplays",
    homeMarket: "Los Angeles",
    genres: ["Disco", "House"],
    rosterStatus: "ready",
    talentStatus: "active",
    priority: "1",
    talentNotes: "Strong daytime and pool programming fit.",
    approvedResidencyIds: ["ace-parity"],
    outstandingAssignments: [
      { id: "elaine-owed-1", residencyName: "Ace Hotel", shiftName: "Pool", serviceDate: "2026-08-22", amountCents: 24000 },
      { id: "elaine-owed-2", residencyName: "Ace Hotel", shiftName: "Amigo Room", serviceDate: "2026-08-23", amountCents: 32000 },
    ],
    upcomingBookings: [
      { id: "elaine-upcoming-1", residencyName: "Ace Hotel", shiftName: "Pool", room: "Pool", serviceDate: "2026-08-28", time: "12:00 PM–3:00 PM" },
      { id: "elaine-upcoming-2", residencyName: "Ace Hotel", shiftName: "Pool", room: "Pool", serviceDate: "2026-09-04", time: "3:00 PM–7:00 PM" },
    ],
    paymentMethod: "Zelle",
    zelleEmail: "elaine@example.com",
    zellePhone: "",
    achLastFour: "",
    hasW9: true,
  },
  {
    id: "maya",
    stageName: "Maya Lane",
    fullName: "Maya Lane",
    email: "maya@example.com",
    phone: "(310) 555-0188",
    instagramHandle: "@mayalane",
    homeMarket: "Los Angeles",
    genres: ["Disco", "House", "Soul"],
    rosterStatus: "ready",
    talentStatus: "active",
    priority: "1",
    talentNotes: "Approved for Ace pool programming.",
    approvedResidencyIds: ["ace-parity"],
    outstandingAssignments: [
      { id: "maya-owed-1", residencyName: "Ace Hotel", shiftName: "Pool", serviceDate: "2026-08-15", amountCents: 56000 },
    ],
    upcomingBookings: [
      { id: "maya-upcoming-1", residencyName: "Ace Hotel", shiftName: "Pool", room: "Pool", serviceDate: "2026-08-29", time: "12:00 PM–3:00 PM" },
    ],
    paymentMethod: "ACH",
    zelleEmail: "",
    zellePhone: "",
    achLastFour: "4821",
    hasW9: true,
  },
  {
    id: "sol",
    stageName: "Sol Selects",
    fullName: "Sol Rivera",
    email: "sol@example.com",
    phone: "(760) 555-0109",
    instagramHandle: "@solselects",
    homeMarket: "Palm Springs",
    genres: ["Balearic", "Funk"],
    rosterStatus: "ready",
    talentStatus: "active",
    priority: "2",
    talentNotes: "Local market artist.",
    approvedResidencyIds: ["ace-parity"],
    outstandingAssignments: [],
    upcomingBookings: [
      { id: "sol-upcoming-1", residencyName: "Ace Hotel", shiftName: "Pool", room: "Pool", serviceDate: "2026-08-29", time: "3:00 PM–7:00 PM" },
    ],
    paymentMethod: "Zelle",
    zelleEmail: "sol@example.com",
    zellePhone: "",
    achLastFour: "",
    hasW9: false,
  },
  {
    id: "nico",
    stageName: "Nico Bloom",
    fullName: "Nico Bloom",
    email: "nico@example.com",
    phone: "(213) 555-0164",
    instagramHandle: "@nicobloom",
    homeMarket: "Los Angeles",
    genres: ["House", "Global"],
    rosterStatus: "needs_review",
    talentStatus: "inactive",
    priority: "3",
    talentNotes: "Confirm current availability before booking.",
    approvedResidencyIds: ["ace-parity"],
    outstandingAssignments: [],
    upcomingBookings: [],
    paymentMethod: "",
    zelleEmail: "",
    zellePhone: "",
    achLastFour: "",
    hasW9: false,
  },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function dateLabel(serviceDate: string) {
  return new Date(`${serviceDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function PreviewStatus({ value }: { value: string }) {
  return <span className={`status ${value}`}>{value.replaceAll("_", " ")}</span>;
}

function PreviewBookingCalendar({ artist }: { artist: PreviewArtistRecord }) {
  const firstMonth = artist.upcomingBookings[0]?.serviceDate.slice(0, 7) ?? "2026-08";
  const [monthKey, setMonthKey] = useState(firstMonth);
  const bookingCounts = artist.upcomingBookings.reduce<Record<string, number>>((counts, booking) => {
    counts[booking.serviceDate] = (counts[booking.serviceDate] ?? 0) + 1;
    return counts;
  }, {});

  return <div className="artist-mini-calendar" aria-label={`${monthLabel(monthKey)} booking calendar`}>
    <div className="artist-mini-calendar-heading"><button type="button" aria-label="Previous booking month" onClick={() => setMonthKey((value) => shiftMonthKey(value, -1))}>←</button><strong>{monthLabel(monthKey)}</strong><button type="button" aria-label="Next booking month" onClick={() => setMonthKey((value) => shiftMonthKey(value, 1))}>→</button></div>
    <div className="artist-mini-calendar-grid">{weekdayLabels.map((weekday, index) => <span className="artist-mini-weekday" key={`${weekday}-${index}`}>{weekday}</span>)}{monthGrid(monthKey).map((day) => {
      const count = bookingCounts[day.iso] ?? 0;
      return <div className={`artist-mini-day ${day.inMonth ? "" : "outside"} ${count ? "booked" : ""}`} key={day.iso}><time dateTime={day.iso}>{day.day}</time>{count ? <span>{count}</span> : null}</div>;
    })}</div>
  </div>;
}

export function PreviewArtistLookup({ residencyId, residencyName }: { residencyId?: string; residencyName?: string }) {
  const [records, setRecords] = useState(initialArtists);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const selected = records.find((artist) => artist.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? records.filter((artist) => artist.stageName.toLowerCase().includes(normalized) || artist.fullName.toLowerCase().includes(normalized)) : records;
  }, [query, records]);

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

  function saveArtist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    setRecords((current) => current.map((artist) => artist.id === selected.id ? {
      ...artist,
      stageName: value("stageName"),
      fullName: value("fullName"),
      email: value("email"),
      phone: value("phone"),
      instagramHandle: value("instagramHandle"),
      homeMarket: value("homeMarket"),
      genres: value("genres").split(",").map((genre) => genre.trim()).filter(Boolean),
      priority: value("priority"),
      rosterStatus: value("rosterStatus") as PreviewArtistRecord["rosterStatus"],
      talentStatus: value("talentStatus") as PreviewArtistRecord["talentStatus"],
      talentNotes: value("talentNotes"),
      paymentMethod: value("paymentMethod"),
      zelleEmail: value("zelleEmail"),
      zellePhone: value("zellePhone"),
      achLastFour: value("achLastFour"),
    } : artist));
    setEditing(false);
  }

  return <>
    <header className="page-header artist-lookup-page-header"><div><p className="eyebrow">{residencyName ?? "HFY company"}</p><h1>Artist Lookup</h1><p className="subhead">Search the roster, review outstanding pay, and see every upcoming booking in one place.</p></div></header>
    <div className="artist-lookup-shell">
      <aside className="artist-roster-panel">
        <div className="artist-search-field"><label htmlFor="preview-artist-search">Search artists</label><div><span aria-hidden="true">⌕</span><input id="preview-artist-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by artist name" /></div></div>
        <div className="artist-roster-count"><strong>{filtered.length}</strong><span>{filtered.length === 1 ? "artist" : "artists"}</span></div>
        <div className="artist-roster-list">{filtered.map((artist) => <button className={`artist-roster-row ${selectedId === artist.id ? "selected" : ""}`} type="button" onClick={() => { setSelectedId(artist.id); setEditing(false); }} key={artist.id}>
          <span className="artist-roster-row-heading"><strong>{artist.stageName}</strong><PreviewStatus value={artist.talentStatus} /></span>
          <span className="artist-roster-meta">{artist.homeMarket}</span>
          <span className="artist-roster-genres">{artist.genres.join(" · ")}</span>
          <span className="artist-roster-flags"><small>{artist.rosterStatus === "ready" ? "Roster ready" : "Needs review"}</small>{residencyId ? <small className={artist.approvedResidencyIds.includes(residencyId) ? "approved" : "not-approved"}>{artist.approvedResidencyIds.includes(residencyId) ? `Approved for ${residencyName}` : `Not approved for ${residencyName}`}</small> : <small>{artist.approvedResidencyIds.length} Residency list</small>}</span>
        </button>)}{!filtered.length ? <div className="empty artist-list-empty">No artists match “{query}”.</div> : null}</div>
      </aside>

      <section className="artist-detail-panel">
        {!selected ? <div className="artist-detail-empty"><span>HFY</span><h2>Select an artist</h2><p>Choose someone from the roster to see what they are owed, upcoming bookings, contact information, and payment details.</p></div> : <>
          <header className="artist-detail-header"><div><p className="eyebrow">Artist record</p><h2>{selected.stageName}</h2><p>{selected.fullName}</p></div><div className="artist-detail-actions"><PreviewStatus value={selected.talentStatus} /><button className="button secondary" type="button" onClick={() => setEditing(true)}>Edit Artist</button></div></header>
          <section className="artist-owed-total"><span>Total outstanding owed</span><strong>{money(selected.outstandingAssignments.reduce((sum, item) => sum + item.amountCents, 0))}</strong><small>{selected.outstandingAssignments.length ? `${selected.outstandingAssignments.length} unpaid Assignment${selected.outstandingAssignments.length === 1 ? "" : "s"}` : "No ready-to-pay Assignments"}</small></section>
          <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Owed from</p><h3>Unpaid Assignments</h3></div><strong>{money(selected.outstandingAssignments.reduce((sum, item) => sum + item.amountCents, 0))}</strong></div>{selected.outstandingAssignments.length ? <div className="artist-owed-list">{selected.outstandingAssignments.map((assignment) => <article key={assignment.id}><div><strong>{assignment.residencyName}</strong><span>{assignment.shiftName} · {dateLabel(assignment.serviceDate)}</span></div><strong>{money(assignment.amountCents)}</strong></article>)}</div> : <p className="artist-section-empty">Nothing is currently outstanding for this artist.</p>}</section>
          <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Upcoming bookings</p><h3>{selected.upcomingBookings.length} scheduled</h3></div></div><div className="artist-booking-layout"><div className="artist-booking-list">{selected.upcomingBookings.map((booking) => <article key={booking.id}><time dateTime={booking.serviceDate}>{dateLabel(booking.serviceDate)}</time><strong>{booking.residencyName}</strong><span>{booking.shiftName} · {booking.room}</span><small>{booking.time}</small></article>)}{!selected.upcomingBookings.length ? <p className="artist-section-empty">No upcoming bookings.</p> : null}</div><PreviewBookingCalendar key={selected.id} artist={selected} /></div></section>
          <div className="artist-detail-info-grid"><section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Contact</p><h3>Artist details</h3></div></div><dl className="artist-definition-list"><div><dt>Phone</dt><dd>{selected.phone || "Not provided"}</dd></div><div><dt>Email</dt><dd>{selected.email || "Not provided"}</dd></div><div><dt>Instagram</dt><dd>{selected.instagramHandle || "Not provided"}</dd></div></dl></section><section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Payment details</p><h3>{selected.paymentMethod || "Not configured"}</h3></div></div><dl className="artist-definition-list"><div><dt>Zelle email</dt><dd>{selected.zelleEmail || "—"}</dd></div><div><dt>Zelle phone</dt><dd>{selected.zellePhone || "—"}</dd></div><div><dt>ACH account</dt><dd>{selected.achLastFour ? `Ending in ${selected.achLastFour}` : "—"}</dd></div><div><dt>W-9</dt><dd>{selected.hasW9 ? "On file" : "Not on file"}</dd></div></dl></section></div>
        </>}
      </section>
    </div>

    {editing && selected ? <div className="artist-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditing(false); }}><aside className="artist-editor-drawer" role="dialog" aria-modal="true" aria-labelledby="preview-artist-editor-title"><form className="artist-editor-form" onSubmit={saveArtist}>
      <header className="artist-editor-heading"><div><p className="eyebrow">Full Talent record</p><h2 id="preview-artist-editor-title">Edit {selected.stageName}</h2></div><button className="quick-modal-close" type="button" aria-label="Close artist editor" onClick={() => setEditing(false)}>×</button></header>
      <div className="artist-editor-scroll"><section><h3>Identity and contact</h3><div className="artist-editor-grid"><div className="field"><label>Stage name</label><input name="stageName" defaultValue={selected.stageName} required /></div><div className="field"><label>Full name</label><input name="fullName" defaultValue={selected.fullName} /></div><div className="field"><label>Email</label><input name="email" type="email" defaultValue={selected.email} /></div><div className="field"><label>Phone</label><input name="phone" defaultValue={selected.phone} /></div><div className="field"><label>Instagram handle</label><input name="instagramHandle" defaultValue={selected.instagramHandle} /></div><div className="field"><label>Home market</label><input name="homeMarket" defaultValue={selected.homeMarket} /></div></div></section><section><h3>Roster</h3><div className="artist-editor-grid"><div className="field wide"><label>Genres <span>comma separated</span></label><input name="genres" defaultValue={selected.genres.join(", ")} /></div><div className="field"><label>Priority</label><input name="priority" type="number" min="1" max="5" defaultValue={selected.priority} /></div><div className="field"><label>Roster status</label><select name="rosterStatus" defaultValue={selected.rosterStatus}><option value="needs_review">Needs review</option><option value="ready">Ready</option></select></div><div className="field"><label>Talent status</label><select name="talentStatus" defaultValue={selected.talentStatus}><option value="active">Active</option><option value="inactive">Inactive</option></select></div><div className="field wide"><label>Talent notes</label><textarea name="talentNotes" rows={4} defaultValue={selected.talentNotes} /></div></div></section><section><h3>Payment information</h3><div className="artist-editor-grid"><div className="field"><label>Payment method</label><input name="paymentMethod" defaultValue={selected.paymentMethod} /></div><div className="field"><label>Zelle email</label><input name="zelleEmail" type="email" defaultValue={selected.zelleEmail} /></div><div className="field"><label>Zelle phone</label><input name="zellePhone" defaultValue={selected.zellePhone} /></div><div className="field"><label>ACH last four</label><input name="achLastFour" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" defaultValue={selected.achLastFour} /></div></div><p className="privacy-note">Full routing and account numbers remain encrypted and are never displayed in this interface.</p></section><section><h3>Record status</h3><dl className="artist-definition-list"><div><dt>W-9</dt><dd>{selected.hasW9 ? "On file" : "Not on file"}</dd></div><div><dt>Approved Residency lists</dt><dd>{selected.approvedResidencyIds.length ? "Ace Hotel" : "None"}</dd></div></dl></section></div>
      <footer className="artist-editor-actions"><button className="button secondary" type="button" onClick={() => setEditing(false)}>Cancel</button><button className="button" type="submit">Save Artist</button></footer>
    </form></aside></div> : null}
  </>;
}
