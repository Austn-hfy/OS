import { getResidencyClientTalentWorkspace } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientArtistLookup } from "./client-artist-lookup";

export default async function ResidencyTalentPage({ searchParams }: { searchParams: Promise<{ artist?: string }> }) {
  const [actor, params] = await Promise.all([requireResidencyActor(), searchParams]);
  if (!canResidencyRoleAccess(actor.accessRole, "talent")) redirect("/residency/calendar");
  const artists = await getResidencyClientTalentWorkspace(actor.residencyId);
  return <>
    <header className="page-header"><div><p className="eyebrow">{actor.residencyName} talent</p><h1>Artist Lookup</h1><p className="subhead">Search this Residency’s explicit roster, then open an artist to review bookings, amounts owed, and client-safe profile details.</p></div></header>
    <ClientArtistLookup artists={artists} residencyName={actor.residencyName} timeZone={actor.residencyTimezone} canManage={actor.accessRole === "manager"} initialArtistId={params.artist} />
  </>;
}
