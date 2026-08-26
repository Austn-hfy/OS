type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInTimeZone(now: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function localDateKey(now: Date, timeZone: string): string {
  const { year, month, day } = partsInTimeZone(now, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function hasReachedDailyRunWindow(now: Date, timeZone: string, hour = 6): boolean {
  return partsInTimeZone(now, timeZone).hour >= hour;
}

export function isPastServiceDate(serviceDate: string, now: Date, timeZone: string): boolean {
  return serviceDate < localDateKey(now, timeZone);
}

export function zonedLocalDateTimeToUtc(localDateTime: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTime);
  if (!match) throw new Error("Date and time must use YYYY-MM-DDTHH:mm.");
  const [, year, month, day, hour, minute] = match.map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = desiredAsUtc;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = partsInTimeZone(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess += desiredAsUtc - actualAsUtc;
  }

  const result = new Date(guess);
  const roundTrip = partsInTimeZone(result, timeZone);
  if (roundTrip.year !== year || roundTrip.month !== month || roundTrip.day !== day || roundTrip.hour !== hour || roundTrip.minute !== minute) {
    throw new Error("That local time does not exist in the Residency timezone.");
  }
  return result;
}
