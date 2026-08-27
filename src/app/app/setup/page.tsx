import { getSetupData } from "@/data/internal";
import { getDaypartsForResidency } from "@/services/dayparts";
import { createResidencyAction, createTalentAction } from "../actions";
import { DaypartManager } from "./daypart-manager";
import { InvoiceBrandingSettings } from "./invoice-branding-settings";
import { ApprovedDjManager } from "./approved-dj-manager";
import { ResidencyContactsManager } from "./residency-contacts-manager";
import { ResidencyProfileEditor } from "./residency-profile-editor";
import { ResidencyRateEditor } from "./residency-rate-editor";
import { SensitiveInput } from "@/components/privacy-mode";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ residency?: string }> }) {
  const { residency } = await searchParams;
  const data = await getSetupData();
  const selected = data.residencies.find((item) => item.id === residency);
  const dayparts = selected ? await getDaypartsForResidency(selected.id) : [];
  return (
    <>
      <header className="page-header card"><div><p className="eyebrow">{selected?.name ?? "HFY company"}</p><h1>{selected ? "Residency setup" : "Admin settings"}</h1><p className="subhead">{selected ? "Program details, standing hours, rate defaults, approved artists, and client contacts for this Residency." : "Manage company Invoice branding, new-system hotels, and the shared talent roster."}</p></div></header>
      {selected ? <DaypartManager residencyId={selected.id} dayparts={dayparts.map((daypart) => ({ id: daypart.id, name: daypart.name, room: daypart.room, color: daypart.color, defaultTalentRateCents: daypart.defaultTalentRateCents, activeUntil: daypart.activeUntil, active: daypart.active, sortOrder: daypart.sortOrder, rules: daypart.rules.map((rule) => ({ weekday: rule.weekday, startMinute: rule.startMinute, endMinute: rule.endMinute })) }))} /> : null}
      <section className={selected ? "residency-setup-grid" : "grid residency-grid"}>
        {!selected ? <InvoiceBrandingSettings
          companyName={data.invoiceBranding.companyName}
          billingEmail={data.invoiceBranding.billingEmail}
          billingAddress={data.invoiceBranding.billingAddress}
          hasLogo={Boolean(data.invoiceBranding.logo)}
        /> : null}
        {selected ? <>
          <ResidencyProfileEditor residency={selected} />
          <ResidencyRateEditor residencyId={selected.id} defaultTalentRateCents={selected.defaultTalentRateCents} clientHourlyRateCents={selected.clientHourlyRateCents} />
          <ApprovedDjManager residencyId={selected.id} artists={data.talent} approvedTalentIds={data.approvals.filter((approval) => approval.residencyId === selected.id).map((approval) => approval.talentId)} />
          <ResidencyContactsManager residencyId={selected.id} contacts={data.contacts.filter((contact) => contact.residencyId === selected.id)} />
        </> : <form action={createResidencyAction} className="card selection-form">
          <div><p className="eyebrow">Residencies</p><h2>New Residency</h2></div>
          <div className="field"><label>Client account</label><input name="clientName" placeholder="Hotel group or owner" required /></div>
          <div className="field"><label>Residency name</label><input name="residencyName" placeholder="Hotel + program" required /></div>
          <div className="field"><label>City / State</label><input name="cityState" placeholder="Palm Springs, CA" /></div>
          <div className="field"><label>Timezone</label><input name="timezone" defaultValue="America/Los_Angeles" required /></div>
          <div className="row"><div className="field"><label>Tier</label><select name="tier"><option value="operations_only">Operations Only</option><option value="complete">Complete</option></select></div><div className="field"><label>Invoice prefix</label><input name="invoicePrefix" placeholder="HOTEL" required /></div></div>
          <div className="row"><div className="field"><label>Talent rate ($/hr)</label><SensitiveInput name="defaultTalentRate" type="number" min="0" step="0.01" required /></div><div className="field"><label>Client rate ($/hr)</label><SensitiveInput name="clientHourlyRate" type="number" min="0" step="0.01" required /></div></div>
          <div className="field"><label>Billing contact name</label><input name="billingContactName" required /></div>
          <div className="field"><label>Billing contact email</label><input name="billingContactEmail" type="email" required /></div>
          <div className="field"><label>Payment terms (days)</label><input name="paymentTermsDays" type="number" defaultValue="7" min="0" max="365" required /></div>
          <label><input name="autoSendInvoices" type="checkbox" style={{ width: "auto", minHeight: 0 }} /> Auto-send approved Invoices</label>
          <button className="button" type="submit">Create Residency</button>
        </form>}

        {!selected ? <form action={createTalentAction} className="card selection-form">
          <div><p className="eyebrow">Shared roster</p><h2>Add Talent</h2></div>
          <div className="field"><label>Stage name</label><input name="stageName" required /></div>
          <div className="field"><label>Full name</label><input name="fullName" /></div>
          <div className="row"><div className="field"><label>Email</label><input name="email" type="email" /></div><div className="field"><label>Phone</label><input name="phone" /></div></div>
          <div className="field"><label>Home market</label><input name="homeMarket" /></div>
          <div className="field"><label>Genres, comma separated</label><input name="genres" /></div>
          <div className="field"><label>Priority</label><input name="priority" type="number" min="1" max="5" defaultValue="3" /></div>
          <button className="button" type="submit">Add to shared roster</button>
        </form> : null}

      </section>
    </>
  );
}
