import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { residencies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireActorForResidency } from "@/lib/auth";
import { getDaypartsForResidency } from "@/services/dayparts";

export const maxDuration = 30;

export async function GET(_request: Request, { params }: { params: Promise<{ residencyId: string }> }) {
  const residencyId = z.uuid().parse((await params).residencyId);
  const actor = await requireActorForResidency(residencyId);
  const [residencyRows, dayparts] = await Promise.all([
    getDb().select({ id: residencies.id }).from(residencies).where(and(eq(residencies.id, residencyId), eq(residencies.active, true))).limit(1),
    getDaypartsForResidency(residencyId),
  ]);
  if (!residencyRows[0]) return NextResponse.json({ error: "Residency not found." }, { status: 404 });
  return NextResponse.json({
    dayparts: dayparts.map((daypart) => ({
      id: daypart.id,
      name: daypart.name,
      room: daypart.room,
      color: daypart.color,
      type: daypart.type,
      billingMode: daypart.billingMode,
      defaultTalentRateCents: actor.kind === "internal" ? daypart.defaultTalentRateCents : null,
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
