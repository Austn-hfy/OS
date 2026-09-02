import { getResidencyClientTalentWorkspace } from "@/data/residency-client";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientArtistLookup } from "./client-artist-lookup";

export default async function ResidencyTalentPage({ searchParams }: { searchParams: Promise<{ artist?: string }> }) {
  const [actor, params] = await Promise.all([requireResidencyActor(), searchParams]);
  if (!canResidencyRoleAccess(actor.accessRole, "talent")) redirect("/residency/calendar");
  const artists = await getResidencyClientTalentWorkspace(actor.residencyId);
  return <section className="residency-workspace-surface residency-talent-workspace-surface">
    <ResidencyPageHeader eyebrow={`${actor.residencyName} talent`} title="Artist Lookup" />
    <ClientArtistLookup artists={artists} residencyName={actor.residencyName} timeZone={actor.residencyTimezone} canManage={actor.accessRole === "manager"} initialArtistId={params.artist} />
  </section>;
}
