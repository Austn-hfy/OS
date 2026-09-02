import { getResidencyClientSafeRoster } from "@/data/residency-client";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientRosterWorkspace } from "./client-roster-workspace";

export default async function ResidencyRosterPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "talent")) redirect("/residency/calendar");
  const artists = await getResidencyClientSafeRoster(actor.residencyId);
  return <WorkspaceSurface className="residency-workspace-surface workspace-surface-roster">
    <ResidencyPageHeader eyebrow={`${actor.residencyName} talent`} title="Roster" />
    <ClientRosterWorkspace artists={artists} />
  </WorkspaceSurface>;
}
