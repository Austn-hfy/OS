import { getSetupData } from "@/data/internal";
import { getDaypartsForResidency } from "@/services/dayparts";
import { approveResidencyTalentAction, createResidencyAction, createShiftAction, createTalentAction } from "../actions";
import { DaypartManager } from "./daypart-manager";
import { InvoiceBrandingSettings } from "./invoice-branding-settings";
import { ResidencyRateEditor } from "./residency-rate-editor";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ residency?: string }> }) {
  const { residency } = await searchParams;
  const data = await getSetupData();
  const selected = data.residencies.find((item) => item.id === residency);
  const dayparts = selected ? await getDaypartsForResidency(selected.id) : [];
  return (
    <>
      <header className="page-header card"><div><p className="eyebrow">{selected?.name ?? "Pilot controls"}</p><h1>{selected ? "Residency setup" : "Admin settings"}</h1><p className="subhead">{selected ? "Recurring Dayparts, approved talent, rate defaults, and Shift controls for this Residency. Invoice configuration now lives inside Invoices." : "Manage company Invoice branding, new-system hotels, and the shared talent roster."}</p></div></header>
      {selected ? <DaypartManager residencyId={selected.id} dayparts={dayparts.map((daypart) => ({ id: daypart.id, name: daypart.name, room: daypart.room, color: daypart.color, defaultTalentRateCents: daypart.defaultTalentRateCents, activeUntil: daypart.activeUntil, active: daypart.active, sortOrder: daypart.sortOrder, rules: daypart.rules.map((rule) => ({ weekday: rule.weekday, startMinute: rule.startMinute, endMinute: rule.endMinute, defaultDjCount: rule.defaultDjCount })) }))} /> : null}
      <section className="grid residency-grid">
        {!selected ? <InvoiceBrandingSettings
          companyName={data.invoiceBranding.companyName}
          billingEmail={data.invoiceBranding.billingEmail}
          billingAddress={data.invoiceBranding.billingAddress}
          hasLogo={Boolean(data.invoiceBranding.logo)}
        /> : null}
        {selected ? <ResidencyRateEditor residencyId={selected.id} residencyName={selected.name} timezone={selected.timezone} defaultTalentRateCents={selected.defaultTalentRateCents} /> : <form action={createResidencyAction} className="card selection-form">
          <div><p className="eyebrow">01</p><h2>New Residency</h2></div>
          <div className="field"><label>Client account</label><input name="clientName" placeholder="Hotel group or owner" required /></div>
          <div className="field"><label>Residency name</label><input name="residencyName" placeholder="Hotel + program" required /></div>
          <div className="field"><label>City / State</label><input name="cityState" placeholder="Palm Springs, CA" /></div>
          <div className="field"><label>Timezone</label><input name="timezone" defaultValue="America/Los_Angeles" required /></div>
          <div className="row"><div className="field"><label>Tier</label><select name="tier"><option value="operations_only">Operations Only</option><option value="complete">Complete</option></select></div><div className="field"><label>Invoice prefix</label><input name="invoicePrefix" placeholder="HOTEL" required /></div></div>
          <div className="row"><div className="field"><label>Talent rate ($/hr)</label><input name="defaultTalentRate" type="number" min="0" step="0.01" required /></div><div className="field"><label>Client rate ($/hr)</label><input name="clientHourlyRate" type="number" min="0" step="0.01" required /></div></div>
          <div className="field"><label>Billing contact name</label><input name="billingContactName" required /></div>
          <div className="field"><label>Billing contact email</label><input name="billingContactEmail" type="email" required /></div>
          <div className="field"><label>Payment terms (days)</label><input name="paymentTermsDays" type="number" defaultValue="7" min="0" max="365" required /></div>
          <label><input name="autoSendInvoices" type="checkbox" style={{ width: "auto", minHeight: 0 }} /> Auto-send approved Invoices</label>
          <button className="button" type="submit">Create Residency</button>
        </form>}

        {!selected ? <form action={createTalentAction} className="card selection-form">
          <div><p className="eyebrow">02</p><h2>Add Talent</h2></div>
          <div className="field"><label>Stage name</label><input name="stageName" required /></div>
          <div className="field"><label>Full name</label><input name="fullName" /></div>
          <div className="row"><div className="field"><label>Email</label><input name="email" type="email" /></div><div className="field"><label>Phone</label><input name="phone" /></div></div>
          <div className="field"><label>Home market</label><input name="homeMarket" /></div>
          <div className="field"><label>Genres, comma separated</label><input name="genres" /></div>
          <div className="field"><label>Priority</label><input name="priority" type="number" min="1" max="5" defaultValue="3" /></div>
          <button className="button" type="submit">Add to shared roster</button>
        </form> : null}

        <form action={approveResidencyTalentAction} className="card selection-form">
          <div><p className="eyebrow">03</p><h2>Approve DJ list</h2><p className="subhead">Control which DJs belong to this Residency&apos;s approved roster.</p></div>
          {selected ? <input name="residencyId" type="hidden" value={selected.id} /> : <div className="field"><label>Residency</label><select name="residencyId" required>{data.residencies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>}
          <div className="field"><label>DJ</label><select name="talentId" required>{data.talent.map((item) => <option value={item.id} key={item.id}>{item.stageName}</option>)}</select></div>
          <button className="button" type="submit">Add approved DJ</button>
          <p className="privacy-note">{data.approvals.length} active Residency/DJ approval{data.approvals.length === 1 ? "" : "s"} configured.</p>
        </form>

        <form action={createShiftAction} className="card selection-form">
          <div><p className="eyebrow">04</p><h2>Create Shift</h2><p className="subhead">The covering scheduled-services Invoice is linked automatically. Custom Invoices never capture Shifts.</p></div>
          {selected ? <input name="residencyId" type="hidden" value={selected.id} /> : <div className="field"><label>Residency</label><select name="residencyId" required>{data.residencies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>}
          <div className="field"><label>Shift name</label><input name="name" placeholder="Saturday Pool" required /></div>
          <div className="row"><div className="field"><label>Service date</label><input name="serviceDate" type="date" required /></div><div className="field"><label>Room</label><input name="room" required /></div></div>
          <div className="row"><div className="field"><label>Local start</label><input name="startsAtLocal" type="datetime-local" required /></div><div className="field"><label>Local end</label><input name="endsAtLocal" type="datetime-local" required /></div></div>
          <div className="field"><label>Notes</label><textarea name="notes" rows={3} /></div>
          <button className="button" type="submit">Create and auto-link Shift</button>
        </form>
      </section>
    </>
  );
}
