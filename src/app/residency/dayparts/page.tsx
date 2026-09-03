import { redirect } from "next/navigation";
import { DaypartRouteManager } from "@/components/daypart-route-manager";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { getDaypartsForResidency } from "@/services/dayparts";
import { getRoomsForResidency } from "@/services/rooms";

export default async function ResidencyDaypartsPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const [actor, params] = await Promise.all([requireResidencyActor(), searchParams]);
  if (!canResidencyRoleAccess(actor.accessRole, "manage_dayparts")) redirect("/residency/calendar");
  const [dayparts, rooms] = await Promise.all([getDaypartsForResidency(actor.residencyId), getRoomsForResidency(actor.residencyId)]);

  return <DaypartRouteManager
    residencyId={actor.residencyId}
    dayparts={dayparts.map((daypart) => ({ ...daypart, defaultTalentRateCents: null }))}
    rooms={rooms}
    hideFinancials
    fullProgrammingClient={actor.residencyTier === "complete"}
    initialCreate={actor.accessRole === "manager" && params.create === "1"}
  />;
}
