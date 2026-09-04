import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, dayparts, publicCalendarLinkDayparts, publicCalendarLinks, residencies, scheduleOccurrences, scheduleOccurrenceTalent, shifts, talent } from "@/db/schema";
import { calendarColorForEconomics, DEFAULT_DAYPART_COLOR } from "@/domain/dayparts";
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
    id: publicCalendarLinks.id,
    residencyId: publicCalendarLinks.residencyId,
    scope: publicCalendarLinks.scope,
    timezone: residencies.timezone,
    residencyName: residencies.name,
  }).from(publicCalendarLinks)
    .innerJoin(residencies, eq(publicCalendarLinks.residencyId, residencies.id))
    .where(and(
      eq(publicCalendarLinks.tokenHash, tokenHash),
      isNull(publicCalendarLinks.revokedAt),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    )).limit(1);

  if (!link) return null;

  const selectedDayparts = link.scope === "selected"
    ? await database.select({ daypartId: publicCalendarLinkDayparts.daypartId })
      .from(publicCalendarLinkDayparts)
      .where(eq(publicCalendarLinkDayparts.linkId, link.id))
    : [];
  const selectedDaypartIds = selectedDayparts.map(({ daypartId }) => daypartId);
  const selectedDaypartIdSet = new Set(selectedDaypartIds);

  // A selected-scope link with no allow-listed Dayparts is intentionally empty.
  // It must never fall through to the all-Dayparts behavior.
  if (link.scope === "selected" && selectedDaypartIds.length === 0) return { residencyName: link.residencyName, entries: [] };

  const [financialRows, trackingRows] = await Promise.all([
    database.select({
      daypartId: shifts.daypartId,
      daypartName: shifts.name,
      room: shifts.room,
      daypartColor: dayparts.color,
      shiftCalendarColor: shifts.calendarColor,
      economicsMode: shifts.economicsMode,
      artistName: talent.stageName,
      instagramHandle: talent.instagramHandle,
      serviceDate: shifts.serviceDate,
      startsAt: shifts.startsAt,
      endsAt: shifts.endsAt,
    }).from(assignments)
      .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
      .leftJoin(dayparts, eq(shifts.daypartId, dayparts.id))
      .innerJoin(talent, eq(assignments.talentId, talent.id))
      .where(and(
        eq(shifts.residencyId, link.residencyId),
        inArray(assignments.bookingStatus, ["confirmed", "completed"]),
        ...(link.scope === "selected" ? [inArray(shifts.daypartId, selectedDaypartIds)] : []),
      )),
    database.select({
      daypartId: scheduleOccurrences.daypartId,
      daypartName: scheduleOccurrences.name,
      room: scheduleOccurrences.room,
      color: scheduleOccurrences.color,
      artistName: talent.stageName,
      instagramHandle: talent.instagramHandle,
      serviceDate: scheduleOccurrences.serviceDate,
      startsAt: scheduleOccurrences.startsAt,
      endsAt: scheduleOccurrences.endsAt,
    }).from(scheduleOccurrenceTalent)
      .innerJoin(scheduleOccurrences, eq(scheduleOccurrenceTalent.occurrenceId, scheduleOccurrences.id))
      .innerJoin(talent, eq(scheduleOccurrenceTalent.talentId, talent.id))
      .where(and(
        eq(scheduleOccurrences.residencyId, link.residencyId),
        ...(link.scope === "selected" ? [inArray(scheduleOccurrences.daypartId, selectedDaypartIds)] : []),
      )),
  ]);
  const rows = [
    ...financialRows.map((row) => ({
      ...row,
      color: calendarColorForEconomics(
        row.daypartColor ?? DEFAULT_DAYPART_COLOR,
        row.shiftCalendarColor,
        row.economicsMode,
      ) ?? DEFAULT_DAYPART_COLOR,
    })),
    ...trackingRows,
  ]
    .filter((row) => publicCalendarDaypartAllowed(link.scope, selectedDaypartIdSet, row.daypartId))
    .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.startsAt.getTime() - right.startsAt.getTime());

  return {
    residencyName: link.residencyName,
    entries: projectPublicCalendarRows(rows.map((row) => ({ ...row, timezone: link.timezone }))),
  };
}
