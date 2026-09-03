"use client";

import { useRouter } from "next/navigation";
import { DaypartManager, type DaypartRow } from "@/app/app/setup/daypart-manager";
import type { ResidencyRoom } from "@/services/rooms";

export function DaypartRouteManager({
  residencyId,
  dayparts,
  rooms,
  hideFinancials = false,
  initialCreate = false,
  fullProgrammingClient = false,
}: {
  residencyId: string;
  dayparts: DaypartRow[];
  rooms: ResidencyRoom[];
  hideFinancials?: boolean;
  initialCreate?: boolean;
  fullProgrammingClient?: boolean;
}) {
  const router = useRouter();
  return <DaypartManager
    residencyId={residencyId}
    dayparts={dayparts}
    residencyRooms={rooms}
    hideFinancials={hideFinancials}
    initialCreate={initialCreate}
    fullProgrammingClient={fullProgrammingClient}
    onSaved={() => router.refresh()}
  />;
}
