import { getSetupData } from "@/data/internal";
import { getDaypartsForResidency } from "@/services/dayparts";
import { PublicCalendarLinkManager } from "@/components/public-calendar-link-manager";
import { DaypartManager } from "./daypart-manager";
import { InvoiceBrandingSettings } from "./invoice-branding-settings";
import { ApprovedDjManager } from "./approved-dj-manager";
import { ResidencyContactsManager } from "./residency-contacts-manager";
import { ResidencyProfileEditor } from "./residency-profile-editor";
import { ResidencyRateEditor } from "./residency-rate-editor";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ residency?: string }> }) {
  const { residency } = await searchParams;
  const data = await getSetupData();
  const selected = data.residencies.find((item) => item.id === residency);
  const dayparts = selected ? await getDaypartsForResidency(selected.id) : [];
  return (
    <>
      <header className="page-header card"><div><p className="eyebrow">{selected?.name ?? "HFY company"}</p><h1>{selected ? "Residency setup" : "Company Invoices"}</h1><p className="subhead">{selected ? "Program details, standing hours, rate defaults, approved artists, and client contacts for this Residency." : "Manage the company identity and sender details used on client Invoices."}</p></div></header>
      {selected ? <DaypartManager residencyId={selected.id} dayparts={dayparts.map((daypart) => ({ id: daypart.id, name: daypart.name, room: daypart.room, color: daypart.color, type: daypart.type, billingMode: daypart.billingMode, defaultTalentRateCents: daypart.defaultTalentRateCents, activeUntil: daypart.activeUntil, active: daypart.active, sortOrder: daypart.sortOrder, rules: daypart.rules.map((rule) => ({ weekday: rule.weekday, startMinute: rule.startMinute, endMinute: rule.endMinute, defaultDjCount: rule.defaultDjCount })) }))} /> : null}
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
          <PublicCalendarLinkManager residencyId={selected.id} hasLink={selected.hasPublicCalendarLink} />
        </> : null}

      </section>
    </>
  );
}
