import { redirect } from "next/navigation";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { ResidencySettingsForm } from "./settings-form";
import { getResidencyClientSettings } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";

export default async function ResidencySettingsPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "settings")) redirect("/residency/calendar");
  const settings = await getResidencyClientSettings(actor.residencyId);
  return <>
    <ResidencyPageHeader eyebrow="Residency workspace" title="Settings" />
    <ResidencySettingsForm settings={settings} />
  </>;
}
