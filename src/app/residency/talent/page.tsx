import { getResidencyClientSafeRoster } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AddClientArtistForm } from "./add-client-artist-form";

export default async function ResidencyTalentPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "talent")) redirect("/residency/calendar");
  const roster = await getResidencyClientSafeRoster(actor.residencyId);
  const clientArtists = roster.filter((artist) => artist.ownership === "residency");
  return <>
    {actor.accessRole === "manager" ? <AddClientArtistForm /> : null}
    <section className="client-safe-roster" aria-label="Approved talent roster">
      {clientArtists.length ? clientArtists.map((artist) => <article className="card client-safe-talent-card" key={artist.id}><div><span className="status client-owned">Client-owned</span><h2>{artist.stageName}</h2></div><dl><div><dt>Genre</dt><dd>{artist.genres.length ? artist.genres.join(", ") : "Not listed"}</dd></div><div><dt>Contact</dt><dd>{artist.clientContact || "Not listed"}</dd></div></dl></article>) : <div className="card empty client-safe-roster-empty"><strong>Your roster is ready for its first artist.</strong><span>Use + Add Artist above to create a client-owned artist record.</span></div>}
    </section>
  </>;
}
