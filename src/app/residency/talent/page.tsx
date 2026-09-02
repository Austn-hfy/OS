import { getResidencyClientOwnedArtistManagement } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AddClientArtistForm } from "./add-client-artist-form";
import { ArchivedClientOwnedArtistCard, ClientOwnedArtistCard } from "./client-owned-artist-card";

export default async function ResidencyTalentPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "talent")) redirect("/residency/calendar");
  const roster = await getResidencyClientOwnedArtistManagement(actor.residencyId);
  const clientArtists = roster.filter((artist) => !artist.archivedAt);
  const archivedArtists = roster.filter((artist) => artist.archivedAt);
  return <>
    {actor.accessRole === "manager" ? <AddClientArtistForm /> : null}
    <section className="client-safe-roster" aria-label="Approved talent roster">
      {clientArtists.length ? clientArtists.map((artist) => <ClientOwnedArtistCard artist={artist} canManage={actor.accessRole === "manager"} residencyName={actor.residencyName} key={artist.id} />) : <div className="card empty client-safe-roster-empty"><strong>Your roster is ready for its first artist.</strong><span>Use + Add Artist above to create a Residency artist record.</span></div>}
    </section>
    <details className="card client-artist-archive"><summary><span>Archived artists</span><strong>{archivedArtists.length}</strong></summary><p>Archived artists are unavailable for future scheduling, while their existing booking history remains intact.</p><section className="client-safe-roster" aria-label="Archived talent roster">{archivedArtists.length ? archivedArtists.map((artist) => <ArchivedClientOwnedArtistCard artist={artist} canManage={actor.accessRole === "manager"} residencyName={actor.residencyName} key={artist.id} />) : <div className="empty client-safe-roster-empty"><strong>No archived artists.</strong></div>}</section></details>
  </>;
}
