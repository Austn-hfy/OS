import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  attentionItems,
  platformOverageEvents,
  platformSubscriptions,
  platformUsageSnapshots,
  residencies,
} from "@/db/schema";
import { comparePlatformUsage, type PlatformUsageCounts } from "@/domain/platform-billing";
import { assertCurrentPlatformBillingStaging } from "@/lib/platform-billing-stage";

export type PlatformUsageMetricName = "talent_sessions" | "house_programs";

type PlatformUsageCountRow = {
  talent_sessions: number;
  house_programs: number;
};

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { year: Number(part("year")), month: Number(part("month")), day: Number(part("day")) };
}

export function platformUsageMonthWindow(date: Date, timezone: string) {
  const { year, month, day } = localDateParts(date, timezone);
  const snapshotDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const periodStart = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { snapshotDate, periodStart, periodEnd };
}

export function platformUsageCountsQuery(residencyId: string, periodStart: string, periodEnd: string) {
  return sql`
    WITH talent_activity AS (
      SELECT shift.daypart_id, shift.service_date
      FROM shifts AS shift
      INNER JOIN dayparts AS daypart ON daypart.id = shift.daypart_id
      WHERE shift.residency_id = ${residencyId}
        AND daypart.residency_id = ${residencyId}
        AND daypart.type = 'dj_artist'
        AND shift.service_date BETWEEN ${periodStart}::date AND ${periodEnd}::date

      UNION

      SELECT occurrence.daypart_id, occurrence.service_date
      FROM schedule_occurrences AS occurrence
      INNER JOIN dayparts AS daypart ON daypart.id = occurrence.daypart_id
      WHERE occurrence.residency_id = ${residencyId}
        AND daypart.residency_id = ${residencyId}
        AND daypart.type = 'dj_artist'
        AND occurrence.service_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
    ), qualifying_house_dayparts AS (
      SELECT daypart.id
      FROM dayparts AS daypart
      WHERE daypart.residency_id = ${residencyId}
        AND daypart.type = 'house_activity'
        AND daypart.active = true
        AND (
          EXISTS (
            SELECT 1
            FROM shifts AS shift
            WHERE shift.residency_id = ${residencyId}
              AND shift.daypart_id = daypart.id
              AND shift.service_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
          )
          OR EXISTS (
            SELECT 1
            FROM schedule_occurrences AS occurrence
            WHERE occurrence.residency_id = ${residencyId}
              AND occurrence.daypart_id = daypart.id
              AND occurrence.service_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
          )
        )
    )
    SELECT
      (SELECT count(*)::integer FROM talent_activity) AS talent_sessions,
      (SELECT count(*)::integer FROM qualifying_house_dayparts) AS house_programs
  `;
}

export async function loadPlatformLiveUsage(residencyId: string, at = new Date()) {
  const database = getDb();
  const [plan] = await database.select({
    id: platformSubscriptions.id,
    residencyId: platformSubscriptions.residencyId,
    talentProgramSessions: platformSubscriptions.talentProgramSessions,
    housePrograms: platformSubscriptions.housePrograms,
    oneOffAllowance: platformSubscriptions.oneOffAllowance,
    timezone: residencies.timezone,
  }).from(platformSubscriptions)
    .innerJoin(residencies, eq(platformSubscriptions.residencyId, residencies.id))
    .where(eq(platformSubscriptions.residencyId, residencyId))
    .limit(1);
  if (!plan) return null;

  const window = platformUsageMonthWindow(at, plan.timezone);
  const result = await database.execute<PlatformUsageCountRow>(
    platformUsageCountsQuery(residencyId, window.periodStart, window.periodEnd),
  );
  const row = result.rows[0];
  const usage: PlatformUsageCounts = {
    talentSessions: Number(row?.talent_sessions ?? 0),
    housePrograms: Number(row?.house_programs ?? 0),
    // Kept at zero for schema compatibility. One-off activity is classified
    // by Daypart type as Talent sessions or House programs.
    oneOffs: 0,
  };
  return {
    plan,
    usage,
    comparison: comparePlatformUsage(plan, usage),
    ...window,
  };
}

function attentionCode(metric: PlatformUsageMetricName, periodStart: string) {
  return `platform_overage_${metric}_${periodStart}`;
}

export async function reconcilePlatformUsage(residencyId: string, at = new Date()) {
  assertCurrentPlatformBillingStaging();
  const live = await loadPlatformLiveUsage(residencyId, at);
  if (!live) return null;
  const database = getDb();
  const capturedAt = new Date();
  await database.insert(platformUsageSnapshots).values({
    residencyId,
    platformSubscriptionId: live.plan.id,
    snapshotDate: live.snapshotDate,
    periodStart: live.periodStart,
    periodEnd: live.periodEnd,
    ...live.usage,
    capturedAt,
  }).onConflictDoUpdate({
    target: [platformUsageSnapshots.residencyId, platformUsageSnapshots.snapshotDate],
    set: { ...live.usage, capturedAt },
  });

  const metrics: Array<{ metric: PlatformUsageMetricName; committed: number; current: number }> = [
    { metric: "talent_sessions", committed: live.plan.talentProgramSessions, current: live.usage.talentSessions },
    { metric: "house_programs", committed: live.plan.housePrograms, current: live.usage.housePrograms },
  ];

  for (const item of metrics) {
    const code = attentionCode(item.metric, live.periodStart);
    if (item.current > item.committed) {
      const overBy = item.current - item.committed;
      const [event] = await database.insert(platformOverageEvents).values({
        residencyId,
        platformSubscriptionId: live.plan.id,
        periodStart: live.periodStart,
        periodEnd: live.periodEnd,
        metric: item.metric,
        committedCount: item.committed,
        liveCount: item.current,
        overBy,
        firstDetectedAt: capturedAt,
        lastDetectedAt: capturedAt,
      }).onConflictDoUpdate({
        target: [platformOverageEvents.residencyId, platformOverageEvents.periodStart, platformOverageEvents.metric],
        set: {
          committedCount: item.committed,
          liveCount: item.current,
          overBy,
          lastDetectedAt: capturedAt,
          resolvedAt: null,
        },
      }).returning({ id: platformOverageEvents.id });
      if (event) {
        await database.insert(attentionItems).values({
          residencyId,
          entityType: "platform_subscription",
          entityId: live.plan.id,
          code,
          message: `Platform usage is over the committed ${item.metric.replaceAll("_", " ")} allowance by ${overBy}.`,
          details: {
            metric: item.metric,
            committed: item.committed,
            live: item.current,
            overBy,
            periodStart: live.periodStart,
            periodEnd: live.periodEnd,
            behavior: "log_only_no_charge_no_access_restriction",
          },
        }).onConflictDoUpdate({
          target: [attentionItems.entityType, attentionItems.entityId, attentionItems.code],
          targetWhere: eq(attentionItems.status, "open"),
          set: {
            message: `Platform usage is over the committed ${item.metric.replaceAll("_", " ")} allowance by ${overBy}.`,
            details: {
              metric: item.metric,
              committed: item.committed,
              live: item.current,
              overBy,
              periodStart: live.periodStart,
              periodEnd: live.periodEnd,
              behavior: "log_only_no_charge_no_access_restriction",
            },
          },
        });
      }
    } else {
      await database.update(platformOverageEvents).set({ resolvedAt: capturedAt, lastDetectedAt: capturedAt })
        .where(and(
          eq(platformOverageEvents.residencyId, residencyId),
          eq(platformOverageEvents.periodStart, live.periodStart),
          eq(platformOverageEvents.metric, item.metric),
          sql`${platformOverageEvents.resolvedAt} IS NULL`,
        ));
      await database.update(attentionItems).set({ status: "resolved", resolvedAt: capturedAt })
        .where(and(
          eq(attentionItems.entityType, "platform_subscription"),
          eq(attentionItems.entityId, live.plan.id),
          eq(attentionItems.code, code),
          eq(attentionItems.status, "open"),
        ));
    }
  }
  return live;
}

export async function reconcileAllPlatformUsage(at = new Date()) {
  assertCurrentPlatformBillingStaging();
  const plans = await getDb().select({ residencyId: platformSubscriptions.residencyId }).from(platformSubscriptions);
  const results = [];
  for (const plan of plans) results.push(await reconcilePlatformUsage(plan.residencyId, at));
  return results.filter(Boolean);
}
