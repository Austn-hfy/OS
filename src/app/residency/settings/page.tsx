import { redirect } from "next/navigation";
import { ResidencyPageBody, ResidencyPageHeader, ResidencyPageSurface, ResidencyTabs } from "@/components/residency-design-system";
import { ResidencySettingsForm } from "./settings-form";
import { getResidencyClientSettings } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";

export default async function ResidencySettingsPage() {
  const platformBillingAvailable = isCurrentPlatformBillingAvailable();
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "settings")) redirect("/residency/calendar");
  const settings = await getResidencyClientSettings(actor.residencyId);
  return <ResidencyPageSurface className="workspace-surface-settings workspace-surface-client-settings">
    <ResidencyPageHeader eyebrow="Settings · Account" title="Account settings" />
    <ResidencyTabs className="settings-tabs" ariaLabel="Settings sections" activeHref="/residency/settings" items={[{ href: "/residency/settings", label: "Account" }, ...(platformBillingAvailable ? [{ href: "/residency/settings/billing", label: "Billing" }] : [])]} />
    <ResidencyPageBody className="settings-page-body settings-account-body">
      <ResidencySettingsForm settings={settings} />
    </ResidencyPageBody>
  </ResidencyPageSurface>;
}
