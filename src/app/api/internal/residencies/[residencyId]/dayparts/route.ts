import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { residencies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireActorForResidency } from "@/lib/auth";
import { getDaypartsForResidency } from "@/services/dayparts";
import { isStandingHfyDaypart } from "@/domain/hfy-programming";
import { residencyAccessErrorResponse } from "./auth-response";
import { getRoomsForResidency } from "@/services/rooms";

export const maxDuration = 30;

export async function GET(request: Request, { params }: { params: Promise<{ residencyId: string }> }) {
  const residencyId = z.uuid().parse((await params).residencyId);
  let actor: Awaited<ReturnType<typeof requireActorForResidency>>;
  try {
    actor = await requireActorForResidency(residencyId);
  } catch (error) {
    const response = residencyAccessErrorResponse(error);
    if (!response) throw error;
    return response;
  }
  const [residencyRows, dayparts, rooms] = await Promise.all([
    getDb().select({ id: residencies.id }).from(residencies).where(and(eq(residencies.id, residencyId), eq(residencies.active, true))).limit(1),
    getDaypartsForResidency(residencyId),
    getRoomsForResidency(residencyId),
  ]);
  if (!residencyRows[0]) return NextResponse.json({ error: "Residency not found." }, { status: 404 });
  const hfyOnly = actor.kind === "internal" && new URL(request.url).searchParams.get("scope") === "hfy";
  return NextResponse.json({
    rooms,
    dayparts: dayparts.filter((daypart) => !hfyOnly || isStandingHfyDaypart(daypart)).map((daypart) => ({
      id: daypart.id,
      roomId: daypart.roomId,
      roomHue: daypart.roomHue,
      name: daypart.name,
      room: daypart.room,
      color: daypart.color,
      type: daypart.type,
      billingMode: daypart.billingMode,
      scheduleMode: daypart.scheduleMode,
      suggestedStartMinute: daypart.suggestedStartMinute,
      suggestedEndMinute: daypart.suggestedEndMinute,
      defaultTalentRateCents: actor.kind === "internal" ? daypart.defaultTalentRateCents : null,
      clientDefaultRateCents: daypart.clientDefaultRateCents,
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
