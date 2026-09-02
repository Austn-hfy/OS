import { redirect } from "next/navigation";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { ResidencySettingsForm } from "./settings-form";
import { getResidencyClientSettings } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import Link from "next/link";

export default async function ResidencySettingsPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "settings")) redirect("/residency/calendar");
  const settings = await getResidencyClientSettings(actor.residencyId);
  return <WorkspaceSurface className="residency-workspace-surface workspace-surface-settings">
    <ResidencyPageHeader eyebrow="Residency workspace" title="Settings" />
    <nav className="settings-tabs" aria-label="Settings sections"><Link className="active" href="/residency/settings">Account</Link><Link href="/residency/settings/billing">Billing</Link></nav>
    <ResidencySettingsForm settings={settings} />
  </WorkspaceSurface>;
}
