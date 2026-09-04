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

export type PlatformUsageMetricName = "talent_sessions" | "house_programs" | "one_offs";

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
  const result = await database.execute<{
    talent_sessions: number;
    house_programs: number;
    one_offs: number;
  }>(sql`
    WITH standing_usage AS (
      SELECT
        count(rule.id) FILTER (WHERE daypart.type = 'dj_artist')::integer AS talent_sessions,
        count(DISTINCT daypart.id) FILTER (WHERE daypart.type = 'house_activity')::integer AS house_programs
      FROM dayparts AS daypart
      INNER JOIN daypart_day_rules AS rule ON rule.daypart_id = daypart.id
      WHERE daypart.residency_id = ${residencyId}
        AND daypart.schedule_mode = 'standing_weekly'
        AND daypart.active = true
        AND daypart.created_at::date <= ${window.snapshotDate}::date
        AND (daypart.active_until IS NULL OR daypart.active_until >= ${window.snapshotDate}::date)
    ), one_off_usage AS (
      SELECT count(*)::integer AS one_offs
      FROM dayparts AS daypart
      WHERE daypart.residency_id = ${residencyId}
        AND daypart.schedule_mode = 'calendar_only'
        AND (
          EXISTS (
            SELECT 1 FROM shifts AS shift
            WHERE shift.daypart_id = daypart.id
              AND shift.service_date BETWEEN ${window.periodStart}::date AND ${window.periodEnd}::date
          )
          OR EXISTS (
            SELECT 1 FROM schedule_occurrences AS occurrence
            WHERE occurrence.daypart_id = daypart.id
              AND occurrence.service_date BETWEEN ${window.periodStart}::date AND ${window.periodEnd}::date
          )
        )
    )
    SELECT coalesce(standing_usage.talent_sessions, 0)::integer AS talent_sessions,
      coalesce(standing_usage.house_programs, 0)::integer AS house_programs,
      coalesce(one_off_usage.one_offs, 0)::integer AS one_offs
    FROM standing_usage CROSS JOIN one_off_usage
  `);
  const row = result.rows[0];
  const usage: PlatformUsageCounts = {
    talentSessions: Number(row?.talent_sessions ?? 0),
    housePrograms: Number(row?.house_programs ?? 0),
    oneOffs: Number(row?.one_offs ?? 0),
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
    { metric: "one_offs", committed: live.plan.oneOffAllowance, current: live.usage.oneOffs },
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
