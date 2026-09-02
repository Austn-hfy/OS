import { getResidencyClientSafeRoster } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AddClientArtistForm } from "./add-client-artist-form";
import { ClientOwnedArtistCard } from "./client-owned-artist-card";

export default async function ResidencyTalentPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "talent")) redirect("/residency/calendar");
  const roster = await getResidencyClientSafeRoster(actor.residencyId);
  const clientArtists = roster.filter((artist) => artist.ownership === "residency");
  return <>
    {actor.accessRole === "manager" ? <AddClientArtistForm /> : null}
    <section className="client-safe-roster" aria-label="Approved talent roster">
      {clientArtists.length ? clientArtists.map((artist) => <ClientOwnedArtistCard artist={artist} canManage={actor.accessRole === "manager"} key={artist.id} />) : <div className="card empty client-safe-roster-empty"><strong>Your roster is ready for its first artist.</strong><span>Use + Add Artist above to create a Residency artist record.</span></div>}
    </section>
  </>;
}
