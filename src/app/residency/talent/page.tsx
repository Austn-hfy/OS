import { getResidencyClientSafeRoster } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ResidencyTalentPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "talent")) redirect("/residency/calendar");
  const roster = await getResidencyClientSafeRoster(actor.residencyId);
  return <>
    <header className="page-header card"><div><p className="eyebrow">Available talent</p><h1>Talent Roster</h1><p className="subhead">Shared HFY talent plus artists exclusive to this Residency.</p></div></header>
    <section className="card client-safe-roster-boundary"><strong>Client-safe view</strong><span>This page contains programming information only. Contact, tax, payment, payout, and earnings data are never included.</span></section>
    <section className="client-safe-roster" aria-label="Approved talent roster">
      {roster.length ? roster.map((artist) => <article className="card client-safe-talent-card" key={artist.id}><div><h2>{artist.stageName}</h2><p>{artist.homeMarket || "Market not listed"}</p></div><dl><div><dt>Genres</dt><dd>{artist.genres.length ? artist.genres.join(", ") : "Not listed"}</dd></div><div><dt>Instagram</dt><dd>{artist.instagramHandle || "Not listed"}</dd></div></dl></article>) : <div className="card empty">No artists are currently approved for this Residency.</div>}
    </section>
  </>;
}
