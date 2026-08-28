import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

const sourceRowSchema = z.object({
  instagramHandle: z.string().max(160),
  serviceDate: z.iso.date(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timezone: z.string().min(1).max(100),
}).passthrough();

const publicEntrySchema = z.object({
  instagramHandle: z.string().max(160),
  date: z.iso.date(),
  startTime: z.string().min(1).max(40),
  endTime: z.string().min(1).max(40),
}).passthrough();

const publicResponseSchema = z.object({ entries: z.array(publicEntrySchema).max(10_000) }).passthrough();

export type PublicCalendarEntry = Readonly<{
  instagramHandle: string;
  date: string;
  startTime: string;
  endTime: string;
}>;

export type PublicCalendarResponse = Readonly<{ entries: PublicCalendarEntry[] }>;
export type PublicCalendarScope = "all" | "selected";

export function issuePublicCalendarToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPublicCalendarToken(token) };
}

export function hashPublicCalendarToken(token: string): string {
  if (!tokenPattern.test(token)) throw new Error("Invalid public calendar token.");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A second, query-independent guard for a scoped public calendar. */
export function publicCalendarDaypartAllowed(scope: PublicCalendarScope, allowedDaypartIds: ReadonlySet<string>, daypartId: string | null): boolean {
  return scope === "all" || (daypartId !== null && allowedDaypartIds.has(daypartId));
}

function localTime(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

/**
 * The only conversion from privileged query rows into public calendar data.
 * Extra source properties are deliberately discarded here, including if the
 * database query is expanded later.
 */
export function projectPublicCalendarRows(rows: unknown[]): PublicCalendarEntry[] {
  return rows.map((candidate) => {
    const row = sourceRowSchema.parse(candidate);
    return Object.freeze({
      instagramHandle: row.instagramHandle,
      date: row.serviceDate,
      startTime: localTime(row.startsAt, row.timezone),
      endTime: localTime(row.endsAt, row.timezone),
    });
  });
}

/** Re-applies the allow-list at the final HTTP/page boundary. */
export function enforcePublicCalendarResponse(candidate: unknown): PublicCalendarResponse {
  const parsed = publicResponseSchema.parse(candidate);
  return Object.freeze({
    entries: parsed.entries.map((entry) => Object.freeze({
      instagramHandle: entry.instagramHandle,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
    })),
  });
}
