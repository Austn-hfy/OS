import { addDays } from "./airtable-parity";

export const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type DaypartRuleInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  defaultDjCount?: number | null;
};

export type DaypartType = "dj_artist" | "house_activity";
export type DaypartBillingMode = "billed_by_hfy" | "tracking_only";
export type DaypartBookingRecordKind = "financial_shift" | "tracking_occurrence";

export function daypartBookingRecordKind(type: DaypartType, billingMode: DaypartBillingMode | null): DaypartBookingRecordKind {
  if (type === "house_activity") return "tracking_occurrence";
  return billingMode === "tracking_only" ? "tracking_occurrence" : "financial_shift";
}

export type ProjectableDaypart = {
  id: string;
  name: string;
  room: string;
  color: string;
  type: DaypartType;
  billingMode: DaypartBillingMode | null;
  active: boolean;
  activeUntil: string | null;
  defaultTalentRateCents: number | null;
  rules: DaypartRuleInput[];
};

export type ProjectedDaypartSlot = {
  id: string;
  date: string;
  daypartId: string;
  name: string;
  room: string;
  color: string;
  type: DaypartType;
  billingMode: DaypartBillingMode | null;
  defaultTalentRateCents: number | null;
  defaultDjCount: number | null;
  startMinute: number;
  endMinute: number;
};

export type DaypartDateException = {
  daypartId: string;
  serviceDate: string;
  kind: "skip" | "override";
  startMinute: number | null;
  endMinute: number | null;
};

export type SlotSchedulingStatus = "empty" | "partial" | "filled";

export function weekdayForDate(serviceDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(serviceDate);
  if (!match) throw new Error("Date must use YYYY-MM-DD.");
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== serviceDate) throw new Error("Choose a valid calendar date.");
  return date.getUTCDay();
}

export function clockToMinute(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Time must use HH:mm.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("Choose a valid time.");
  return hour * 60 + minute;
}

export function resolveEndMinute(startMinute: number, endClock: string): number {
  const end = clockToMinute(endClock);
  return end <= startMinute ? end + 1440 : end;
}

export function resolveAssignmentMinutes(
  shiftStartMinute: number,
  shiftEndMinute: number,
  assignmentStartClock: string,
  assignmentEndClock: string,
): { startMinute: number; endMinute: number; withinShift: boolean } {
  let startMinute = clockToMinute(assignmentStartClock);
  if (shiftEndMinute > 1440 && startMinute < shiftStartMinute) startMinute += 1440;
  const endMinute = resolveEndMinute(startMinute, assignmentEndClock);
  return {
    startMinute,
    endMinute,
    withinShift: startMinute >= shiftStartMinute && endMinute <= shiftEndMinute && endMinute > startMinute,
  };
}

export function hasOverlappingAssignmentMinutes(windows: Array<{ startMinute: number; endMinute: number }>): boolean {
  return windows.some((window, index) => windows.slice(index + 1).some((other) => (
    window.startMinute < other.endMinute && window.endMinute > other.startMinute
  )));
}

export function minuteToClock(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function formatLocalMinute(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minutePart = normalized % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${String(minutePart).padStart(2, "0")} ${suffix}`;
}

function compactClockPart(minute: number) {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minutePart = normalized % 60;
  return {
    clock: minutePart ? `${hour % 12 || 12}:${String(minutePart).padStart(2, "0")}` : String(hour % 12 || 12),
    suffix: hour >= 12 ? "PM" : "AM",
  };
}

export function formatCompactMinuteRange(startMinute: number, endMinute: number): string {
  const start = compactClockPart(startMinute);
  const end = compactClockPart(endMinute);
  return start.suffix === end.suffix
    ? `${start.clock}–${end.clock} ${end.suffix}`
    : `${start.clock} ${start.suffix}–${end.clock} ${end.suffix}`;
}

export function slotSchedulingStatus(
  slotStartMinute: number,
  slotEndMinute: number,
  assignmentWindows: Array<{ startMinute: number; endMinute: number }>,
): SlotSchedulingStatus {
  const windows = assignmentWindows
    .map((window) => ({
      startMinute: Math.max(slotStartMinute, window.startMinute),
      endMinute: Math.min(slotEndMinute, window.endMinute),
    }))
    .filter((window) => window.endMinute > window.startMinute)
    .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);
  if (!windows.length) return "empty";

  let coveredUntil = slotStartMinute;
  for (const window of windows) {
    if (window.startMinute > coveredUntil) return "partial";
    coveredUntil = Math.max(coveredUntil, window.endMinute);
    if (coveredUntil >= slotEndMinute) return "filled";
  }
  return "partial";
}

export function localDateTimeForMinute(serviceDate: string, minute: number): string {
  if (!Number.isInteger(minute) || minute < 0 || minute > 2879) throw new Error("Local minute is outside the supported daypart range.");
  const date = minute >= 1440 ? addDays(serviceDate, 1) : serviceDate;
  return `${date}T${minuteToClock(minute)}`;
}

export function validateDaypartRules(rules: DaypartRuleInput[]): DaypartRuleInput[] {
  if (!rules.length) throw new Error("Select at least one operating day.");
  const weekdays = new Set<number>();
  return rules.map((rule) => {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) throw new Error("Choose a valid weekday.");
    if (weekdays.has(rule.weekday)) throw new Error(`${weekdayNames[rule.weekday]} appears more than once.`);
    weekdays.add(rule.weekday);
    if (!Number.isInteger(rule.startMinute) || rule.startMinute < 0 || rule.startMinute >= 1440) throw new Error(`${weekdayNames[rule.weekday]} needs a valid start time.`);
    if (!Number.isInteger(rule.endMinute) || rule.endMinute <= rule.startMinute || rule.endMinute > rule.startMinute + 1440) throw new Error(`${weekdayNames[rule.weekday]} needs a valid end time.`);
    const defaultDjCount = rule.defaultDjCount ?? null;
    if (defaultDjCount !== null && (!Number.isInteger(defaultDjCount) || defaultDjCount < 1 || defaultDjCount > 20)) {
      throw new Error(`${weekdayNames[rule.weekday]} needs a DJ count between 1 and 20.`);
    }
    return { ...rule, defaultDjCount };
  }).sort((left, right) => left.weekday - right.weekday);
}

export function projectDaypartSlots(
  dayparts: ProjectableDaypart[],
  rangeStart: string,
  rangeEnd: string,
  existingDaypartDates: ReadonlySet<string> = new Set(),
  dateExceptions: readonly DaypartDateException[] = [],
): ProjectedDaypartSlot[] {
  weekdayForDate(rangeStart);
  weekdayForDate(rangeEnd);
  if (rangeEnd < rangeStart) throw new Error("The projection end date must be on or after its start date.");

  const slots: ProjectedDaypartSlot[] = [];
  const exceptionsByDaypartDate = new Map(
    dateExceptions.map((exception) => [`${exception.daypartId}:${exception.serviceDate}`, exception] as const),
  );
  let date = rangeStart;
  let daysVisited = 0;
  while (date <= rangeEnd) {
    if (daysVisited > 400) throw new Error("Daypart projections are limited to 400 days at a time.");
    const weekday = weekdayForDate(date);
    for (const daypart of dayparts) {
      if (!daypart.active || (daypart.activeUntil && date > daypart.activeUntil)) continue;
      const rule = daypart.rules.find((item) => item.weekday === weekday);
      if (!rule || existingDaypartDates.has(`${daypart.id}:${date}`)) continue;
      const dateException = exceptionsByDaypartDate.get(`${daypart.id}:${date}`);
      if (dateException?.kind === "skip") continue;
      const startMinute = dateException?.kind === "override" ? dateException.startMinute : rule.startMinute;
      const endMinute = dateException?.kind === "override" ? dateException.endMinute : rule.endMinute;
      if (startMinute === null || endMinute === null) continue;
      slots.push({
        id: `projected:${daypart.id}:${date}`,
        date,
        daypartId: daypart.id,
        name: daypart.name,
        room: daypart.room,
        color: daypart.color,
        type: daypart.type,
        billingMode: daypart.billingMode,
        defaultTalentRateCents: daypart.defaultTalentRateCents,
        defaultDjCount: rule.defaultDjCount ?? null,
        startMinute,
        endMinute,
      });
    }
    date = addDays(date, 1);
    daysVisited += 1;
  }
  return slots;
}
