import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dayparts, residencies } from "@/db/schema";
import { materializeStandingDaypartDateInTransaction } from "@/services/daypart-materialization";
import { platformUsageCountsQuery } from "@/services/platform-usage";

export const ACE_SEPTEMBER_2026_BACKFILL_CONFIRMATION = "ACE SEPTEMBER 2026 REVIEWED BACKFILL";
export const ACE_SEPTEMBER_2026_RESIDENCY_ID = "50198d92-30fc-4a59-b4ba-bd79832ccfd9";
export const ACE_SEPTEMBER_2026_PRODUCTION_PROJECT_ID = "tkfsgifnywbwjdkxjhae";

export const ACE_SEPTEMBER_2026_TARGETS = [
  { name: "Line Dance With Scuff", dates: ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"] },
  { name: "Sunset Yoga", dates: ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"] },
  { name: "Dj - Vintage Vinyl Night", dates: ["2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24"] },
  { name: "Dj - Amigo Room", dates: ["2026-09-04", "2026-09-05", "2026-09-11", "2026-09-12", "2026-09-18", "2026-09-19", "2026-09-25", "2026-09-26"] },
  { name: "Dj - Main Pool", dates: ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-25", "2026-09-26", "2026-09-27"] },
  { name: "Karaoke Night", dates: ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"] },
  { name: "Deep Dives: Poolside Movie", dates: ["2026-09-06", "2026-09-13", "2026-09-20"] },
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertProductionTarget(confirmation: string) {
  assert(
    confirmation === ACE_SEPTEMBER_2026_BACKFILL_CONFIRMATION,
    `Confirmation must equal "${ACE_SEPTEMBER_2026_BACKFILL_CONFIRMATION}".`,
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL is required.");
  assert(
    new URL(supabaseUrl).hostname === `${ACE_SEPTEMBER_2026_PRODUCTION_PROJECT_ID}.supabase.co`,
    "This reviewed backfill may run only against the HFY OS production Supabase project.",
  );
}

export async function runAceSeptember2026Backfill(confirmation: string) {
  assertProductionTarget(confirmation);
  const expectedRecordCount = ACE_SEPTEMBER_2026_TARGETS.reduce((total, target) => total + target.dates.length, 0);
  assert(expectedRecordCount === 41, `The reviewed list must contain exactly 41 dated records; found ${expectedRecordCount}.`);

  return getDb().transaction(async (tx) => {
    const [ace] = await tx.select({ id: residencies.id, name: residencies.name }).from(residencies)
      .where(eq(residencies.id, ACE_SEPTEMBER_2026_RESIDENCY_ID)).limit(1);
    assert(ace, "The approved Ace Hotel Residency was not found.");
    assert(ace.name.toLowerCase().startsWith("ace hotel"), `Residency ${ACE_SEPTEMBER_2026_RESIDENCY_ID} is not Ace Hotel.`);

    const targetNames = ACE_SEPTEMBER_2026_TARGETS.map((target) => target.name);
    const targetDayparts = await tx.select({
      id: dayparts.id,
      name: dayparts.name,
      type: dayparts.type,
      scheduleMode: dayparts.scheduleMode,
      active: dayparts.active,
    }).from(dayparts).where(and(
      eq(dayparts.residencyId, ACE_SEPTEMBER_2026_RESIDENCY_ID),
      inArray(dayparts.name, targetNames),
    ));
    assert(targetDayparts.length === ACE_SEPTEMBER_2026_TARGETS.length, `Expected ${ACE_SEPTEMBER_2026_TARGETS.length} Ace Dayparts; found ${targetDayparts.length}.`);

    const daypartByName = new Map(targetDayparts.map((daypart) => [daypart.name, daypart]));
    for (const target of ACE_SEPTEMBER_2026_TARGETS) {
      const daypart = daypartByName.get(target.name);
      assert(daypart, `Ace Daypart not found: ${target.name}.`);
      assert(daypart.scheduleMode === "standing_weekly", `${target.name} is no longer a standing Daypart.`);
      assert(daypart.active, `${target.name} is no longer active.`);
    }

    const created = [];
    for (const target of ACE_SEPTEMBER_2026_TARGETS) {
      const daypart = daypartByName.get(target.name)!;
      for (const serviceDate of target.dates) {
        const materialized = await materializeStandingDaypartDateInTransaction(tx, {
          residencyId: ACE_SEPTEMBER_2026_RESIDENCY_ID,
          daypartId: daypart.id,
          serviceDate,
          actor: { userId: null, label: "reviewed-ace-september-2026-backfill" },
          source: "reviewed_backfill",
        });
        assert(materialized, `${target.name} on ${serviceDate} was not materialized; the transaction has been rolled back.`);
        created.push({ name: target.name, type: daypart.type, ...materialized });
      }
    }

    assert(created.length === expectedRecordCount, `Expected ${expectedRecordCount} new records; created ${created.length}.`);
    const talentRecords = created.filter((record) => record.type === "dj_artist").length;
    const houseRecords = created.filter((record) => record.type === "house_activity").length;
    assert(talentRecords === 38, `Expected 38 Talent records; created ${talentRecords}.`);
    assert(houseRecords === 3, `Expected 3 House records; created ${houseRecords}.`);

    const usageResult = await tx.execute<{ talent_sessions: number; house_programs: number }>(
      platformUsageCountsQuery(ACE_SEPTEMBER_2026_RESIDENCY_ID, "2026-09-01", "2026-09-30"),
    );
    const talentSessions = Number(usageResult.rows[0]?.talent_sessions ?? 0);
    const housePrograms = Number(usageResult.rows[0]?.house_programs ?? 0);
    assert(
      talentSessions === 41 && housePrograms === 3,
      `Acceptance discrepancy: corrected query returned ${talentSessions} talentSessions and ${housePrograms} housePrograms; the transaction has been rolled back.`,
    );

    return { residencyId: ace.id, residencyName: ace.name, created, talentRecords, houseRecords, talentSessions, housePrograms };
  });
}
