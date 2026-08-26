"use client";

import { useActionState, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { changeAssignmentPaidDateAction, markAssignmentPaidAction, type ResidencyActionState } from "@/app/app/actions";
import { Status } from "@/components/format";
import type { getPayoutQueue } from "@/data/internal";

type PayoutRow = Awaited<ReturnType<typeof getPayoutQueue>>[number];
type PayoutTab = "ready" | "paid" | "needs_rate" | "na" | "all";
type SortField = "date" | "compensation";
type SortDirection = "asc" | "desc";
const initialActionState: ResidencyActionState = { status: "idle", message: "" };

const tabs: Array<{ id: PayoutTab; label: string }> = [
  { id: "ready", label: "Ready to Pay" },
  { id: "paid", label: "Paid" },
  { id: "needs_rate", label: "Needs Rate" },
  { id: "na", label: "N/A" },
  { id: "all", label: "All records" },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function dateLabel(value: string | Date | null, timeZone?: string) {
  if (!value) return "Not paid yet";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", ...(timeZone ? { timeZone } : {}) }).format(date);
}

function dateInputValue(value: Date | null, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(formatter.formatToParts(value ? new Date(value) : new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isNeedsRate(row: PayoutRow) {
  return row.payoutStatus === "not_ready"
    && row.bookingStatus === "completed"
    && row.compensationType !== "na"
    && row.totalCompensationCents === 0;
}

function matchesTab(row: PayoutRow, tab: PayoutTab) {
  if (tab === "ready") return row.payoutStatus === "ready_to_pay";
  if (tab === "paid") return row.payoutStatus === "paid";
  if (tab === "needs_rate") return isNeedsRate(row);
  if (tab === "na") return row.payoutStatus === "na";
  return true;
}

function displayStatus(row: PayoutRow) {
  return isNeedsRate(row) ? "needs_rate" : row.payoutStatus;
}

function paymentDetails(row: PayoutRow) {
  const method = row.paymentMethod?.trim();
  const methodName = method || (row.zellePhone || row.zelleEmail ? "Zelle" : row.paymentLastFour ? "ACH" : "Payment details");
  const normalized = methodName.toLowerCase();
  if (normalized.includes("zelle")) return `${methodName} - ${row.zellePhone || row.zelleEmail || row.talentPhone || "details missing"}`;
  if (normalized.includes("ach") && row.paymentLastFour) return `${methodName} - ending ${row.paymentLastFour}`;
  if (row.zellePhone || row.zelleEmail) return `${methodName} - ${row.zellePhone || row.zelleEmail}`;
  if (row.talentPhone) return `${methodName} - ${row.talentPhone}`;
  return method || "Not configured";
}

function compensationLabel(row: PayoutRow) {
  if (row.compensationType === "na") return "N/A";
  if (row.compensationType === "fixed") return "Fixed fee";
  return `${money(row.talentRateCents)}/hr${row.talentRateOverrideCents !== null ? " · override" : ""}`;
}

function MarkPaidForm({ assignmentId, compact = false }: { assignmentId: string; compact?: boolean }) {
  const [state, action, pending] = useActionState(markAssignmentPaidAction, initialActionState);
  return <form action={action} className={`payout-mark-form ${compact ? "compact" : ""}`} onClick={(event: MouseEvent) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <input name="assignmentId" type="hidden" value={assignmentId} />
    <button className="button lime" type="submit" disabled={pending}>{pending ? "Marking…" : "Mark paid"}</button>
    {state.status === "error" ? <span className="error" aria-live="polite">{state.message}</span> : null}
  </form>;
}

function ChangePaidDate({ row }: { row: PayoutRow }) {
  const [editing, setEditing] = useState(false);
  const savePaidDate = async (previous: ResidencyActionState, formData: FormData) => {
    const result = await changeAssignmentPaidDateAction(previous, formData);
    if (result.status === "success") setEditing(false);
    return result;
  };
  const [state, action, pending] = useActionState(savePaidDate, initialActionState);

  if (!editing) return <div className="payout-paid-date-line"><strong>{dateLabel(row.paidAt, row.residencyTimezone)}</strong><button type="button" onClick={() => setEditing(true)}>Change date</button></div>;
  return <form action={action} className="payout-date-form">
    <input name="assignmentId" type="hidden" value={row.id} />
    <input aria-label="Paid date" name="paidAt" type="date" defaultValue={dateInputValue(row.paidAt, row.residencyTimezone)} required />
    <button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save date"}</button>
    <button className="button secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
    {state.status === "error" ? <span className="error" aria-live="polite">{state.message}</span> : null}
  </form>;
}

export function PayoutsWorkspace({ rows }: { rows: PayoutRow[] }) {
  const [tab, setTab] = useState<PayoutTab>("ready");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setSelectedId(null); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedId]);

  const tabCounts = useMemo(() => Object.fromEntries(tabs.map((item) => [item.id, rows.filter((row) => matchesTab(row, item.id)).length])) as Record<PayoutTab, number>, [rows]);
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => matchesTab(row, tab))
      .filter((row) => !normalized || row.talentName?.toLowerCase().includes(normalized) || row.talentFullName?.toLowerCase().includes(normalized))
      .filter((row) => {
        const relevantDate = tab === "paid" && row.paidAt ? dateInputValue(row.paidAt, row.residencyTimezone) : row.serviceDate;
        return (!dateFrom || relevantDate >= dateFrom) && (!dateTo || relevantDate <= dateTo);
      })
      .sort((left, right) => {
        if (tab === "paid") {
          const leftPaidDate = left.paidAt ? dateInputValue(left.paidAt, left.residencyTimezone) : "";
          const rightPaidDate = right.paidAt ? dateInputValue(right.paidAt, right.residencyTimezone) : "";
          const paidDateDifference = rightPaidDate.localeCompare(leftPaidDate);
          if (paidDateDifference) return paidDateDifference;
          if (sortField === "compensation") {
            const compensationDifference = left.totalCompensationCents - right.totalCompensationCents;
            return sortDirection === "asc" ? compensationDifference : -compensationDifference;
          }
          return left.serviceDate.localeCompare(right.serviceDate);
        }
        const difference = sortField === "date"
          ? left.serviceDate.localeCompare(right.serviceDate)
          : left.totalCompensationCents - right.totalCompensationCents;
        return sortDirection === "asc" ? difference : -difference;
      });
  }, [dateFrom, dateTo, query, rows, sortDirection, sortField, tab]);
  const paidGroups = useMemo(() => {
    if (tab !== "paid") return [];
    const groups = new Map<string, PayoutRow[]>();
    for (const row of filteredRows) {
      const key = row.paidAt ? dateInputValue(row.paidAt, row.residencyTimezone) : "date-missing";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups].map(([date, groupRows]) => ({
      date,
      rows: groupRows,
      totalCents: groupRows.reduce((sum, row) => sum + (row.paidAmountCents ?? row.totalCompensationCents), 0),
    }));
  }, [filteredRows, tab]);

  function openRow(rowId: string) {
    setSelectedId(rowId);
  }

  function changeTab(nextTab: PayoutTab) {
    setTab(nextTab);
    setSelectedId(null);
    setSortField("date");
    setSortDirection(nextTab === "paid" ? "desc" : "asc");
  }

  function handleRowKey(event: KeyboardEvent<HTMLElement>, rowId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openRow(rowId);
    }
  }

  function payoutRow(row: PayoutRow) {
    return <article className={`payout-list-row ${selectedId === row.id ? "selected" : ""}`} role="button" tabIndex={0} aria-label={`Open payout for ${row.talentName || "open slot"}`} onClick={() => openRow(row.id)} onKeyDown={(event) => handleRowKey(event, row.id)} key={row.id}>
      <div className="payout-artist-cell"><strong>{row.talentName || "Open slot"}</strong><small>{row.talentFullName || row.talentEmail || "Person not linked"}</small></div>
      <time className="payout-date-cell" dateTime={row.serviceDate}>{dateLabel(row.serviceDate)}</time>
      <div className="payout-assignment-cell"><strong>{row.shiftName}</strong><small>{row.residencyName} · {compensationLabel(row)}</small></div>
      <div className="payout-payment-cell">{paymentDetails(row)}</div>
      <strong className="payout-amount-cell">{money(row.totalCompensationCents)}</strong>
      <div className="payout-status-cell"><Status value={displayStatus(row)} />{row.payoutStatus === "paid" && row.paidAt ? <small>{dateLabel(row.paidAt, row.residencyTimezone)}</small> : null}</div>
      <div className="payout-action-cell">{row.payoutStatus === "ready_to_pay" ? <MarkPaidForm assignmentId={row.id} compact /> : <span>View details →</span>}</div>
    </article>;
  }

  return <>
    <nav className="payout-tabs" aria-label="Payout status views">{tabs.map((item) => <button className={tab === item.id ? "active" : ""} type="button" onClick={() => changeTab(item.id)} key={item.id}><span>{item.label}</span><strong>{tabCounts[item.id]}</strong></button>)}</nav>

    <section className="payout-filter-bar" aria-label="Payout filters">
      <div className="field payout-search"><label htmlFor="payout-artist-search">Artist</label><input id="payout-artist-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search artist name" /></div>
      <div className="payout-date-range"><div className="field"><label htmlFor="payout-date-from">From</label><input id="payout-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div><div className="field"><label htmlFor="payout-date-to">To</label><input id="payout-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div></div>
      <div className="field payout-sort"><label htmlFor="payout-sort">Sort by</label><select id="payout-sort" value={sortField} onChange={(event) => setSortField(event.target.value as SortField)}><option value="date">{tab === "paid" ? "Paid Date" : "Date"}</option><option value="compensation">Total Compensation</option></select></div>
      <button className="payout-sort-direction" type="button" aria-label={tab === "paid" && sortField === "date" ? "Most recent paid date first" : `Sort ${sortDirection === "asc" ? "descending" : "ascending"}`} disabled={tab === "paid" && sortField === "date"} onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}><span aria-hidden="true">{tab === "paid" && sortField === "date" ? "↓" : sortDirection === "asc" ? "↑" : "↓"}</span>{tab === "paid" && sortField === "date" ? "Recent first" : sortDirection === "asc" ? "Ascending" : "Descending"}</button>
    </section>

    <div className={`payout-workspace-shell ${selected ? "detail-open" : ""}`}>
      <section className="payout-list-panel">
        <div className="payout-list-heading"><span>Artist</span><span>Service date</span><span>Assignment</span><span>Live payment details</span><span>Amount</span><span>Status</span><span>Action</span></div>
        <div className="payout-list">{tab === "paid" ? paidGroups.map((group) => <section className="payout-paid-group" key={group.date}><header className="payout-paid-group-heading"><div><strong>{group.date === "date-missing" ? "Paid date missing" : dateLabel(group.date)}</strong><span>{group.rows.length} payout{group.rows.length === 1 ? "" : "s"} in this session</span></div><strong>{money(group.totalCents)}</strong></header>{group.rows.map(payoutRow)}</section>) : filteredRows.map(payoutRow)}{!filteredRows.length ? <div className="empty payout-list-empty">No payouts match this view.</div> : null}</div>
      </section>
    </div>

    {selected ? <div className="payout-detail-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedId(null); }}><aside className="payout-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="payout-summary-title"><header className="payout-detail-drawer-heading"><div><p className="eyebrow">Payout</p><h2 id="payout-summary-title">Payout Summary</h2></div><button className="quick-modal-close" type="button" aria-label="Close payout summary" onClick={() => setSelectedId(null)}>×</button></header><div className="payout-detail-scroll">
      <header className="payout-detail-header"><div><h2>{selected.shiftName}</h2><p>{selected.residencyName} · {dateLabel(selected.serviceDate)}</p></div><Status value={displayStatus(selected)} /></header>
      <section className="payout-total-card"><span>Total Compensation</span><strong>{money(selected.totalCompensationCents)}</strong><small>{compensationLabel(selected)}</small></section>
      <section className="payout-detail-section"><p className="eyebrow">Talent / Person</p><h3>{selected.talentName || "Open slot"}</h3><dl><div><dt>Full name</dt><dd>{selected.talentFullName || "Not provided"}</dd></div><div><dt>Email</dt><dd>{selected.talentEmail || "Not provided"}</dd></div></dl></section>
      <section className="payout-detail-section"><p className="eyebrow">Live Payment Details</p><h3>{paymentDetails(selected)}</h3><dl><div><dt>Phone</dt><dd>{selected.zellePhone || selected.talentPhone || "Not provided"}</dd></div><div><dt>Method</dt><dd>{selected.paymentMethod || "Not configured"}</dd></div></dl></section>
      <section className="payout-detail-section"><p className="eyebrow">Payout Status</p><div className="payout-detail-status"><Status value={displayStatus(selected)} />{selected.paymentReference ? <span>{selected.paymentReference}</span> : null}</div></section>
      <section className="payout-detail-section"><p className="eyebrow">Paid Date</p>{selected.payoutStatus === "paid" ? <ChangePaidDate row={selected} /> : <strong className="payout-not-paid">Not paid yet</strong>}</section>
      {selected.payoutStatus === "ready_to_pay" ? <div className="payout-detail-action"><MarkPaidForm assignmentId={selected.id} /><p>Marks this payout Paid and records today as the Paid Date.</p></div> : null}
    </div></aside></div> : null}
  </>;
}
