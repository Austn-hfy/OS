import { redirect } from "next/navigation";
import { DaypartRouteManager } from "@/components/daypart-route-manager";
import { getResidencyList } from "@/data/internal";
import { getDaypartsForResidency } from "@/services/dayparts";

export default async function OwnerDaypartsPage({ searchParams }: { searchParams: Promise<{ residency?: string; create?: string }> }) {
  const params = await searchParams;
  const residencies = await getResidencyList();
  const residency = residencies.find((item) => item.id === params.residency);
  if (!residency) redirect("/app?mode=hfy&view=operations");
  const dayparts = await getDaypartsForResidency(residency.id);

  return <>
    <header className="page-header card"><div><p className="eyebrow">{residency.name}</p><h1>Day Parts</h1><p className="subhead">Create and manage this Residency’s standing weekly schedule.</p></div></header>
    <DaypartRouteManager residencyId={residency.id} dayparts={dayparts} initialCreate={params.create === "1"} />
  </>;
}
