import { redirect } from "next/navigation";
import { DaypartRouteManager } from "@/components/daypart-route-manager";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { getDaypartsForResidency } from "@/services/dayparts";

export default async function ResidencyDaypartsPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const [actor, params] = await Promise.all([requireResidencyActor(), searchParams]);
  if (!canResidencyRoleAccess(actor.accessRole, "manage_dayparts")) redirect("/residency/calendar");
  const dayparts = await getDaypartsForResidency(actor.residencyId);

  return <>
    <header className="page-header client-page-header"><div><p className="eyebrow">Standing schedule</p><h1>Day Parts</h1></div></header>
    <DaypartRouteManager
      residencyId={actor.residencyId}
      dayparts={dayparts}
      hideFinancials
      initialCreate={actor.accessRole === "manager" && params.create === "1"}
    />
  </>;
}
