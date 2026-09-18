import { redirect } from "next/navigation";
import Link from "next/link";
import { ResidencyPageBody, ResidencyPageHeader, ResidencyPageSurface, ResidencySectionHeader, ResidencySurfaceCard } from "@/components/residency-design-system";
import { getResidencyClientOverview } from "@/data/residency-client";
import { requireResidencyActor } from "@/lib/auth";

function date(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}

export default async function ResidencyOverviewPage() {
  const actor = await requireResidencyActor();
  if (actor.accessRole !== "manager") redirect("/residency/access-limited");
  const overview = await getResidencyClientOverview(actor.residencyId);
  return <ResidencyPageSurface className="residency-overview-surface">
    <ResidencyPageHeader eyebrow="Residency workspace" title={`Welcome, ${actor.displayName}`} />
    <ResidencyPageBody className="residency-overview-body">
      <section className="residency-overview-grid">
        <ResidencySurfaceCard as="article" className="residency-overview-program-card"><ResidencySectionHeader eyebrow="Program" title={<>{overview.upcomingServiceCount} upcoming service{overview.upcomingServiceCount === 1 ? "" : "s"}</>} description={overview.nextServiceDate ? `Next service ${date(overview.nextServiceDate)}` : "No upcoming services are scheduled."} /><Link className="button secondary" href="/residency/calendar">Open calendar</Link></ResidencySurfaceCard>
      </section>
    </ResidencyPageBody>
  </ResidencyPageSurface>;
}
