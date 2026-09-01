"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createLeadAction, updateLeadAction, type ResidencyActionState } from "../actions";

export const pipelineStatuses = [
  { value: "contacted", label: "Contacted" },
  { value: "call_scheduled", label: "Call Scheduled" },
  { value: "call_complete", label: "Call Complete" },
  { value: "discovery_scheduled", label: "Discovery Scheduled" },
  { value: "discovery_complete", label: "Discovery Complete" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
] as const;

type PipelineStatus = typeof pipelineStatuses[number]["value"];
type Lead = {
  id: string;
  companyName: string;
  primaryContactName: string;
  primaryContactPhone: string;
  primaryContactEmail: string;
  source: "inbound" | "outbound" | null;
  pipelineStatus: PipelineStatus;
  pipelineStatusChangedAt: string;
  notes: string;
  createdAt: string;
  daysInCurrentStatus: number;
};

const initialState: ResidencyActionState = { status: "idle", message: "" };
const statusLabel = (value: PipelineStatus) => pipelineStatuses.find((status) => status.value === value)?.label ?? value;

export function LeadsWorkspace({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<PipelineStatus | "all">("contacted");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const selected = leads.find((lead) => lead.id === selectedId) ?? null;
  const [statusDraft, setStatusDraft] = useState<PipelineStatus>("contacted");
  const [createState, createAction, createPending] = useActionState(createLeadAction, initialState);
  const [updateState, updateAction, updatePending] = useActionState(updateLeadAction, initialState);
  const visibleLeads = useMemo(() => tab === "all" ? leads : leads.filter((lead) => lead.pipelineStatus === tab), [leads, tab]);
  const counts = useMemo(() => Object.fromEntries(pipelineStatuses.map((status) => [status.value, leads.filter((lead) => lead.pipelineStatus === status.value).length])), [leads]);

  function openLead(lead: Lead) {
    setSelectedId(lead.id);
    setStatusDraft(lead.pipelineStatus);
  }

  useEffect(() => {
    if (createState.status !== "success") return;
    router.refresh();
    const timer = window.setTimeout(() => setNewLeadOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [createState.status, router]);

  useEffect(() => {
    if (updateState.status !== "success") return;
    router.refresh();
    const timer = window.setTimeout(() => setSelectedId(null), 0);
    return () => window.clearTimeout(timer);
  }, [updateState.status, router]);

  return <div className="leads-workspace">
    <header className="page-header card leads-page-header"><div><p className="eyebrow">HFY Pipeline</p><h1>Leads</h1><p className="subhead">Track every property from first contact through a signed program. Won Leads become Operations Residencies without losing their record or notes.</p></div><button className="button" type="button" onClick={() => setNewLeadOpen(true)}>+ New Lead</button></header>

    <nav className="pipeline-status-tabs" aria-label="Lead status">
      {pipelineStatuses.map((status) => <button className={tab === status.value ? "active" : ""} type="button" onClick={() => setTab(status.value)} key={status.value}><span>{status.label}</span><b>{counts[status.value] ?? 0}</b></button>)}
      <button className={tab === "all" ? "active" : ""} type="button" onClick={() => setTab("all")}><span>All</span><b>{leads.length}</b></button>
    </nav>

    <section className="card lead-list-shell">
      <div className="lead-list-header"><span>Company / property</span><span>Primary contact</span><span>Source</span><span>Time in status</span><span>Status</span></div>
      <div className="lead-list">{visibleLeads.map((lead) => <button className="lead-list-row" type="button" onClick={() => openLead(lead)} key={lead.id}><span><strong>{lead.companyName}</strong><small>{lead.primaryContactEmail || "Email not added"}</small></span><span><strong>{lead.primaryContactName}</strong><small>{lead.primaryContactPhone || "Phone not added"}</small></span><span><i className={`lead-source ${lead.source ?? "unknown"}`}>{lead.source ?? "Not set"}</i></span><span><strong>{lead.daysInCurrentStatus}</strong><small>day{lead.daysInCurrentStatus === 1 ? "" : "s"}</small></span><span><i className={`pipeline-status ${lead.pipelineStatus}`}>{statusLabel(lead.pipelineStatus)}</i></span></button>)}</div>
      {!visibleLeads.length ? <div className="empty">No Leads in {tab === "all" ? "Pipeline" : statusLabel(tab)}.</div> : null}
    </section>

    {newLeadOpen ? <div className="invoice-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewLeadOpen(false); }}><aside className="lead-drawer" role="dialog" aria-modal="true" aria-labelledby="new-lead-title"><div className="invoice-drawer-heading"><div><p className="eyebrow">Pipeline entry</p><h2 id="new-lead-title">New Lead</h2></div><button className="drawer-close" type="button" aria-label="Close" onClick={() => setNewLeadOpen(false)}>×</button></div><form action={createAction} className="lead-form"><div className="field"><label htmlFor="new-lead-company">Company / property name</label><input id="new-lead-company" name="companyName" autoFocus required /></div><div className="field"><label htmlFor="new-lead-contact">Primary contact name</label><input id="new-lead-contact" name="primaryContactName" required /></div><div className="form-grid two"><div className="field"><label htmlFor="new-lead-phone">Phone</label><input id="new-lead-phone" name="primaryContactPhone" type="tel" /></div><div className="field"><label htmlFor="new-lead-email">Email</label><input id="new-lead-email" name="primaryContactEmail" type="email" /></div></div><div className="field"><label htmlFor="new-lead-source">Source</label><select id="new-lead-source" name="source" defaultValue="inbound"><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></div><div className="field"><label htmlFor="new-lead-notes">Notes</label><textarea id="new-lead-notes" name="notes" rows={8} placeholder="Keep the full pre-signature history here: calls, discovery details, context, and follow-ups." /></div><div className="lead-entry-note"><strong>Starts in Contacted</strong><span>The Lead can move through the Pipeline from its detail panel.</span></div>{createState.message ? <p aria-live="polite" className={createState.status === "error" ? "error" : "success"}>{createState.message}</p> : null}<div className="invoice-form-footer"><button className="button secondary" type="button" onClick={() => setNewLeadOpen(false)}>Cancel</button><button className="button" disabled={createPending} type="submit">{createPending ? "Adding…" : "Add Lead"}</button></div></form></aside></div> : null}

    {selected ? <div className="lead-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><aside className="lead-detail-panel" role="dialog" aria-modal="true" aria-labelledby="lead-detail-title"><div className="invoice-drawer-heading"><div><p className="eyebrow">{statusLabel(selected.pipelineStatus)} · {selected.daysInCurrentStatus} day{selected.daysInCurrentStatus === 1 ? "" : "s"}</p><h2 id="lead-detail-title">{selected.companyName}</h2></div><button className="drawer-close" type="button" aria-label="Close" onClick={() => setSelectedId(null)}>×</button></div><form action={updateAction} className="lead-form"><input name="leadId" type="hidden" value={selected.id} /><section className="lead-form-section"><h3>Contact</h3><div className="field"><label htmlFor="lead-company">Company / property name</label><input id="lead-company" name="companyName" defaultValue={selected.companyName} required /></div><div className="field"><label htmlFor="lead-contact">Primary contact name</label><input id="lead-contact" name="primaryContactName" defaultValue={selected.primaryContactName} required /></div><div className="form-grid two"><div className="field"><label htmlFor="lead-phone">Phone</label><input id="lead-phone" name="primaryContactPhone" type="tel" defaultValue={selected.primaryContactPhone} /></div><div className="field"><label htmlFor="lead-email">Email</label><input id="lead-email" name="primaryContactEmail" type="email" defaultValue={selected.primaryContactEmail} /></div></div><div className="field"><label htmlFor="lead-source">Source</label><select id="lead-source" name="source" defaultValue={selected.source ?? "inbound"}><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></div></section><section className="lead-form-section"><h3>Pipeline</h3><div className="field"><label htmlFor="lead-status">Current status</label><select id="lead-status" name="pipelineStatus" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as PipelineStatus)}>{pipelineStatuses.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}</select></div>{statusDraft === "lost" ? <p className="lead-state-note lost">Lost Leads stay in Pipeline history and are never deleted.</p> : null}</section><section className="lead-form-section"><h3>Accumulated notes</h3><div className="field"><label htmlFor="lead-notes">Every pre-signature touchpoint</label><textarea id="lead-notes" name="notes" rows={12} defaultValue={selected.notes} placeholder="Add calls, discovery context, decisions, objections, and follow-up notes here." /></div></section>{statusDraft === "won" ? <section className="lead-conversion-section"><div><p className="eyebrow">In-place conversion</p><h3>Complete the Residency foundation</h3><p>This same record will move from Pipeline into Operations. Its contact history and notes stay attached.</p></div><div className="form-grid two"><div className="field"><label>City / state</label><input name="cityState" placeholder="Palm Springs, CA" required /></div><div className="field"><label>Timezone</label><input name="timezone" defaultValue="America/Los_Angeles" required /></div></div><div className="form-grid two"><div className="field"><label>Service tier</label><select name="tier" defaultValue="operations_only"><option value="operations_only">Platform</option><option value="complete">Full Programming</option></select></div><div className="field"><label>Invoice prefix</label><input name="invoicePrefix" defaultValue={selected.companyName.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase()} required /></div></div><div className="form-grid two"><div className="field"><label>Talent default ($/hr)</label><input name="defaultTalentRate" type="number" min="0" step="0.01" defaultValue="0" required /></div><div className="field"><label>Client rate ($/hr)</label><input name="clientHourlyRate" type="number" min="0" step="0.01" defaultValue="0" required /></div></div><div className="form-grid two"><div className="field"><label>Billing contact name</label><input name="billingContactName" defaultValue={selected.primaryContactName} required /></div><div className="field"><label>Billing contact email</label><input name="billingContactEmail" type="email" defaultValue={selected.primaryContactEmail} required /></div></div><div className="field"><label>Billing address</label><textarea name="billingAddress" rows={3} /></div><div className="form-grid three"><div className="field"><label>Payment terms</label><input name="paymentTermsDays" type="number" min="0" max="365" defaultValue="7" required /></div><div className="field"><label>Invoice frequency</label><select name="invoiceFrequency" defaultValue="weekly"><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="manual">As needed</option></select></div><div className="field"><label>Line presentation</label><select name="invoiceLinePresentation" defaultValue="service_detail"><option value="service_detail">Each service</option><option value="daily_summary">Daily summary</option><option value="period_summary">Period summary</option></select></div></div><div className="form-grid two"><div className="field"><label>Billing cycle starts</label><select name="billingCycleStartWeekday" defaultValue="1"><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></div><div className="field"><label>Cycle length (days)</label><input name="billingCycleLengthDays" type="number" min="1" max="31" defaultValue="7" required /></div></div><label className="invoice-toggle"><input name="autoSendInvoices" type="checkbox" /><span><strong>Automatically send approved Invoices</strong><small>Leave off when this Residency requires manual delivery.</small></span></label></section> : null}{updateState.message ? <p aria-live="polite" className={updateState.status === "error" ? "error" : "success"}>{updateState.message}</p> : null}<div className="lead-detail-actions"><button className="button secondary" type="button" onClick={() => setSelectedId(null)}>Cancel</button><button className="button" disabled={updatePending} type="submit">{updatePending ? "Saving…" : statusDraft === "won" ? "Convert to Residency" : "Save Lead"}</button></div></form></aside></div> : null}
  </div>;
}
