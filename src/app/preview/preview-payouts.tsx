"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";

type PreviewPayoutStatus = "not_ready" | "ready_to_pay" | "paid" | "na";
type PreviewPayout = {
  id: string;
  artistName: string;
  fullName: string;
  email: string;
  phone: string;
  residencyName: string;
  shiftName: string;
  serviceDate: string;
  compensationLabel: string;
  amountCents: number;
  payoutStatus: PreviewPayoutStatus;
  needsRate: boolean;
  paymentMethod: string;
  paymentDetails: string;
  paidAt: string | null;
  paymentReference: string;
};

type Tab = "ready" | "paid" | "needs_rate" | "na" | "all";
const tabOptions: Array<{ id: Tab; label: string }> = [
  { id: "ready", label: "Ready to Pay" },
  { id: "paid", label: "Paid" },
  { id: "needs_rate", label: "Needs Rate" },
  { id: "na", label: "N/A" },
  { id: "all", label: "All records" },
];

const initialRows: PreviewPayout[] = [
  { id: "preview-sol", artistName: "Sol Selects", fullName: "Sol Rivera", email: "sol@example.com", phone: "(760) 660-2504", residencyName: "Ace Hotel", shiftName: "Pool", serviceDate: "2026-08-22", compensationLabel: "$80/hr · 7 hours", amountCents: 56000, payoutStatus: "ready_to_pay", needsRate: false, paymentMethod: "Zelle", paymentDetails: "Zelle - (760) 660-2504", paidAt: null, paymentReference: "" },
  { id: "preview-elaine", artistName: "Elaine", fullName: "Elaine Hart", email: "elaine@example.com", phone: "(323) 555-0142", residencyName: "Ace Hotel", shiftName: "Amigo Room", serviceDate: "2026-08-16", compensationLabel: "$80/hr · 3 hours", amountCents: 24000, payoutStatus: "paid", needsRate: false, paymentMethod: "Zelle", paymentDetails: "Zelle - elaine@example.com", paidAt: "2026-08-18", paymentReference: "Zelle · HFY OS" },
  { id: "preview-maya-paid", artistName: "Maya Lane", fullName: "Maya Lane", email: "maya@example.com", phone: "(310) 555-0188", residencyName: "Ace Hotel", shiftName: "Pool", serviceDate: "2026-08-17", compensationLabel: "$80/hr · 4 hours", amountCents: 32000, payoutStatus: "paid", needsRate: false, paymentMethod: "ACH", paymentDetails: "ACH - ending 4821", paidAt: "2026-08-18", paymentReference: "ACH · HFY OS" },
  { id: "preview-maya", artistName: "Maya Lane", fullName: "Maya Lane", email: "maya@example.com", phone: "(310) 555-0188", residencyName: "Ace Hotel", shiftName: "Pool", serviceDate: "2026-08-15", compensationLabel: "Rate missing", amountCents: 0, payoutStatus: "not_ready", needsRate: true, paymentMethod: "ACH", paymentDetails: "ACH - ending 4821", paidAt: null, paymentReference: "" },
  { id: "preview-nico", artistName: "Nico Bloom", fullName: "Nico Bloom", email: "nico@example.com", phone: "(213) 555-0164", residencyName: "Ace Hotel", shiftName: "Movie Night", serviceDate: "2026-08-14", compensationLabel: "N/A", amountCents: 0, payoutStatus: "na", needsRate: false, paymentMethod: "N/A", paymentDetails: "No payment required", paidAt: null, paymentReference: "" },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function dateLabel(value: string | null) {
  return value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not paid yet";
}

function todayInPalmSprings() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function matchesTab(row: PreviewPayout, tab: Tab) {
  if (tab === "ready") return row.payoutStatus === "ready_to_pay";
  if (tab === "paid") return row.payoutStatus === "paid";
  if (tab === "needs_rate") return row.needsRate;
  if (tab === "na") return row.payoutStatus === "na";
  return true;
}

function PreviewPayoutStatus({ row }: { row: PreviewPayout }) {
  const value = row.needsRate ? "needs_rate" : row.payoutStatus;
  return <span className={`status ${value}`}>{value.replaceAll("_", " ")}</span>;
}

export function PreviewPayouts() {
  const [rows, setRows] = useState(initialRows);
  const [tab, setTab] = useState<Tab>("ready");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<"date" | "compensation">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [changingDate, setChangingDate] = useState(false);
  const [paidDateDraft, setPaidDateDraft] = useState("");
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const readyRows = rows.filter((row) => row.payoutStatus === "ready_to_pay");
  const readyTotal = readyRows.reduce((sum, row) => sum + row.amountCents, 0);
  const counts = Object.fromEntries(tabOptions.map((item) => [item.id, rows.filter((row) => matchesTab(row, item.id)).length])) as Record<Tab, number>;

  useEffect(() => {
    if (!selectedId) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedId]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => matchesTab(row, tab))
      .filter((row) => !normalized || row.artistName.toLowerCase().includes(normalized) || row.fullName.toLowerCase().includes(normalized))
      .filter((row) => {
        const relevantDate = tab === "paid" && row.paidAt ? row.paidAt : row.serviceDate;
        return (!dateFrom || relevantDate >= dateFrom) && (!dateTo || relevantDate <= dateTo);
      })
      .sort((left, right) => {
        if (tab === "paid") {
          const paidDateDifference = (right.paidAt ?? "").localeCompare(left.paidAt ?? "");
          if (paidDateDifference) return paidDateDifference;
          if (sortField === "compensation") {
            const compensationDifference = left.amountCents - right.amountCents;
            return sortDirection === "asc" ? compensationDifference : -compensationDifference;
          }
          return left.serviceDate.localeCompare(right.serviceDate);
        }
        const difference = sortField === "date" ? left.serviceDate.localeCompare(right.serviceDate) : left.amountCents - right.amountCents;
        return sortDirection === "asc" ? difference : -difference;
      });
  }, [dateFrom, dateTo, query, rows, sortDirection, sortField, tab]);

  const paidGroups = useMemo(() => {
    if (tab !== "paid") return [];
    const groups = new Map<string, PreviewPayout[]>();
    for (const row of filteredRows) {
      const key = row.paidAt ?? "date-missing";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups].map(([date, groupRows]) => ({
      date,
      rows: groupRows,
      totalCents: groupRows.reduce((sum, row) => sum + row.amountCents, 0),
    }));
  }, [filteredRows, tab]);

  function openRow(rowId: string) {
    setSelectedId(rowId);
    setChangingDate(false);
  }

  function changeTab(nextTab: Tab) {
    setTab(nextTab);
    setSelectedId(null);
    setChangingDate(false);
    setSortField("date");
    setSortDirection(nextTab === "paid" ? "desc" : "asc");
  }

  function handleRowKey(event: KeyboardEvent<HTMLElement>, rowId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openRow(rowId);
    }
  }

  function markPaid(event: MouseEvent | null, rowId: string) {
    event?.stopPropagation();
    const today = todayInPalmSprings();
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, payoutStatus: "paid", paidAt: today, paymentReference: `${row.paymentMethod || "Manual"} · HFY OS` } : row));
  }

  function savePaidDate() {
    if (!selected || !paidDateDraft) return;
    setRows((current) => current.map((row) => row.id === selected.id ? { ...row, paidAt: paidDateDraft } : row));
    setChangingDate(false);
  }

  function payoutRow(row: PreviewPayout) {
    return <article className={`payout-list-row ${selectedId === row.id ? "selected" : ""}`} role="button" tabIndex={0} aria-label={`Open payout for ${row.artistName}`} onClick={() => openRow(row.id)} onKeyDown={(event) => handleRowKey(event, row.id)} key={row.id}>
      <div className="payout-artist-cell"><strong>{row.artistName}</strong><small>{row.fullName}</small></div>
      <time className="payout-date-cell" dateTime={row.serviceDate}>{dateLabel(row.serviceDate)}</time>
      <div className="payout-assignment-cell"><strong>{row.shiftName}</strong><small>{row.residencyName} · {row.compensationLabel}</small></div>
      <div className="payout-payment-cell">{row.paymentDetails}</div>
      <strong className="payout-amount-cell">{money(row.amountCents)}</strong>
      <div className="payout-status-cell"><PreviewPayoutStatus row={row} />{row.paidAt ? <small>{dateLabel(row.paidAt)}</small> : null}</div>
      <div className="payout-action-cell">{row.payoutStatus === "ready_to_pay" ? <button className="button lime" type="button" onClick={(event) => markPaid(event, row.id)} onKeyDown={(event) => event.stopPropagation()}>Mark paid</button> : <span>View details →</span>}</div>
    </article>;
  }

  return <>
    <header className="page-header payout-page-header"><div><p className="eyebrow">Ace Hotel</p><h1>Payouts</h1><p className="subhead"><strong>{money(readyTotal)}</strong> ready to pay across {readyRows.length} Assignment{readyRows.length === 1 ? "" : "s"}. Completed eligible work still enters this queue automatically.</p></div></header>
    <nav className="payout-tabs" aria-label="Payout status views">{tabOptions.map((item) => <button className={tab === item.id ? "active" : ""} type="button" onClick={() => changeTab(item.id)} key={item.id}><span>{item.label}</span><strong>{counts[item.id]}</strong></button>)}</nav>
    <section className="payout-filter-bar">
      <div className="field payout-search"><label htmlFor="preview-payout-search">Artist</label><input id="preview-payout-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search artist name" /></div>
      <div className="payout-date-range"><div className="field"><label htmlFor="preview-payout-from">From</label><input id="preview-payout-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div><div className="field"><label htmlFor="preview-payout-to">To</label><input id="preview-payout-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div></div>
      <div className="field payout-sort"><label htmlFor="preview-payout-sort">Sort by</label><select id="preview-payout-sort" value={sortField} onChange={(event) => setSortField(event.target.value as "date" | "compensation")}><option value="date">{tab === "paid" ? "Paid Date" : "Date"}</option><option value="compensation">Total Compensation</option></select></div>
      <button className="payout-sort-direction" type="button" aria-label={tab === "paid" && sortField === "date" ? "Most recent paid date first" : `Sort ${sortDirection === "asc" ? "descending" : "ascending"}`} disabled={tab === "paid" && sortField === "date"} onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}><span aria-hidden="true">{tab === "paid" && sortField === "date" ? "↓" : sortDirection === "asc" ? "↑" : "↓"}</span>{tab === "paid" && sortField === "date" ? "Recent first" : sortDirection === "asc" ? "Ascending" : "Descending"}</button>
    </section>
    <div className={`payout-workspace-shell ${selected ? "detail-open" : ""}`}>
      <section className="payout-list-panel">
        <div className="payout-list-heading"><span>Artist</span><span>Service date</span><span>Assignment</span><span>Live payment details</span><span>Amount</span><span>Status</span><span>Action</span></div>
        <div className="payout-list">{tab === "paid" ? paidGroups.map((group) => <section className="payout-paid-group" key={group.date}><header className="payout-paid-group-heading"><div><strong>{group.date === "date-missing" ? "Paid date missing" : dateLabel(group.date)}</strong><span>{group.rows.length} payout{group.rows.length === 1 ? "" : "s"} in this session</span></div><strong>{money(group.totalCents)}</strong></header>{group.rows.map(payoutRow)}</section>) : filteredRows.map(payoutRow)}{!filteredRows.length ? <div className="empty payout-list-empty">No payouts match this view.</div> : null}</div>
      </section>
    </div>

    {selected ? <div className="payout-detail-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedId(null); }}><aside className="payout-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="preview-payout-summary-title"><header className="payout-detail-drawer-heading"><div><p className="eyebrow">Payout</p><h2 id="preview-payout-summary-title">Payout Summary</h2></div><button className="quick-modal-close" type="button" aria-label="Close payout summary" onClick={() => setSelectedId(null)}>×</button></header><div className="payout-detail-scroll">
      <header className="payout-detail-header"><div><h2>{selected.shiftName}</h2><p>{selected.residencyName} · {dateLabel(selected.serviceDate)}</p></div><PreviewPayoutStatus row={selected} /></header>
      <section className="payout-total-card"><span>Total Compensation</span><strong>{money(selected.amountCents)}</strong><small>{selected.compensationLabel}</small></section>
      <section className="payout-detail-section"><p className="eyebrow">Talent / Person</p><h3>{selected.artistName}</h3><dl><div><dt>Full name</dt><dd>{selected.fullName}</dd></div><div><dt>Email</dt><dd>{selected.email}</dd></div></dl></section>
      <section className="payout-detail-section"><p className="eyebrow">Live Payment Details</p><h3>{selected.paymentDetails}</h3><dl><div><dt>Phone</dt><dd>{selected.phone}</dd></div><div><dt>Method</dt><dd>{selected.paymentMethod}</dd></div></dl></section>
      <section className="payout-detail-section"><p className="eyebrow">Payout Status</p><div className="payout-detail-status"><PreviewPayoutStatus row={selected} />{selected.paymentReference ? <span>{selected.paymentReference}</span> : null}</div></section>
      <section className="payout-detail-section"><p className="eyebrow">Paid Date</p>{selected.payoutStatus === "paid" ? changingDate ? <div className="payout-date-form"><input aria-label="Paid date" type="date" value={paidDateDraft} onChange={(event) => setPaidDateDraft(event.target.value)} /><button className="button" type="button" onClick={savePaidDate}>Save date</button><button className="button secondary" type="button" onClick={() => setChangingDate(false)}>Cancel</button></div> : <div className="payout-paid-date-line"><strong>{dateLabel(selected.paidAt)}</strong><button type="button" onClick={() => { setPaidDateDraft(selected.paidAt ?? todayInPalmSprings()); setChangingDate(true); }}>Change date</button></div> : <strong className="payout-not-paid">Not paid yet</strong>}</section>
      {selected.payoutStatus === "ready_to_pay" ? <div className="payout-detail-action"><button className="button lime" type="button" onClick={() => markPaid(null, selected.id)}>Mark paid</button><p>Marks this payout Paid and records today as the Paid Date.</p></div> : null}
    </div></aside></div> : null}
  </>;
}
