import { redirect } from "next/navigation";
import { ResidencySettingsForm } from "./settings-form";
import { getResidencyClientSettings } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";

export default async function ResidencySettingsPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "settings")) redirect("/residency/calendar");
  const settings = await getResidencyClientSettings(actor.residencyId);
  return <>
    <header className="page-header card"><div><p className="eyebrow">Residency workspace</p><h1>Settings</h1><p className="subhead">Keep the basic program and primary-contact information current.</p></div></header>
    <ResidencySettingsForm settings={settings} />
  </>;
}
