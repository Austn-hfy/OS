import { getSetupData } from "@/data/internal";
import { InvoiceBrandingSettings } from "./invoice-branding-settings";
import { ApprovedDjManager } from "./approved-dj-manager";
import { ResidencyContactsManager } from "./residency-contacts-manager";
import { ResidencyProfileEditor } from "./residency-profile-editor";
import { ResidencyRateEditor } from "./residency-rate-editor";
import { ClientVisibilitySettings } from "./client-visibility-settings";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ residency?: string }> }) {
  const { residency } = await searchParams;
  const data = await getSetupData();
  const selected = data.residencies.find((item) => item.id === residency);
  return (
    <>
      <header className="page-header card"><div><p className="eyebrow">{selected?.name ?? "Developer · Platform"}</p><h1>{selected ? "Residency setup" : "Admin Settings"}</h1><p className="subhead">{selected ? "Program details, rate defaults, approved artists, and client contacts for this Residency." : "Manage the Platform-level identity and sender details used on client Invoices."}</p></div></header>
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
          <ClientVisibilitySettings residencyId={selected.id} paymentStatusVisible={selected.clientPaymentStatusVisible} />
          <ApprovedDjManager residencyId={selected.id} artists={data.talent.filter((artist) => !artist.exclusiveResidencyId || artist.exclusiveResidencyId === selected.id)} approvedTalentIds={data.approvals.filter((approval) => approval.residencyId === selected.id).map((approval) => approval.talentId)} />
          <ResidencyContactsManager residencyId={selected.id} contacts={data.contacts.filter((contact) => contact.residencyId === selected.id)} />
        </> : null}

      </section>
    </>
  );
}
