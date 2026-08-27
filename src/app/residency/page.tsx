import Link from "next/link";
import { redirect } from "next/navigation";
import { getResidencyClientOverview } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";

export default async function ResidencyOverviewPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "overview")) redirect("/residency/calendar");
  const overview = await getResidencyClientOverview(actor.residencyId);
  return <>
    <header className="page-header card"><div><p className="eyebrow">Residency overview</p><h1>{actor.residencyName}</h1><p className="subhead">A client-safe view of the upcoming programming calendar.</p></div></header>
    <section className="card client-overview-card"><div><p className="eyebrow">Upcoming schedule</p><strong>{overview.upcomingServiceCount}</strong><span>calendar slot{overview.upcomingServiceCount === 1 ? "" : "s"} ahead</span>{overview.nextServiceDate ? <small>Next service: {overview.nextServiceDate}</small> : null}</div><Link className="button" href="/residency/calendar">Open calendar</Link></section>
  </>;
}
