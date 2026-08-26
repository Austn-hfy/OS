"use client";

import { useMemo, useState } from "react";

const statuses = [
  ["contacted", "Contacted"], ["call_scheduled", "Call Scheduled"], ["call_complete", "Call Complete"],
  ["discovery_scheduled", "Discovery Scheduled"], ["discovery_complete", "Discovery Complete"],
  ["proposal_sent", "Proposal Sent"], ["won", "Won"], ["lost", "Lost"],
] as const;
type Status = typeof statuses[number][0];
type PreviewLead = { id: string; companyName: string; contact: string; phone: string; email: string; source: "inbound" | "outbound"; status: Status; days: number; notes: string };

const startingLeads: PreviewLead[] = [
  { id: "lead-1", companyName: "The Marlowe", contact: "Jordan Reyes", phone: "(310) 555-0194", email: "jordan@themarlowe.example", source: "inbound", status: "contacted", days: 2, notes: "Reached out after seeing the Ace program. Interested in weekend pool programming." },
  { id: "lead-2", companyName: "Casa Pacifica", contact: "Morgan Lee", phone: "(424) 555-0128", email: "morgan@casapacifica.example", source: "outbound", status: "discovery_complete", days: 4, notes: "Discovery complete. Operations-only package is the likely fit. Needs budget follow-up." },
  { id: "lead-3", companyName: "Hotel Solana", contact: "Alex Chen", phone: "(760) 555-0177", email: "alex@hotelsolana.example", source: "inbound", status: "proposal_sent", days: 6, notes: "Proposal sent after second call. Waiting on ownership review." },
  { id: "lead-4", companyName: "The Easton", contact: "Sam Ortiz", phone: "", email: "sam@easton.example", source: "outbound", status: "lost", days: 18, notes: "Timing was not right. Keep visible for future context." },
];

function label(value: Status) { return statuses.find(([status]) => status === value)?.[1] ?? value; }

export function PreviewLeads() {
  const [leads, setLeads] = useState(startingLeads);
  const [tab, setTab] = useState<Status | "all">("contacted");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<Status>("contacted");
  const [notice, setNotice] = useState("");
  const selected = leads.find((lead) => lead.id === selectedId) ?? null;
  const visible = useMemo(() => tab === "all" ? leads : leads.filter((lead) => lead.status === tab), [leads, tab]);
  const counts = useMemo(() => Object.fromEntries(statuses.map(([status]) => [status, leads.filter((lead) => lead.status === status).length])), [leads]);

  function addLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLeads((current) => [{ id: crypto.randomUUID(), companyName: String(data.get("companyName")), contact: String(data.get("contact")), phone: String(data.get("phone")), email: String(data.get("email")), source: String(data.get("source")) as "inbound" | "outbound", status: "contacted", days: 0, notes: String(data.get("notes")) }, ...current]);
    setTab("contacted");
    setNewOpen(false);
  }

  function saveLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    if (statusDraft === "won") {
      setLeads((current) => current.filter((lead) => lead.id !== selected.id));
      setNotice(`${selected.companyName} converted in place and moved to Operations.`);
    } else {
      setLeads((current) => current.map((lead) => lead.id === selected.id ? { ...lead, companyName: String(data.get("companyName")), contact: String(data.get("contact")), phone: String(data.get("phone")), email: String(data.get("email")), source: String(data.get("source")) as "inbound" | "outbound", status: statusDraft, days: statusDraft === lead.status ? lead.days : 0, notes: String(data.get("notes")) } : lead));
    }
    setSelectedId(null);
  }

  return <div className="leads-workspace"><header className="page-header card leads-page-header"><div><p className="eyebrow">HFY Pipeline</p><h1>Leads</h1><p className="subhead">Track every property from first contact through a signed program. Won Leads become Operations Residencies without losing their record or notes.</p></div><button className="button" type="button" onClick={() => setNewOpen(true)}>+ New Lead</button></header>{notice ? <div className="pipeline-conversion-notice"><strong>Moved to Operations</strong><span>{notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div> : null}<nav className="pipeline-status-tabs">{statuses.map(([status, title]) => <button className={tab === status ? "active" : ""} type="button" onClick={() => setTab(status)} key={status}><span>{title}</span><b>{counts[status] ?? 0}</b></button>)}<button className={tab === "all" ? "active" : ""} type="button" onClick={() => setTab("all")}><span>All</span><b>{leads.length}</b></button></nav><section className="card lead-list-shell"><div className="lead-list-header"><span>Company / property</span><span>Primary contact</span><span>Source</span><span>Time in status</span><span>Status</span></div><div className="lead-list">{visible.map((lead) => <button className="lead-list-row" type="button" onClick={() => { setSelectedId(lead.id); setStatusDraft(lead.status); }} key={lead.id}><span><strong>{lead.companyName}</strong><small>{lead.email}</small></span><span><strong>{lead.contact}</strong><small>{lead.phone || "Phone not added"}</small></span><span><i className={`lead-source ${lead.source}`}>{lead.source}</i></span><span><strong>{lead.days}</strong><small>day{lead.days === 1 ? "" : "s"}</small></span><span><i className={`pipeline-status ${lead.status}`}>{label(lead.status)}</i></span></button>)}</div>{!visible.length ? <div className="empty">No Leads in this status.</div> : null}</section>
    {newOpen ? <div className="invoice-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setNewOpen(false); }}><aside className="lead-drawer" role="dialog" aria-modal="true"><div className="invoice-drawer-heading"><div><p className="eyebrow">Pipeline entry</p><h2>New Lead</h2></div><button className="drawer-close" type="button" onClick={() => setNewOpen(false)}>×</button></div><form className="lead-form" onSubmit={addLead}><div className="field"><label>Company / property name</label><input name="companyName" required /></div><div className="field"><label>Primary contact name</label><input name="contact" required /></div><div className="form-grid two"><div className="field"><label>Phone</label><input name="phone" /></div><div className="field"><label>Email</label><input name="email" type="email" /></div></div><div className="field"><label>Source</label><select name="source"><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></div><div className="field"><label>Notes</label><textarea name="notes" rows={8} /></div><div className="lead-entry-note"><strong>Starts in Contacted</strong><span>Move the Lead through Pipeline from its detail panel.</span></div><div className="invoice-form-footer"><button className="button secondary" type="button" onClick={() => setNewOpen(false)}>Cancel</button><button className="button" type="submit">Add Lead</button></div></form></aside></div> : null}
    {selected ? <div className="lead-detail-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}><aside className="lead-detail-panel" role="dialog" aria-modal="true"><div className="invoice-drawer-heading"><div><p className="eyebrow">{label(selected.status)} · {selected.days} days</p><h2>{selected.companyName}</h2></div><button className="drawer-close" type="button" onClick={() => setSelectedId(null)}>×</button></div><form className="lead-form" onSubmit={saveLead}><section className="lead-form-section"><h3>Contact</h3><div className="field"><label>Company / property</label><input name="companyName" defaultValue={selected.companyName} required /></div><div className="field"><label>Primary contact</label><input name="contact" defaultValue={selected.contact} required /></div><div className="form-grid two"><div className="field"><label>Phone</label><input name="phone" defaultValue={selected.phone} /></div><div className="field"><label>Email</label><input name="email" type="email" defaultValue={selected.email} /></div></div><div className="field"><label>Source</label><select name="source" defaultValue={selected.source}><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></div></section><section className="lead-form-section"><h3>Pipeline</h3><div className="field"><label>Current status</label><select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as Status)}>{statuses.map(([status, title]) => <option value={status} key={status}>{title}</option>)}</select></div>{statusDraft === "lost" ? <p className="lead-state-note lost">Lost Leads stay visible in Pipeline history.</p> : null}</section><section className="lead-form-section"><h3>Accumulated notes</h3><div className="field"><label>Every pre-signature touchpoint</label><textarea name="notes" rows={12} defaultValue={selected.notes} /></div></section>{statusDraft === "won" ? <section className="lead-conversion-section"><div><p className="eyebrow">In-place conversion</p><h3>Complete the Residency foundation</h3><p>This same record moves into Operations with its contact history and notes intact.</p></div><div className="form-grid two"><div className="field"><label>City / state</label><input placeholder="Palm Springs, CA" required /></div><div className="field"><label>Timezone</label><input defaultValue="America/Los_Angeles" /></div></div><div className="form-grid two"><div className="field"><label>Service tier</label><select><option>Operations Only</option><option>Complete</option></select></div><div className="field"><label>Invoice prefix</label><input defaultValue={selected.companyName.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase()} /></div></div><div className="form-grid two"><div className="field"><label>Talent default ($/hr)</label><input type="number" defaultValue="0" /></div><div className="field"><label>Client rate ($/hr)</label><input type="number" defaultValue="0" /></div></div><div className="field"><label>Billing contact email</label><input type="email" defaultValue={selected.email} required /></div></section> : null}<div className="lead-detail-actions"><button className="button secondary" type="button" onClick={() => setSelectedId(null)}>Cancel</button><button className="button" type="submit">{statusDraft === "won" ? "Convert to Residency" : "Save Lead"}</button></div></form></aside></div> : null}
  </div>;
}
