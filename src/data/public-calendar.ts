import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, publicCalendarLinks, residencies, scheduleOccurrences, scheduleOccurrenceTalent, shifts, talent } from "@/db/schema";
import { hashPublicCalendarToken, projectPublicCalendarRows, type PublicCalendarResponse } from "@/domain/public-calendar";

export async function getPublicCalendarByToken(token: string): Promise<PublicCalendarResponse | null> {
  let tokenHash: string;
  try {
    tokenHash = hashPublicCalendarToken(token);
  } catch {
    return null;
  }

  const database = getDb();
  const [link] = await database.select({
    residencyId: publicCalendarLinks.residencyId,
    timezone: residencies.timezone,
  }).from(publicCalendarLinks)
    .innerJoin(residencies, eq(publicCalendarLinks.residencyId, residencies.id))
    .where(and(
      eq(publicCalendarLinks.tokenHash, tokenHash),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    )).limit(1);

  if (!link) return null;

  const [financialRows, trackingRows] = await Promise.all([
    database.select({
      instagramHandle: talent.instagramHandle,
      serviceDate: shifts.serviceDate,
      startsAt: assignments.startsAt,
      endsAt: assignments.endsAt,
    }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .innerJoin(talent, eq(assignments.talentId, talent.id))
      .where(and(
        eq(shifts.residencyId, link.residencyId),
        inArray(assignments.bookingStatus, ["confirmed", "completed"]),
      )),
    database.select({
      instagramHandle: talent.instagramHandle,
      serviceDate: scheduleOccurrences.serviceDate,
      startsAt: scheduleOccurrenceTalent.startsAt,
      endsAt: scheduleOccurrenceTalent.endsAt,
    }).from(scheduleOccurrenceTalent)
      .innerJoin(scheduleOccurrences, eq(scheduleOccurrenceTalent.occurrenceId, scheduleOccurrences.id))
      .innerJoin(talent, eq(scheduleOccurrenceTalent.talentId, talent.id))
      .where(eq(scheduleOccurrences.residencyId, link.residencyId)),
  ]);
  const rows = [...financialRows, ...trackingRows].sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.startsAt.getTime() - right.startsAt.getTime());

  return {
    entries: projectPublicCalendarRows(rows.map((row) => ({ ...row, timezone: link.timezone }))),
  };
}
