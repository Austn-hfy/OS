"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  bulkUpdateArtistsAction,
  createArtistLookupAction,
  updateArtistAction,
  updateArtistResidenciesAction,
  type ArtistRosterOperation,
  type ResidencyActionState,
} from "@/app/app/actions";
import { Status } from "@/components/format";
import { ArtistBookingCalendar } from "@/components/artist-booking-calendar";
import { PrivateValue, SensitiveInput, usePrivacyMode } from "@/components/privacy-mode";
import { TalentWorkspaceShell } from "@/components/talent-workspace-shell";
import { RateNeededWarning } from "@/components/rate-needed-warning";
import type { getArtistLookupData, getResidencyList } from "@/data/internal";
import {
  artistRosterCounts,
  filterAndSortArtistRoster,
  type ArtistRosterSort,
  type ArtistRosterView,
} from "@/domain/artist-roster";
import { TALENT_GENRES } from "@/domain/talent-genres";

type ArtistRow = Awaited<ReturnType<typeof getArtistLookupData>>[number];
type ResidencyRow = Awaited<ReturnType<typeof getResidencyList>>[number];
const initialActionState: ResidencyActionState = { status: "idle", message: "" };

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function serviceDateLabel(serviceDate: string) {
  return new Date(`${serviceDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function timeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function ArtistLookup({ artists, residencies, currentResidency }: { artists: ArtistRow[]; residencies: ResidencyRow[]; currentResidency: ResidencyRow | null }) {
  const { enabled: privacyEnabled } = usePrivacyMode();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ArtistRosterView>("active");
  const [sort, setSort] = useState<ArtistRosterSort>("name_asc");
  const [residencyFilterId, setResidencyFilterId] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managingResidencies, setManagingResidencies] = useState(false);
  const [residencySelection, setResidencySelection] = useState<Set<string>>(new Set());
  const [bulkResidencyId, setBulkResidencyId] = useState(residencies[0]?.id ?? "");
  const [rosterState, setRosterState] = useState<ResidencyActionState>(initialActionState);
  const [rosterPending, startRosterTransition] = useTransition();
  const selected = artists.find((artist) => artist.id === selectedId) ?? null;
  const counts = useMemo(() => artistRosterCounts(artists), [artists]);
  const statusFilteredArtists = useMemo(() => filterAndSortArtistRoster(artists, view, query, sort), [artists, query, sort, view]);
  const filteredArtists = useMemo(() => residencyFilterId === "all"
    ? statusFilteredArtists
    : statusFilteredArtists.filter((artist) => artist.clientVisibleResidencies.some((residency) => residency.id === residencyFilterId)),
  [residencyFilterId, statusFilteredArtists]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchMatchesOutsideView = useMemo(() => normalizedQuery ? artists.filter((artist) => (
    artist.stageName.toLocaleLowerCase().includes(normalizedQuery)
    || artist.fullName.toLocaleLowerCase().includes(normalizedQuery)
  ) && !filteredArtists.some((visible) => visible.id === artist.id)) : [], [artists, filteredArtists, normalizedQuery]);

  const saveArtist = async (previous: ResidencyActionState, formData: FormData) => {
    const result = await updateArtistAction(previous, formData);
    if (result.status === "success") setEditing(false);
    return result;
  };
  const saveNewArtist = async (previous: ResidencyActionState, formData: FormData) => {
    const result = await createArtistLookupAction(previous, formData);
    if (result.status === "success") setCreating(false);
    return result;
  };
  const [editState, editAction, editPending] = useActionState(saveArtist, initialActionState);
  const [createState, createAction, createPending] = useActionState(saveNewArtist, initialActionState);

  useEffect(() => {
    if (!editing && !creating && !managingResidencies) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setEditing(false);
      setCreating(false);
      setManagingResidencies(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [creating, editing, managingResidencies]);

  function changeView(nextView: ArtistRosterView) {
    setView(nextView);
    setSort(nextView === "owed" ? "owed_desc" : "name_asc");
    setSelectedId(null);
    setSelectedIds(new Set());
    setRosterState(initialActionState);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmSensitiveChange(operation: ArtistRosterOperation, ids: string[]) {
    if (operation === "remove_from_client_roster") {
      const residency = residencies.find((item) => item.id === residencyFilterId);
      if (!residency) return false;
      const affected = artists.filter((artist) => ids.includes(artist.id));
      const upcoming = affected.reduce((sum, artist) => sum + artist.upcomingBookings.filter((booking) => booking.residencyId === residency.id).length, 0);
      return window.confirm(`Remove ${affected.length} artist${affected.length === 1 ? "" : "s"} from ${residency.name}'s client roster? They will remain available to HFY Programming, and ${upcoming ? `${upcoming} existing booking${upcoming === 1 ? "" : "s"}, ` : ""}payout history, and invoices will be preserved.`);
    }
    if (operation !== "inactive" && operation !== "archive") return true;
    const affected = artists.filter((artist) => ids.includes(artist.id));
    const upcoming = affected.reduce((sum, artist) => sum + artist.upcomingBookings.length, 0);
    const owed = affected.reduce((sum, artist) => sum + artist.totalOutstandingOwedCents, 0);
    if (!upcoming && !owed && operation === "inactive") return true;
    const details = [upcoming ? `${upcoming} upcoming booking${upcoming === 1 ? "" : "s"}` : "", owed ? (privacyEnabled ? "an outstanding balance" : `${currency(owed)} outstanding`) : ""].filter(Boolean).join(" and ");
    return window.confirm(`${operation === "archive" ? "Archive" : "Set Inactive"} ${affected.length} artist${affected.length === 1 ? "" : "s"}?${details ? ` They currently have ${details}.` : ""} Existing bookings, payouts, and history will be preserved.`);
  }

  function runBulk(operation: ArtistRosterOperation, ids = [...selectedIds], residencyId?: string) {
    if (!ids.length || !confirmSensitiveChange(operation, ids)) return;
    startRosterTransition(async () => {
      const result = await bulkUpdateArtistsAction({ talentIds: ids, operation, residencyId });
      setRosterState(result);
      if (result.status === "success") {
        setSelectedIds(new Set());
        if (operation !== "add_to_client_roster") setSelectedId(null);
      }
    });
  }

  function openResidencyManager() {
    if (!selected) return;
    setResidencySelection(new Set(selected.clientVisibleResidencies.map((residency) => residency.id)));
    setRosterState(initialActionState);
    setManagingResidencies(true);
  }

  function saveResidencies() {
    if (!selected) return;
    const removedIds = selected.clientVisibleResidencies.map((residency) => residency.id).filter((id) => !residencySelection.has(id));
    const affectedBookings = selected.upcomingBookings.filter((booking) => removedIds.includes(booking.residencyId));
    if (affectedBookings.length && !window.confirm(`${selected.stageName} has ${affectedBookings.length} upcoming booking${affectedBookings.length === 1 ? "" : "s"} in the Residency assignment being removed. The bookings will remain, but this artist will no longer appear for new selections. Continue?`)) return;
    startRosterTransition(async () => {
      const result = await updateArtistResidenciesAction({ talentId: selected.id, residencyIds: [...residencySelection] });
      setRosterState(result);
      if (result.status === "success") setManagingResidencies(false);
    });
  }

  const tabs: Array<{ id: ArtistRosterView; label: string }> = [
    { id: "active", label: "Active" },
    { id: "owed", label: "Owed" },
    { id: "inactive", label: "Inactive" },
    { id: "archived", label: "Archived" },
  ];

  return <TalentWorkspaceShell sidebar={<>
      <div className="artist-roster-toolbar">
        <div className="artist-roster-toolbar-heading"><button className="button secondary" type="button" onClick={() => setCreating(true)}>+ New Artist</button></div>
        <div className="artist-search-field"><label htmlFor="artist-lookup-search">Search artists</label><div><span aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg></span><input id="artist-lookup-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by artist name" /></div></div>
        <div className="artist-roster-tabs" role="tablist" aria-label="Artist status"><div>{tabs.map((tab) => <button className={view === tab.id ? "active" : ""} type="button" role="tab" aria-selected={view === tab.id} onClick={() => changeView(tab.id)} key={tab.id}><span>{tab.label}</span><strong>{counts[tab.id]}</strong></button>)}</div></div>
        <div className="artist-roster-sort"><span><strong>{filteredArtists.length}</strong> {filteredArtists.length === 1 ? "artist" : "artists"}</span><label>Client roster<select aria-label="Filter by client roster" value={residencyFilterId} onChange={(event) => { setResidencyFilterId(event.target.value); setBulkResidencyId(event.target.value === "all" ? residencies[0]?.id ?? "" : event.target.value); setSelectedId(null); setSelectedIds(new Set()); setRosterState(initialActionState); }}><option value="all">All artists</option>{residencies.map((residency) => <option value={residency.id} key={residency.id}>{residency.name}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as ArtistRosterSort)}><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="owed_desc">Amount owed</option><option value="booking_asc">Next booking</option></select></label></div>
      </div>

      {selectedIds.size ? <div className="artist-bulk-toolbar" aria-live="polite"><div><strong>{selectedIds.size} selected</strong><button type="button" onClick={() => setSelectedIds(new Set())}>Clear</button></div><div className="artist-bulk-actions">{view === "archived" ? <button type="button" onClick={() => runBulk("restore")} disabled={rosterPending}>Restore</button> : <><button type="button" onClick={() => runBulk("active")} disabled={rosterPending}>Set Active</button><button type="button" onClick={() => runBulk("inactive")} disabled={rosterPending}>Set Inactive</button><button type="button" onClick={() => runBulk("archive")} disabled={rosterPending}>Archive</button>{!currentResidency && residencies.length ? residencyFilterId === "all" ? <span className="artist-bulk-residency"><select aria-label="Client roster for selected artists" value={bulkResidencyId} onChange={(event) => setBulkResidencyId(event.target.value)}>{residencies.map((residency) => <option value={residency.id} key={residency.id}>{residency.name}</option>)}</select><button type="button" onClick={() => runBulk("add_to_client_roster", [...selectedIds], bulkResidencyId)} disabled={rosterPending || !bulkResidencyId}>Add to Client Roster</button></span> : <button type="button" onClick={() => runBulk("remove_from_client_roster", [...selectedIds], residencyFilterId)} disabled={rosterPending}>Remove from Client Roster</button> : null}</>}</div></div> : null}
      {rosterState.status !== "idle" ? <p className={`artist-roster-message ${rosterState.status === "error" ? "error" : "success"}`} aria-live="polite">{rosterState.message}</p> : null}

      <div className="artist-roster-list">{filteredArtists.map((artist) => <div className={`artist-roster-row-wrap ${selectedId === artist.id ? "selected" : ""}`} key={artist.id}>
        <label className="artist-roster-select"><input type="checkbox" checked={selectedIds.has(artist.id)} onChange={() => toggleSelected(artist.id)} aria-label={`Select ${artist.stageName}`} /><span aria-hidden="true" /></label>
        <button className="artist-roster-row" type="button" onClick={() => { setSelectedId(artist.id); setEditing(false); }}>
          <span className="artist-roster-row-heading"><strong>{artist.stageName}</strong><span className="artist-roster-signals">{artist.hasRateNeeded ? <RateNeededWarning compact /> : null}{!currentResidency && artist.totalOutstandingOwedCents > 0 ? <small className="artist-owed-chip">Owed <PrivateValue>{currency(artist.totalOutstandingOwedCents)}</PrivateValue></small> : null}</span></span>
          {artist.homeMarket ? <span className="artist-roster-meta">{artist.homeMarket}</span> : null}
        </button>
      </div>)}{!filteredArtists.length ? <div className="empty artist-list-empty"><p>{!artists.length ? "No artists have been added yet." : query ? `No ${view} artists match “${query}”.` : `No ${view} artists to show.`}</p>{searchMatchesOutsideView.length ? <div><span>{searchMatchesOutsideView.length} match{searchMatchesOutsideView.length === 1 ? " exists" : "es exist"} in another view.</span>{searchMatchesOutsideView.some((artist) => artist.archivedAt) ? <button type="button" onClick={() => changeView("archived")}>Search Archived</button> : null}{searchMatchesOutsideView.some((artist) => !artist.archivedAt && artist.talentStatus === "inactive") ? <button type="button" onClick={() => changeView("inactive")}>Search Inactive</button> : null}</div> : null}</div> : null}</div>
    </>} detail={<>
      {!selected ? <div className="artist-detail-empty"><span>HFY</span><h2>{artists.length ? "Select an artist" : "Build your roster"}</h2><p>{artists.length ? "Choose someone from the roster to see what they are owed, upcoming bookings, client visibility, contact information, and payment details." : "Use New Artist to add the first person to Artist Lookup."}</p></div> : <>
        <header className="artist-detail-header"><div><p className="eyebrow">Artist record</p><h2>{selected.stageName}</h2>{selected.fullName ? <p>{selected.fullName}</p> : null}</div><div className="artist-detail-actions">{selected.archivedAt ? <span className="artist-archived-status">Archived</span> : <Status value={selected.talentStatus} />}<button className="button secondary" type="button" onClick={() => setEditing(true)}>Edit Artist</button></div></header>

        {currentResidency ? <section className="artist-residency-access"><div><p className="eyebrow">Client visibility</p><div className="artist-residency-chips"><span>{currentResidency.name}</span></div></div><small>Visible on this Residency&apos;s client Talent page.</small></section> : <section className="artist-residency-access"><div><p className="eyebrow">Client visibility</p><div className="artist-residency-chips">{selected.clientVisibleResidencies.length ? selected.clientVisibleResidencies.map((residency) => <span key={residency.id}>{residency.name}</span>) : <small>Not visible on any client roster.</small>}</div><small>{selected.exclusiveResidencyId ? `Exclusive to ${residencies.find((residency) => residency.id === selected.exclusiveResidencyId)?.name ?? "one Residency"}.` : "HFY Programming can still book this artist when they are not client-visible."}</small></div><button className="button secondary" type="button" onClick={openResidencyManager}>{selected.clientVisibleResidencies.length ? "Manage Client Visibility" : "Add to Client Roster"}</button></section>}

        <section className="artist-owed-total"><span>{currentResidency ? `${currentResidency.name} outstanding owed` : "Total outstanding owed"}</span><strong><PrivateValue>{currency(selected.totalOutstandingOwedCents)}</PrivateValue></strong><small>{selected.outstandingAssignments.length ? `${selected.outstandingAssignments.length} HFY OS unpaid Assignment${selected.outstandingAssignments.length === 1 ? "" : "s"}` : "No HFY OS ready-to-pay Assignments"}{!currentResidency && selected.legacyOutstandingOwedCents ? <> · Includes <PrivateValue>{currency(selected.legacyOutstandingOwedCents)}</PrivateValue> imported from Airtable</> : null}</small></section>

        <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Owed from</p><h3>Unpaid Assignments</h3></div><strong><PrivateValue>{currency(selected.totalOutstandingOwedCents)}</PrivateValue></strong></div>{selected.rateNeededAssignments.length || selected.outstandingAssignments.length ? <div className="artist-owed-list">{selected.rateNeededAssignments.map((assignment) => <article className="artist-rate-needed-row" key={assignment.id}><div><strong>{assignment.residencyName}</strong><span>{assignment.shiftName} · {serviceDateLabel(assignment.serviceDate)}</span></div><strong><RateNeededWarning /></strong></article>)}{selected.outstandingAssignments.map((assignment) => <article key={assignment.id}><div><strong>{assignment.residencyName}</strong><span>{assignment.shiftName} · {serviceDateLabel(assignment.serviceDate)}</span></div><strong><PrivateValue>{currency(assignment.amountCents)}</PrivateValue></strong></article>)}</div> : null}{!currentResidency && selected.legacyOutstandingOwedCents ? <article className="artist-legacy-financial"><div><strong>Airtable outstanding snapshot</strong><span><PrivateValue>{selected.legacyOwedFrom || "Itemized Airtable source was blank."}</PrivateValue></span></div><strong><PrivateValue>{currency(selected.legacyOutstandingOwedCents)}</PrivateValue></strong></article> : null}{!selected.rateNeededAssignments.length && !selected.outstandingAssignments.length && (!selected.legacyOutstandingOwedCents || currentResidency) ? <p className="artist-section-empty">Nothing is currently outstanding for this artist{currentResidency ? ` in ${currentResidency.name}` : ""}.</p> : null}</section>

        <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Upcoming bookings</p><h3>{selected.upcomingBookings.length} scheduled</h3></div></div><div className="artist-booking-layout"><div className="artist-booking-list">{selected.upcomingBookings.map((booking) => <article key={booking.id}><time dateTime={booking.serviceDate}>{serviceDateLabel(booking.serviceDate)}</time><strong>{booking.residencyName}</strong><span>{booking.shiftName} · {booking.room}</span><small>{timeLabel(booking.startsAt, booking.residencyTimezone)}–{timeLabel(booking.endsAt, booking.residencyTimezone)}</small></article>)}{!selected.upcomingBookings.length ? <p className="artist-section-empty">No upcoming bookings.</p> : null}</div><ArtistBookingCalendar artistId={selected.id} bookings={selected.upcomingBookings} /></div></section>

        <div className="artist-detail-info-grid">
          <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Contact</p><h3>Artist details</h3></div></div><dl className="artist-definition-list"><div><dt>Phone</dt><dd>{selected.phone || "Not provided"}</dd></div><div><dt>Email</dt><dd>{selected.email || "Not provided"}</dd></div><div><dt>Instagram</dt><dd>{selected.instagramHandle || "Not provided"}</dd></div></dl></section>
          <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Payment details</p><h3><PrivateValue>{selected.paymentProfile?.paymentMethod || "Not configured"}</PrivateValue></h3></div></div><dl className="artist-definition-list"><div><dt>Zelle email</dt><dd><PrivateValue>{selected.paymentProfile?.zelleEmail || "—"}</PrivateValue></dd></div><div><dt>Zelle phone</dt><dd><PrivateValue>{selected.paymentProfile?.zellePhone || "—"}</PrivateValue></dd></div><div><dt>ACH account</dt><dd><PrivateValue>{selected.paymentProfile?.lastFour ? `Ending in ${selected.paymentProfile.lastFour}` : "—"}</PrivateValue></dd></div><div><dt>W-9</dt><dd>{selected.hasW9 ? "On file" : "Not on file"}</dd></div></dl></section>
        </div>
        {!currentResidency && selected.airtableImportedAt ? <section className="artist-detail-section"><div className="artist-section-heading"><div><p className="eyebrow">Historical snapshot</p><h3>Airtable record</h3></div></div><dl className="artist-definition-list"><div><dt>Total earnings (all time)</dt><dd><PrivateValue>{currency(selected.legacyTotalEarningsCents)}</PrivateValue></dd></div><div><dt>Airtable roster status</dt><dd>{selected.airtableRosterStatusLabel || "Blank"}</dd></div><div><dt>Airtable talent status</dt><dd>{selected.airtableTalentStatusLabel || "Blank"}</dd></div><div><dt>Imported</dt><dd>{new Date(selected.airtableImportedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</dd></div><div><dt>Upcoming-bookings snapshot</dt><dd>{selected.legacyUpcomingBookings || "None recorded at import"}</dd></div></dl></section> : null}
        <section className="artist-record-controls"><div><p className="eyebrow">Record controls</p><h3>{selected.archivedAt ? "Restore this artist" : "Archive this artist"}</h3><p>{selected.archivedAt ? "Restoring returns the artist to Inactive so you can review them before making them bookable." : "Archiving removes the artist from standard lookup and future booking selections without deleting history."}</p></div><button className="button secondary" type="button" onClick={() => runBulk(selected.archivedAt ? "restore" : "archive", [selected.id])} disabled={rosterPending}>{selected.archivedAt ? "Restore Artist" : "Archive Artist"}</button></section>
      </>}
    </>} overlays={<>
    {editing && selected ? <div className="artist-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditing(false); }}><aside className="artist-editor-drawer" role="dialog" aria-modal="true" aria-labelledby="artist-editor-title"><form action={editAction} className="artist-editor-form">
      <input name="talentId" type="hidden" value={selected.id} />
      <header className="artist-editor-heading"><div><p className="eyebrow">Full Talent record</p><h2 id="artist-editor-title">Edit {selected.stageName}</h2></div><button className="quick-modal-close" type="button" aria-label="Close artist editor" onClick={() => setEditing(false)}>×</button></header>
      <div className="artist-editor-scroll">
        <section><h3>Identity and contact</h3><div className="artist-editor-grid"><div className="field"><label>Stage name</label><input name="stageName" defaultValue={selected.stageName} required /></div><div className="field"><label>Full name</label><input name="fullName" defaultValue={selected.fullName} /></div><div className="field"><label>Email</label><input name="email" type="email" defaultValue={selected.email} /></div><div className="field"><label>Phone</label><input name="phone" defaultValue={selected.phone} /></div><div className="field"><label>Instagram handle</label><input name="instagramHandle" defaultValue={selected.instagramHandle} /></div><div className="field"><label>Home market</label><input name="homeMarket" defaultValue={selected.homeMarket} /></div></div></section>
        <section><h3>Roster</h3><div className="artist-editor-grid"><fieldset className="field wide genre-options"><legend>Genres</legend>{TALENT_GENRES.map((genre) => <label key={genre}><input name="genres" type="checkbox" value={genre} defaultChecked={selected.genres.includes(genre)} /><span>{genre}</span></label>)}</fieldset><div className="field"><label>Priority</label><input name="priority" type="number" min="1" max="5" defaultValue={selected.priority ?? ""} /></div><div className="field"><label>Roster status</label><select name="rosterStatus" defaultValue={selected.rosterStatus}><option value="needs_review">Needs review</option><option value="ready">Ready</option></select></div><div className="field"><label>Talent status</label><select name="talentStatus" defaultValue={selected.talentStatus}><option value="active">Active</option><option value="inactive">Inactive</option></select></div><div className="field wide"><label>Talent notes</label><textarea name="talentNotes" rows={4} defaultValue={selected.talentNotes} /></div></div></section>
        <section><h3>Payment information</h3><div className="artist-editor-grid"><div className="field"><label>Payment method</label><SensitiveInput name="paymentMethod" defaultValue={selected.paymentProfile?.paymentMethod ?? ""} placeholder="Zelle, ACH, check…" /></div><div className="field"><label>Zelle email</label><SensitiveInput name="zelleEmail" type="email" defaultValue={selected.paymentProfile?.zelleEmail ?? ""} /></div><div className="field"><label>Zelle phone</label><SensitiveInput name="zellePhone" defaultValue={selected.paymentProfile?.zellePhone ?? ""} /></div><div className="field"><label>ACH last four</label><SensitiveInput name="lastFour" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" defaultValue={selected.paymentProfile?.lastFour ?? ""} /></div></div><p className="privacy-note">Full routing and account numbers remain encrypted and are never displayed in this interface.</p></section>
        <section><h3>Record status</h3><dl className="artist-definition-list"><div><dt>W-9</dt><dd>{selected.hasW9 ? "On file" : "Not on file"}</dd></div><div><dt>Documents</dt><dd>{selected.documentCount}</dd></div><div><dt>Client-visible rosters</dt><dd>{selected.clientVisibleResidencies.map((residency) => residency.name).join(", ") || "None"}</dd></div></dl></section>
        {editState.status !== "idle" ? <p className={editState.status === "error" ? "error" : "success"} aria-live="polite">{editState.message}</p> : null}
      </div>
      <footer className="artist-editor-actions"><button className="button secondary" type="button" onClick={() => setEditing(false)}>Cancel</button><button className="button" type="submit" disabled={editPending}>{editPending ? "Saving…" : "Save Artist"}</button></footer>
    </form></aside></div> : null}

    {creating ? <div className="artist-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setCreating(false); }}><aside className="artist-editor-drawer artist-create-drawer" role="dialog" aria-modal="true" aria-labelledby="artist-create-title"><form action={createAction} className="artist-editor-form">
      <header className="artist-editor-heading"><div><p className="eyebrow">Shared roster</p><h2 id="artist-create-title">New Artist</h2></div><button className="quick-modal-close" type="button" aria-label="Close new artist form" onClick={() => setCreating(false)}>×</button></header>
      <div className="artist-editor-scroll"><section><h3>Identity and contact</h3><div className="artist-editor-grid"><div className="field"><label>Stage name</label><input name="stageName" required autoFocus /></div><div className="field"><label>Full name</label><input name="fullName" /></div><div className="field"><label>Email</label><input name="email" type="email" /></div><div className="field"><label>Phone</label><input name="phone" /></div><div className="field"><label>Home market</label><input name="homeMarket" /></div><div className="field"><label>Priority</label><input name="priority" type="number" min="1" max="5" defaultValue="3" /></div><fieldset className="field wide genre-options"><legend>Genres</legend>{TALENT_GENRES.map((genre) => <label key={genre}><input name="genres" type="checkbox" value={genre} defaultChecked={genre === "Electronic/House"} /><span>{genre}</span></label>)}</fieldset></div></section>{createState.status !== "idle" ? <p className={createState.status === "error" ? "error" : "success"} aria-live="polite">{createState.message}</p> : null}</div>
      <footer className="artist-editor-actions"><button className="button secondary" type="button" onClick={() => setCreating(false)}>Cancel</button><button className="button" type="submit" disabled={createPending}>{createPending ? "Adding…" : "Add Artist"}</button></footer>
    </form></aside></div> : null}

    {managingResidencies && selected ? <div className="artist-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setManagingResidencies(false); }}><aside className="artist-editor-drawer artist-residency-drawer" role="dialog" aria-modal="true" aria-labelledby="artist-residency-title"><div className="artist-editor-form">
      <header className="artist-editor-heading"><div><p className="eyebrow">Client visibility</p><h2 id="artist-residency-title">{selected.stageName}</h2><p>Choose which Residency Talent pages can display this HFY artist. This does not affect where HFY can book them.</p></div><button className="quick-modal-close" type="button" aria-label="Close client visibility" onClick={() => setManagingResidencies(false)}>×</button></header>
      <div className="artist-editor-scroll"><div className="artist-residency-options">{residencies.map((residency) => { const bookingCount = selected.upcomingBookings.filter((booking) => booking.residencyId === residency.id).length; const outsideExclusiveResidency = Boolean(selected.exclusiveResidencyId && selected.exclusiveResidencyId !== residency.id); return <label className={outsideExclusiveResidency ? "disabled" : ""} key={residency.id}><input type="checkbox" checked={residencySelection.has(residency.id)} disabled={outsideExclusiveResidency} onChange={() => setResidencySelection((current) => { const next = new Set(current); if (next.has(residency.id)) next.delete(residency.id); else next.add(residency.id); return next; })} /><span><strong>{residency.name}</strong><small>{outsideExclusiveResidency ? "Unavailable — artist is exclusive elsewhere" : residency.cityState || "Location not set"}{bookingCount ? ` · ${bookingCount} upcoming booking${bookingCount === 1 ? "" : "s"}` : ""}</small></span></label>; })}{!residencies.length ? <p className="artist-section-empty">No active Residencies are available yet.</p> : null}</div>{rosterState.status === "error" ? <p className="error" aria-live="polite">{rosterState.message}</p> : null}<p className="privacy-note">Client visibility only controls what the Residency sees. Removing visibility never deletes bookings, payout history, or invoices, and HFY can still staff the artist.</p></div>
      <footer className="artist-editor-actions"><button className="button secondary" type="button" onClick={() => setManagingResidencies(false)}>Cancel</button><button className="button" type="button" onClick={saveResidencies} disabled={rosterPending}>{rosterPending ? "Saving…" : "Save Visibility"}</button></footer>
    </div></aside></div> : null}
  </>} />;
}
