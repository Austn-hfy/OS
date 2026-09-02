import { redirect } from "next/navigation";
import { DaypartRouteManager } from "@/components/daypart-route-manager";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { getDaypartsForResidency } from "@/services/dayparts";

export default async function ResidencyDaypartsPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const [actor, params] = await Promise.all([requireResidencyActor(), searchParams]);
  if (!canResidencyRoleAccess(actor.accessRole, "manage_dayparts")) redirect("/residency/calendar");
  const dayparts = await getDaypartsForResidency(actor.residencyId);

  return <>
    <ResidencyPageHeader eyebrow={actor.residencyName} title="Day Parts" />
    <DaypartRouteManager
      residencyId={actor.residencyId}
      dayparts={dayparts}
      hideFinancials
      initialCreate={actor.accessRole === "manager" && params.create === "1"}
    />
  </>;
}
