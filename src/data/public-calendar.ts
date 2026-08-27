import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, publicCalendarLinks, residencies, shifts, talent } from "@/db/schema";
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

  const rows = await database.select({
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
    ))
    .orderBy(asc(shifts.serviceDate), asc(assignments.startsAt));

  return {
    entries: projectPublicCalendarRows(rows.map((row) => ({ ...row, timezone: link.timezone }))),
  };
}
