import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, publicCalendarLinkDayparts, publicCalendarLinks, residencies, scheduleOccurrences, scheduleOccurrenceTalent, shifts, talent } from "@/db/schema";
import { hashPublicCalendarToken, projectPublicCalendarRows, publicCalendarDaypartAllowed, type PublicCalendarResponse } from "@/domain/public-calendar";

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
    scope: publicCalendarLinks.scope,
    timezone: residencies.timezone,
  }).from(publicCalendarLinks)
    .innerJoin(residencies, eq(publicCalendarLinks.residencyId, residencies.id))
    .where(and(
      eq(publicCalendarLinks.tokenHash, tokenHash),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    )).limit(1);

  if (!link) return null;

  const selectedDayparts = link.scope === "selected"
    ? await database.select({ daypartId: publicCalendarLinkDayparts.daypartId })
      .from(publicCalendarLinkDayparts)
      .where(eq(publicCalendarLinkDayparts.residencyId, link.residencyId))
    : [];
  const selectedDaypartIds = selectedDayparts.map(({ daypartId }) => daypartId);
  const selectedDaypartIdSet = new Set(selectedDaypartIds);

  // A selected-scope link with no allow-listed Dayparts is intentionally empty.
  // It must never fall through to the all-Dayparts behavior.
  if (link.scope === "selected" && selectedDaypartIds.length === 0) return { entries: [] };

  const [financialRows, trackingRows] = await Promise.all([
    database.select({
      daypartId: shifts.daypartId,
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
        ...(link.scope === "selected" ? [inArray(shifts.daypartId, selectedDaypartIds)] : []),
      )),
    database.select({
      daypartId: scheduleOccurrences.daypartId,
      instagramHandle: talent.instagramHandle,
      serviceDate: scheduleOccurrences.serviceDate,
      startsAt: scheduleOccurrenceTalent.startsAt,
      endsAt: scheduleOccurrenceTalent.endsAt,
    }).from(scheduleOccurrenceTalent)
      .innerJoin(scheduleOccurrences, eq(scheduleOccurrenceTalent.occurrenceId, scheduleOccurrences.id))
      .innerJoin(talent, eq(scheduleOccurrenceTalent.talentId, talent.id))
      .where(and(
        eq(scheduleOccurrences.residencyId, link.residencyId),
        ...(link.scope === "selected" ? [inArray(scheduleOccurrences.daypartId, selectedDaypartIds)] : []),
      )),
  ]);
  const rows = [...financialRows, ...trackingRows]
    .filter((row) => publicCalendarDaypartAllowed(link.scope, selectedDaypartIdSet, row.daypartId))
    .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.startsAt.getTime() - right.startsAt.getTime());

  return {
    entries: projectPublicCalendarRows(rows.map((row) => ({ ...row, timezone: link.timezone }))),
  };
}
