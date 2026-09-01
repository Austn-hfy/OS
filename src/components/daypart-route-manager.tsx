"use client";

import { useRouter } from "next/navigation";
import { DaypartManager, type DaypartRow } from "@/app/app/setup/daypart-manager";

export function DaypartRouteManager({
  residencyId,
  dayparts,
  hideFinancials = false,
  initialCreate = false,
}: {
  residencyId: string;
  dayparts: DaypartRow[];
  hideFinancials?: boolean;
  initialCreate?: boolean;
}) {
  const router = useRouter();
  return <DaypartManager
    residencyId={residencyId}
    dayparts={dayparts}
    hideFinancials={hideFinancials}
    initialCreate={initialCreate}
    onSaved={() => router.refresh()}
  />;
}
