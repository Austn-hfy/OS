import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

const sourceRowSchema = z.object({
  daypartName: z.string().trim().min(1).max(160),
  room: z.string().trim().max(160),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  artistName: z.string().trim().min(1).max(160).nullish(),
  instagramHandle: z.string().max(160).nullish(),
  serviceDate: z.iso.date(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timezone: z.string().min(1).max(100),
}).passthrough();

const publicArtistSchema = z.object({
  name: z.string().trim().min(1).max(160),
  instagramHandle: z.string().max(160),
}).passthrough();

const publicEntrySchema = z.object({
  daypartName: z.string().trim().min(1).max(160),
  room: z.string().trim().max(160),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  date: z.iso.date(),
  startTime: z.string().min(1).max(40),
  endTime: z.string().min(1).max(40),
  artists: z.array(publicArtistSchema).max(30),
}).passthrough();

const publicDaypartSchema = z.object({
  name: z.string().trim().min(1).max(160),
  room: z.string().trim().max(160),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
}).passthrough();

const publicResponseSchema = z.object({
  residencyName: z.string().trim().min(1).max(160),
  scope: z.enum(["all", "selected"]).default("all"),
  dayparts: z.array(publicDaypartSchema).max(100).default([]),
  entries: z.array(publicEntrySchema).max(10_000),
}).passthrough();

export type PublicCalendarArtist = Readonly<{
  name: string;
  instagramHandle: string;
}>;

export type PublicCalendarEntry = Readonly<{
  daypartName: string;
  room: string;
  color: string;
  date: string;
  startTime: string;
  endTime: string;
  artists: PublicCalendarArtist[];
}>;

export type PublicCalendarDaypart = Readonly<{
  name: string;
  room: string;
  color: string;
}>;

export type PublicCalendarResponse = Readonly<{
  residencyName: string;
  scope: PublicCalendarScope;
  dayparts: PublicCalendarDaypart[];
  entries: PublicCalendarEntry[];
}>;
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
  const grouped = new Map<string, {
    daypartName: string;
    room: string;
    color: string;
    date: string;
    startTime: string;
    endTime: string;
    artists: PublicCalendarArtist[];
  }>();

  for (const candidate of rows) {
    const row = sourceRowSchema.parse(candidate);
    const key = [row.serviceDate, row.startsAt.toISOString(), row.endsAt.toISOString(), row.daypartName, row.room, row.color].join("\u0000");
    const entry = grouped.get(key) ?? {
      daypartName: row.daypartName,
      room: row.room,
      color: row.color,
      date: row.serviceDate,
      startTime: localTime(row.startsAt, row.timezone),
      endTime: localTime(row.endsAt, row.timezone),
      artists: [],
    };
    if (row.artistName) {
      const artist = { name: row.artistName, instagramHandle: row.instagramHandle ?? "" };
      if (!entry.artists.some((current) => current.name === artist.name && current.instagramHandle === artist.instagramHandle)) {
        entry.artists.push(Object.freeze(artist));
      }
    }
    grouped.set(key, entry);
  }

  return [...grouped.values()].map((entry) => Object.freeze({
    ...entry,
    artists: Object.freeze([...entry.artists]) as PublicCalendarArtist[],
  }));
}

/** Re-applies the allow-list at the final HTTP/page boundary. */
export function enforcePublicCalendarResponse(candidate: unknown): PublicCalendarResponse {
  const parsed = publicResponseSchema.parse(candidate);
  return Object.freeze({
    residencyName: parsed.residencyName,
    scope: parsed.scope,
    dayparts: parsed.dayparts.map((daypart) => Object.freeze({
      name: daypart.name,
      room: daypart.room,
      color: daypart.color,
    })),
    entries: parsed.entries.map((entry) => Object.freeze({
      daypartName: entry.daypartName,
      room: entry.room,
      color: entry.color,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      artists: entry.artists.map((artist) => Object.freeze({
        name: artist.name,
        instagramHandle: artist.instagramHandle,
      })),
    })),
  });
}
