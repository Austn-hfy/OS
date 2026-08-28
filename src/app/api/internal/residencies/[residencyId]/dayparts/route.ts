import { NextResponse } from "next/server";
import { z } from "zod";
import { getResidencyList } from "@/data/internal";
import { requireInternalActor } from "@/lib/auth";
import { getDaypartsForResidency } from "@/services/dayparts";

export async function GET(_request: Request, { params }: { params: Promise<{ residencyId: string }> }) {
  await requireInternalActor();
  const residencyId = z.uuid().parse((await params).residencyId);
  const residency = (await getResidencyList()).find((item) => item.id === residencyId);
  if (!residency) return NextResponse.json({ error: "Residency not found." }, { status: 404 });
  const dayparts = await getDaypartsForResidency(residencyId);
  return NextResponse.json({
    dayparts: dayparts.map((daypart) => ({
      id: daypart.id,
      name: daypart.name,
      room: daypart.room,
      color: daypart.color,
      type: daypart.type,
      billingMode: daypart.billingMode,
      defaultTalentRateCents: daypart.defaultTalentRateCents,
      activeUntil: daypart.activeUntil,
      active: daypart.active,
      sortOrder: daypart.sortOrder,
      rules: daypart.rules.map((rule) => ({
        weekday: rule.weekday,
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
        defaultDjCount: rule.defaultDjCount,
      })),
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
