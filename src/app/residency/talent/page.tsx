import { getResidencyClientSafeRoster } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AddClientArtistForm } from "./add-client-artist-form";

export default async function ResidencyTalentPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "talent")) redirect("/residency/calendar");
  const roster = await getResidencyClientSafeRoster(actor.residencyId);
  return <>
    <header className="page-header card"><div><p className="eyebrow">Your talent</p><h1>Talent Roster</h1><p className="subhead">Manage artists your Residency added. HFY-supplied talent arrives through Request HFY instead.</p></div></header>
    {actor.accessRole === "manager" ? <AddClientArtistForm /> : null}
    <section className="card client-safe-roster-boundary"><strong>Ownership boundary</strong><span>Your artists remain client-owned. HFY payment, tax, payout, and earnings fields are never added to them.</span></section>
    <section className="client-safe-roster" aria-label="Approved talent roster">
      {roster.filter((artist) => artist.ownership === "residency").length ? roster.filter((artist) => artist.ownership === "residency").map((artist) => <article className="card client-safe-talent-card" key={artist.id}><div><span className="status client-owned">Client-owned</span><h2>{artist.stageName}</h2></div><dl><div><dt>Genre</dt><dd>{artist.genres.length ? artist.genres.join(", ") : "Not listed"}</dd></div><div><dt>Contact</dt><dd>{artist.clientContact || "Not listed"}</dd></div></dl></article>) : <div className="card empty">No client-owned artists yet. Use + Add Artist to create the first one.</div>}
    </section>
  </>;
}
