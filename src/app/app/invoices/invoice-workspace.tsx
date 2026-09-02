"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createResidencyInvoiceAction, updateResidencyInvoiceSettingsAction, type ResidencyActionState } from "../actions";
import { retryInvoiceSendAction } from "./actions";
import { InvoiceApprovalButton } from "./invoice-approval-button";
import { PrivateValue, PrivacyPdfLink, SensitiveInput } from "@/components/privacy-mode";
import { WorkspaceSurface } from "@/components/workspace-surface";

const initialState: ResidencyActionState = { status: "idle", message: "" };
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  kind: "scheduled_period" | "custom";
  billingPeriodStart: string;
  billingPeriodEnd: string;
  status: string;
  totalCents: number;
  calculatedTotalCents: number;
  calculatedHours: number;
  varianceCents: number;
  talentCostCents: number;
  grossMarginCents: number;
  marginPercentage: number | null;
  balanceCents: number;
  pdfStoragePath: string | null;
  deliveryStatus: string | null;
  autoSendInvoices: boolean;
  autoSendReason: string;
};

type ResidencySettings = {
  id: string;
  name: string;
  tier: "operations_only" | "complete";
  timezone: string;
  billingContactName: string;
  billingContactEmail: string;
  billingAddress: string;
  invoicePrefix: string;
  paymentTermsDays: number;
  invoiceFrequency: string;
  billingCycleStartWeekday: number;
  billingCycleLengthDays: number;
  invoiceLinePresentation: "service_detail" | "daily_summary" | "period_summary";
  defaultInvoiceNote: string;
  autoSendInvoices: boolean;
  autoSendReason: string;
};

type EligibleShift = {
  id: string;
  name: string;
  serviceDate: string;
  room: string;
  startsAt: string;
  endsAt: string;
  clientRateCents: number;
  hours: number;
  amountCents: number;
};

type ManualLine = { id: string; serviceDate: string; description: string; quantity: string; unitLabel: string; unitAmount: string };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function time(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

function Status({ value }: { value: string }) {
  return <span className={`status ${value}`}>{value.replaceAll("_", " ")}</span>;
}

export function InvoiceWorkspace({
  rows,
  residency,
  eligibleShifts,
  defaultInvoiceNumber,
}: {
  rows: InvoiceRow[];
  residency: ResidencySettings;
  eligibleShifts: EligibleShift[];
  defaultInvoiceNumber: string;
}) {
  const router = useRouter();
  const fullProgramming = residency.tier === "complete";
  const [view, setView] = useState<"invoices" | "setup">("invoices");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [kind, setKind] = useState<"scheduled_period" | "custom">("scheduled_period");
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  const [manualLines, setManualLines] = useState<ManualLine[]>([
    { id: "custom-line-1", serviceDate: "", description: "", quantity: "1", unitLabel: "service", unitAmount: "" },
  ]);
  const [createState, createAction, createPending] = useActionState(createResidencyInvoiceAction, initialState);
  const [settingsState, settingsAction, settingsPending] = useActionState(updateResidencyInvoiceSettingsAction, initialState);
  const firstShiftDate = eligibleShifts[0]?.serviceDate ?? new Date().toISOString().slice(0, 10);
  const lastShiftDate = eligibleShifts.at(-1)?.serviceDate ?? firstShiftDate;
  const periodStart = fullProgramming ? `${firstShiftDate.slice(0, 7)}-01` : firstShiftDate;
  const periodEnd = fullProgramming
    ? new Date(Date.UTC(Number(firstShiftDate.slice(0, 4)), Number(firstShiftDate.slice(5, 7)), 0)).toISOString().slice(0, 10)
    : lastShiftDate;
  const invoiceEligibleShifts = fullProgramming ? eligibleShifts.filter((shift) => shift.serviceDate.startsWith(firstShiftDate.slice(0, 7))) : eligibleShifts;
  const selectedTotal = useMemo(() => invoiceEligibleShifts.filter((shift) => selectedShiftIds.includes(shift.id)).reduce((sum, shift) => sum + shift.amountCents, 0), [invoiceEligibleShifts, selectedShiftIds]);
  const customTotal = useMemo(() => manualLines.reduce((sum, line) => sum + Math.round((Number(line.quantity) || 0) * (Number(line.unitAmount) || 0) * 100), 0), [manualLines]);

  useEffect(() => {
    if (createState.status === "success") {
      router.refresh();
      const timer = window.setTimeout(() => {
        setDrawerOpen(false);
        setSelectedShiftIds([]);
        setManualLines([{ id: crypto.randomUUID(), serviceDate: "", description: "", quantity: "1", unitLabel: "service", unitAmount: "" }]);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [createState.status, router]);
  useEffect(() => { if (settingsState.status === "success") router.refresh(); }, [settingsState.status, router]);

  const manualPayload = JSON.stringify(manualLines.map(({ serviceDate, description, quantity, unitLabel, unitAmount }) => ({ serviceDate, description, quantity, unitLabel, unitAmount })));

  return <WorkspaceSurface className="invoice-workspace workspace-surface-invoices workspace-surface-invoice-manager">
    <header className="page-header invoice-page-header card">
      <div><p className="eyebrow">{residency.name} · HFY talent receivables</p><h1>Owed to Us</h1><p className="subhead">Create and deliver HFY Talent Invoices. Platform subscription billing stays separate in Developer.</p></div>
      <div className="invoice-header-actions"><button className="button secondary" type="button" onClick={() => setView("setup")}>Invoice setup</button><button className="button" type="button" onClick={() => { if (fullProgramming) { setKind("scheduled_period"); setSelectedShiftIds(invoiceEligibleShifts.map((shift) => shift.id)); } setDrawerOpen(true); }}>Create invoice</button></div>
    </header>

    <nav className="invoice-tabs" aria-label="Invoice workspace"><button className={view === "invoices" ? "active" : ""} type="button" onClick={() => setView("invoices")}>Invoices</button><button className={view === "setup" ? "active" : ""} type="button" onClick={() => setView("setup")}>Invoice setup</button></nav>

    {view === "setup" ? <form action={settingsAction} className="card invoice-settings-form">
      <input name="residencyId" type="hidden" value={residency.id} />
      <div className="invoice-settings-heading"><div><p className="eyebrow">Residency billing rules</p><h2>{residency.name} Invoice setup</h2></div><p className="subhead">These settings apply only to this Residency. HFY&apos;s company name, logo, address, and billing email remain company-wide.</p></div>
      <section className="invoice-settings-section"><h3>Bill to</h3><div className="form-grid two"><div className="field"><label>Billing contact name</label><input name="billingContactName" defaultValue={residency.billingContactName} required /></div><div className="field"><label>Billing contact email</label><input name="billingContactEmail" type="email" defaultValue={residency.billingContactEmail} required /></div></div><div className="field"><label>Billing address</label><textarea name="billingAddress" rows={3} defaultValue={residency.billingAddress} /></div></section>
      <section className="invoice-settings-section"><h3>Invoice format</h3><div className="form-grid three"><div className="field"><label>Invoice prefix</label><input name="invoicePrefix" defaultValue={residency.invoicePrefix} required /></div><div className="field"><label>Payment terms (days)</label><input name="paymentTermsDays" type="number" min="0" max="365" defaultValue={residency.paymentTermsDays} required /></div><div className="field"><label>Line-item detail</label><select name="invoiceLinePresentation" defaultValue={residency.invoiceLinePresentation}><option value="service_detail">Each scheduled service</option><option value="daily_summary">One summary per date</option><option value="period_summary">One billing-period summary</option></select></div></div><div className="field"><label>Default client note</label><textarea name="defaultInvoiceNote" rows={3} defaultValue={residency.defaultInvoiceNote} placeholder="Thank you for your business." /></div></section>
      <section className="invoice-settings-section"><h3>Billing cycle</h3>{fullProgramming ? <><input name="invoiceFrequency" type="hidden" value="monthly" /><input name="billingCycleStartWeekday" type="hidden" value={residency.billingCycleStartWeekday} /><input name="billingCycleLengthDays" type="hidden" value="31" /><div className="full-programming-notice"><strong>Monthly in advance</strong><p>Full Programming talent billing locks one complete service month at a time. Later schedule changes carry to the next HFY Talent Invoice as adjustments.</p></div></> : <div className="form-grid three"><div className="field"><label>Frequency</label><select name="invoiceFrequency" defaultValue={residency.invoiceFrequency}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="manual">As needed / manual</option></select></div><div className="field"><label>Cycle starts</label><select name="billingCycleStartWeekday" defaultValue={residency.billingCycleStartWeekday}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></div><div className="field"><label>Cycle length (days)</label><input name="billingCycleLengthDays" type="number" min="1" max="31" defaultValue={residency.billingCycleLengthDays} required /></div></div>}</section>
      <section className="invoice-settings-section"><h3>Delivery</h3><label className="invoice-toggle"><input name="autoSendInvoices" type="checkbox" defaultChecked={residency.autoSendInvoices} /><span><strong>Automatically send after successful approval</strong><small>Approval still fails closed unless the PDF validates and stores successfully.</small></span></label><div className="field"><label>Manual-delivery note</label><input name="autoSendReason" defaultValue={residency.autoSendReason} placeholder="Manual send while billing structure is in flux" /></div></section>
      <div className="invoice-form-footer"><button className="button secondary" type="button" onClick={() => setView("invoices")}>Back to Invoices</button><button className="button" disabled={settingsPending} type="submit">{settingsPending ? "Saving…" : "Save Invoice setup"}</button></div>
      {settingsState.message ? <p aria-live="polite" className={settingsState.status === "error" ? "error" : "success"}>{settingsState.message}</p> : null}
    </form> : <div className="table-wrap invoice-table"><table><thead><tr><th>Invoice</th><th>Type</th><th>Period</th><th>Client total</th><th>Internal talent cost</th><th>Internal margin</th><th>Status</th><th>Delivery</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.invoiceNumber}</strong></td><td>{row.kind === "custom" ? "Custom" : "Scheduled services"}</td><td>{date(row.billingPeriodStart)}–{date(row.billingPeriodEnd)}</td><td><strong><PrivateValue>{money(row.totalCents)}</PrivateValue></strong><div className="privacy-note">{row.kind === "scheduled_period" ? `${row.calculatedHours.toFixed(1)} billed hours` : "Custom line items"}</div></td><td><PrivateValue>{money(row.talentCostCents)}</PrivateValue></td><td><PrivateValue>{money(row.grossMarginCents)}</PrivateValue><div className="privacy-note"><PrivateValue>{row.marginPercentage === null ? "—" : `${row.marginPercentage.toFixed(1)}%`}</PrivateValue></div></td><td><Status value={row.status} /></td><td>{row.autoSendInvoices ? (row.deliveryStatus ? <Status value={row.deliveryStatus} /> : "Awaiting approval") : <><Status value="manual" /><div className="privacy-note">{row.autoSendReason || "Manual send"}</div></>}</td><td className="invoice-action-cell">{row.status === "draft" ? <InvoiceApprovalButton invoiceId={row.id} autoSend={row.autoSendInvoices} /> : null}{row.pdfStoragePath && row.status !== "draft" ? <PrivacyPdfLink className="button secondary" href={`/app/invoices/${row.id}/pdf`}>Download PDF</PrivacyPdfLink> : null}{row.status === "approved" && row.deliveryStatus === "failed" ? <form action={retryInvoiceSendAction}><input name="invoiceId" type="hidden" value={row.id} /><button className="button" type="submit">Retry send</button></form> : null}</td></tr>)}</tbody></table>{!rows.length ? <div className="empty">No Invoices yet. Create the first Draft when you&apos;re ready.</div> : null}</div>}

    {drawerOpen ? <div className="invoice-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}><aside className="invoice-drawer" role="dialog" aria-modal="true" aria-labelledby="create-invoice-title"><div className="invoice-drawer-heading"><div><p className="eyebrow">New Draft</p><h2 id="create-invoice-title">Create invoice</h2></div><button className="drawer-close" type="button" aria-label="Close" onClick={() => setDrawerOpen(false)}>×</button></div>
      <form action={createAction} className="invoice-create-form">
        <input name="residencyId" type="hidden" value={residency.id} /><input name="kind" type="hidden" value={kind} /><input name="manualLinesJson" type="hidden" value={manualPayload} />
        <div className="invoice-kind-switch"><button className={kind === "scheduled_period" ? "active" : ""} type="button" onClick={() => setKind("scheduled_period")}><strong>{fullProgramming ? "Monthly HFY Talent Invoice" : "Scheduled services"}</strong><small>{fullProgramming ? "Lock every billable talent service for one complete month." : "Select calendar Shifts and use their locked hours and client rates."}</small></button>{!fullProgramming ? <button className={kind === "custom" ? "active" : ""} type="button" onClick={() => setKind("custom")}><strong>Custom invoice</strong><small>Create client-facing items without touching the Shift coverage chain.</small></button> : null}</div>
        <div className="form-grid two"><div className="field"><label>Invoice number</label><input name="invoiceNumber" defaultValue={defaultInvoiceNumber} required /></div><div className="field"><label>Invoice date</label><input name="invoiceDate" type="date" defaultValue={fullProgramming ? periodStart : new Date().toISOString().slice(0, 10)} max={fullProgramming ? periodStart : undefined} required /></div></div>
        <div className="form-grid two"><div className="field"><label>Period start</label><input name="billingPeriodStart" type="date" defaultValue={periodStart} readOnly={fullProgramming} required /></div><div className="field"><label>Period end</label><input name="billingPeriodEnd" type="date" defaultValue={periodEnd} readOnly={fullProgramming} required /></div></div>
        {kind === "scheduled_period" ? <section className="invoice-picker"><div className="invoice-section-heading"><div><h3>{fullProgramming ? "Locked monthly talent schedule" : "Eligible scheduled services"}</h3><p className="muted">{fullProgramming ? "Every unlinked billable talent service in this month is included. Pending carry-forward adjustments are added automatically." : "Only unlinked, billable Shifts appear here."}</p></div><strong><PrivateValue>{money(selectedTotal)}</PrivateValue></strong></div><div className="invoice-shift-list">{invoiceEligibleShifts.map((shift) => <label className={`invoice-shift-option ${selectedShiftIds.includes(shift.id) ? "selected" : ""}`} key={shift.id}><input name="shiftIds" type="checkbox" value={shift.id} checked={selectedShiftIds.includes(shift.id)} onChange={(event) => { if (!fullProgramming) setSelectedShiftIds((current) => event.target.checked ? [...current, shift.id] : current.filter((id) => id !== shift.id)); }} /><span><strong>{date(shift.serviceDate)} · {shift.name}</strong><small>{shift.room} · {time(shift.startsAt, residency.timezone)}–{time(shift.endsAt, residency.timezone)} · {shift.hours.toFixed(1)} hours × <PrivateValue>{money(shift.clientRateCents)}</PrivateValue></small></span><b><PrivateValue>{money(shift.amountCents)}</PrivateValue></b></label>)}{!invoiceEligibleShifts.length ? <div className="empty">No unlinked scheduled services are ready to Invoice.</div> : null}</div></section> : <section className="invoice-picker"><div className="invoice-section-heading"><div><h3>Custom client line items</h3><p className="muted">These items stay separate from all scheduled Shifts.</p></div><strong><PrivateValue>{money(customTotal)}</PrivateValue></strong></div><div className="custom-invoice-lines">{manualLines.map((line, index) => <div className="custom-invoice-line" key={line.id}><div className="custom-line-number">{String(index + 1).padStart(2, "0")}</div><div className="form-grid custom-line-grid"><div className="field custom-line-date"><label>Service date (optional)</label><input type="date" value={line.serviceDate} onChange={(event) => setManualLines((current) => current.map((item) => item.id === line.id ? { ...item, serviceDate: event.target.value } : item))} /></div><div className="field custom-line-description"><label>Description</label><input value={line.description} onChange={(event) => setManualLines((current) => current.map((item) => item.id === line.id ? { ...item, description: event.target.value } : item))} required /></div><div className="field"><label>Qty</label><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setManualLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: event.target.value } : item))} required /></div><div className="field"><label>Unit</label><input value={line.unitLabel} onChange={(event) => setManualLines((current) => current.map((item) => item.id === line.id ? { ...item, unitLabel: event.target.value } : item))} required /></div><div className="field"><label>Rate ($)</label><SensitiveInput type="number" min="0" step="0.01" value={line.unitAmount} onChange={(event) => setManualLines((current) => current.map((item) => item.id === line.id ? { ...item, unitAmount: event.target.value } : item))} required /></div></div>{manualLines.length > 1 ? <button className="custom-line-remove" type="button" onClick={() => setManualLines((current) => current.filter((item) => item.id !== line.id))}>Remove</button> : null}</div>)}</div><button className="button secondary" type="button" onClick={() => setManualLines((current) => [...current, { id: crypto.randomUUID(), serviceDate: "", description: "", quantity: "1", unitLabel: "service", unitAmount: "" }])}>Add line item</button></section>}
        <div className="field"><label>Client-facing note (optional)</label><textarea name="notes" rows={3} defaultValue={residency.defaultInvoiceNote} /></div>
        <p className="privacy-note">Saving creates a Draft only. Talent cost and gross margin remain internal and never appear on the client PDF.</p>
        {createState.status === "error" ? <p className="error" aria-live="polite">{createState.message}</p> : null}
        <div className="invoice-form-footer"><button className="button secondary" type="button" onClick={() => setDrawerOpen(false)}>Cancel</button><button className="button" disabled={createPending || (kind === "scheduled_period" ? !selectedShiftIds.length : !manualLines.length)} type="submit">{createPending ? "Saving Draft…" : "Save Draft Invoice"}</button></div>
      </form>
    </aside></div> : null}
  </WorkspaceSurface>;
}
