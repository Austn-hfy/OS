"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { PayoutWorkspaceFrame } from "@/components/payout-workspace-frame";
import type { getResidencyClientPayoutStatus } from "@/data/residency-client";
import { ClientRateForm } from "./client-rate-form";

type Row = Awaited<ReturnType<typeof getResidencyClientPayoutStatus>>[number];
type PayoutTab = "outstanding" | "needs_rate" | "all";
type SortField = "date" | "amount";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function durationLabel(startsAt: string, endsAt: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return `${formatter.format(new Date(startsAt))}–${formatter.format(new Date(endsAt))}`;
}

export function ClientPayoutsWorkspace({ rows, residencyName, timeZone }: { rows: Row[]; residencyName: string; timeZone: string }) {
  const [tab, setTab] = useState<PayoutTab>("outstanding");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const tabs: Array<{ id: PayoutTab; label: string }> = [
    { id: "outstanding", label: "Outstanding" },
    { id: "needs_rate", label: "Needs Rate" },
    { id: "all", label: "All records" },
  ];
  const tabCounts = useMemo(() => ({
    outstanding: rows.filter((row) => row.owedCents !== null && row.owedCents > 0).length,
    needs_rate: rows.filter((row) => row.owedCents === null).length,
    all: rows.length,
  }), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (tab === "all") return true;
    if (tab === "needs_rate") return row.owedCents === null;
    return row.owedCents !== null && row.owedCents > 0;
  })
    .filter((row) => !query.trim() || row.artist.toLowerCase().includes(query.trim().toLowerCase()) || row.shiftName.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((row) => (!dateFrom || row.serviceDate >= dateFrom) && (!dateTo || row.serviceDate <= dateTo))
    .sort((left, right) => {
      const difference = sortField === "date" ? left.serviceDate.localeCompare(right.serviceDate) : (left.owedCents ?? -1) - (right.owedCents ?? -1);
      return sortDirection === "asc" ? difference : -difference;
    }), [dateFrom, dateTo, query, rows, sortDirection, sortField, tab]);

  useEffect(() => {
    if (!selected) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setSelectedId(null); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected]);

  function handleRowKey(event: KeyboardEvent<HTMLElement>, rowId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(rowId);
    }
  }

  return <PayoutWorkspaceFrame
    tabs={<nav className="payout-tabs" aria-label="Payout status views">{tabs.map((item) => <button className={tab === item.id ? "active" : ""} type="button" onClick={() => { setTab(item.id); setSelectedId(null); }} key={item.id}><span>{item.label}</span><strong>{tabCounts[item.id]}</strong></button>)}</nav>}
    filters={<section className="payout-filter-bar" aria-label="Payout filters">
      <div className="field payout-search"><label htmlFor="client-payout-artist-search">Artist</label><input id="client-payout-artist-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search artist or assignment" /></div>
      <div className="payout-date-range"><div className="field"><label htmlFor="client-payout-date-from">From</label><input id="client-payout-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div><div className="field"><label htmlFor="client-payout-date-to">To</label><input id="client-payout-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div></div>
      <div className="field payout-sort"><label htmlFor="client-payout-sort">Sort by</label><select id="client-payout-sort" value={sortField} onChange={(event) => setSortField(event.target.value as SortField)}><option value="date">Service date</option><option value="amount">Amount owed</option></select></div>
      <button className="payout-sort-direction" type="button" aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`} onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}><span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>{sortDirection === "asc" ? "Ascending" : "Descending"}</button>
    </section>}
    detailOpen={Boolean(selected)}
    list={<section className="payout-list-panel client-payout-list-panel">
      <div className="payout-list-heading"><span>Artist</span><span>Service date</span><span>Assignment</span><span>Rate</span><span>Amount</span><span>Status</span><span>Action</span></div>
      <div className="payout-list">{filteredRows.map((row) => <article className={`payout-list-row ${selectedId === row.id ? "selected" : ""}`} role="button" tabIndex={0} aria-label={`Open payout for ${row.artist}`} onClick={() => setSelectedId(row.id)} onKeyDown={(event) => handleRowKey(event, row.id)} key={row.id}>
        <div className="payout-artist-cell"><strong>{row.artist}</strong><small>{residencyName} artist</small></div>
        <time className="payout-date-cell" dateTime={row.serviceDate}>{dateLabel(row.serviceDate)}</time>
        <div className="payout-assignment-cell"><strong>{row.shiftName}</strong><small>{durationLabel(row.startsAt, row.endsAt, timeZone)}</small></div>
        <div className="payout-payment-cell">{row.effectiveRateCents === null ? "Rate needed" : `${money(row.effectiveRateCents)}/hr`}{row.overrideRateCents !== null ? " · override" : ""}</div>
        <strong className="payout-amount-cell">{row.owedCents === null ? "—" : money(row.owedCents)}</strong>
        <div className="payout-status-cell"><span className={`status ${row.owedCents === null ? "needs_rate" : "not_ready"}`}>{row.owedCents === null ? "needs rate" : "pending"}</span></div>
        <div className="payout-action-cell"><span>Review rate →</span></div>
      </article>)}{!filteredRows.length ? <div className="empty payout-list-empty">No payouts match this view.</div> : null}</div>
    </section>}
    drawer={selected ? <div className="payout-detail-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedId(null); }}><aside className="payout-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="client-payout-summary-title"><header className="payout-detail-drawer-heading"><div><p className="eyebrow">Payout</p><h2 id="client-payout-summary-title">Payout Summary</h2></div><button className="quick-modal-close" type="button" aria-label="Close payout summary" onClick={() => setSelectedId(null)}>×</button></header><div className="payout-detail-scroll">
      <header className="payout-detail-header"><div><h2>{selected.shiftName}</h2><p>{residencyName} · {dateLabel(selected.serviceDate)}</p></div><span className={`status ${selected.owedCents === null ? "needs_rate" : "not_ready"}`}>{selected.owedCents === null ? "needs rate" : "pending"}</span></header>
      <section className="payout-total-card"><span>Amount Owed</span><strong>{selected.owedCents === null ? "—" : money(selected.owedCents)}</strong><small>{durationLabel(selected.startsAt, selected.endsAt, timeZone)}{selected.effectiveRateCents === null ? " · rate needed" : ` · ${money(selected.effectiveRateCents)}/hr`}</small></section>
      <section className="payout-detail-section"><p className="eyebrow">Artist</p><h3>{selected.artist}</h3><dl><div><dt>Service date</dt><dd>{dateLabel(selected.serviceDate)}</dd></div><div><dt>Booking status</dt><dd>{selected.bookingStatus.replaceAll("_", " ")}</dd></div></dl></section>
      <section className="payout-detail-section"><p className="eyebrow">Rate for this date</p><ClientRateForm assignmentId={selected.id} defaultRateCents={selected.defaultRateCents} overrideRateCents={selected.overrideRateCents} /></section>
      <p className="privacy-note">This is {residencyName}’s client-managed artist ledger. HFY artist costs, margins, banking details, and other Residencies remain outside this view.</p>
    </div></aside></div> : null}
  />;
}
