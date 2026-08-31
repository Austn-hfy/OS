import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { residencies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isResidencyAccessError, requireActorForResidency } from "@/lib/auth";
import { getDaypartsForResidency } from "@/services/dayparts";

export const maxDuration = 30;

export function residencyAccessErrorResponse(error: unknown): NextResponse | null {
  if (!isResidencyAccessError(error)) return null;
  return NextResponse.json(
    { error: error.status === 401 ? "Unauthorized." : "Forbidden." },
    { status: error.status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ residencyId: string }> }) {
  const residencyId = z.uuid().parse((await params).residencyId);
  let actor: Awaited<ReturnType<typeof requireActorForResidency>>;
  try {
    actor = await requireActorForResidency(residencyId);
  } catch (error) {
    const response = residencyAccessErrorResponse(error);
    if (!response) throw error;
    return response;
  }
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
