import { getResidencyClientSafeRoster } from "@/data/residency-client";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientRosterWorkspace } from "./client-roster-workspace";

export default async function ResidencyRosterPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "talent")) redirect("/residency/calendar");
  const artists = await getResidencyClientSafeRoster(actor.residencyId);
  return <>
    <ResidencyPageHeader eyebrow={`${actor.residencyName} talent`} title="Roster" />
    <ClientRosterWorkspace artists={artists} />
  </>;
}
