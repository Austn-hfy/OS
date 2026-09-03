import { getSetupData } from "@/data/internal";
import { InvoiceBrandingSettings } from "./invoice-branding-settings";
import { ResidencyContactsManager } from "./residency-contacts-manager";
import { ResidencyProfileEditor } from "./residency-profile-editor";
import { WorkspaceSurface } from "@/components/workspace-surface";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ residency?: string }> }) {
  const { residency } = await searchParams;
  const data = await getSetupData();
  const selected = data.residencies.find((item) => item.id === residency);
  return (
    <WorkspaceSurface className="workspace-surface-settings">
      <header className="page-header card"><div><p className="eyebrow">{selected?.name ?? "Developer · Platform"}</p><h1>{selected ? "Residency setup" : "Admin Settings"}</h1><p className="subhead">{selected ? "Program identity, service tier, internal notes, and client contacts for this Residency." : "Manage the Platform-level identity and sender details used on client Invoices."}</p></div></header>
      <section className={selected ? "residency-setup-grid" : "grid residency-grid"}>
        {!selected ? <InvoiceBrandingSettings
          companyName={data.invoiceBranding.companyName}
          billingEmail={data.invoiceBranding.billingEmail}
          billingAddress={data.invoiceBranding.billingAddress}
          hasLogo={Boolean(data.invoiceBranding.logo)}
        /> : null}
        {selected ? <>
          <ResidencyProfileEditor residency={selected} />
          <ResidencyContactsManager residencyId={selected.id} contacts={data.contacts.filter((contact) => contact.residencyId === selected.id)} />
        </> : null}

      </section>
    </WorkspaceSurface>
  );
}
