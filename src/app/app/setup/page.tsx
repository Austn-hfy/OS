import { getSetupData } from "@/data/internal";
import { InvoiceBrandingSettings } from "./invoice-branding-settings";
import { ResidencyContactsManager } from "./residency-contacts-manager";
import { ResidencyProfileEditor } from "./residency-profile-editor";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { getLastStagingStructureSync } from "@/data/staging-sync";
import { isStableStagingSyncEnvironment } from "@/domain/staging-sync-admin";
import { StagingSyncCard } from "./staging-sync-card";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ residency?: string }> }) {
  const { residency } = await searchParams;
  const stagingSyncEnabled = !residency && isStableStagingSyncEnvironment({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  }) && Boolean(
    process.env.PRODUCTION_SYNC_DATABASE_URL
    && process.env.STAGING_SYNC_CONFIRMATION_SECRET,
  );
  const [data, lastStagingSync] = await Promise.all([
    getSetupData(),
    stagingSyncEnabled ? getLastStagingStructureSync() : Promise.resolve(null),
  ]);
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
        {!selected && stagingSyncEnabled ? <StagingSyncCard initialLastSync={lastStagingSync} /> : null}
        {selected ? <>
          <ResidencyProfileEditor residency={selected} />
          <ResidencyContactsManager residencyId={selected.id} contacts={data.contacts.filter((contact) => contact.residencyId === selected.id)} />
        </> : null}

      </section>
    </WorkspaceSurface>
  );
}
