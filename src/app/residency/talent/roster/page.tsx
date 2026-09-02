import { getResidencyClientSafeRoster } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientRosterWorkspace } from "./client-roster-workspace";

export default async function ResidencyRosterPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "talent")) redirect("/residency/calendar");
  const artists = await getResidencyClientSafeRoster(actor.residencyId);
  return <>
    <header className="page-header"><div><p className="eyebrow">Scheduling roster</p><h1>Roster</h1><p className="subhead">Quickly find the artists explicitly assigned to {actor.residencyName}. Open a Residency-owned artist to edit or archive their record.</p></div></header>
    <ClientRosterWorkspace artists={artists} />
  </>;
}
