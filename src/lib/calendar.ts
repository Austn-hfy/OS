const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_KEY = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export type CalendarTone = "blue" | "navy" | "sky" | "orange";
export type CalendarViewMode = "month" | "week";

export function calendarDaypartsHref(residencyId: string, previewMode: boolean, override?: string): string {
  if (override) return override;
  if (previewMode) return "/residency/dayparts";
  return `/app/dayparts?${new URLSearchParams({ mode: "hfy", residency: residencyId }).toString()}`;
}

export function calendarToneForSlot(name: string, fallback: CalendarTone = "navy"): CalendarTone {
  const normalizedName = name.toLowerCase();
  if (normalizedName.includes("pool")) return "blue";
  if (normalizedName.includes("amigo")) return "orange";
  return fallback;
}

export function currentMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function normalizeMonthKey(value?: string, fallback = currentMonthKey()): string {
  return value && MONTH_KEY.test(value) ? value : fallback;
}

export function normalizeCalendarView(value?: string): CalendarViewMode {
  return value === "week" ? "week" : "month";
}

function dateFromKey(value: string): Date | null {
  if (!DATE_KEY.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function shiftDateKey(dateKey: string, amount: number): string {
  const date = dateFromKey(dateKey);
  if (!date) throw new Error(`Invalid calendar date: ${dateKey}`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(dateKey: string): string {
  const date = dateFromKey(dateKey);
  if (!date) throw new Error(`Invalid calendar date: ${dateKey}`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

export function normalizeWeekStart(value: string | undefined, monthKey: string, today = new Date()): string {
  if (value && dateFromKey(value)) return startOfWeek(value);
  const normalizedMonth = normalizeMonthKey(monthKey);
  const fallbackDate = normalizedMonth === currentMonthKey(today) ? today.toISOString().slice(0, 10) : `${normalizedMonth}-01`;
  return startOfWeek(fallbackDate);
}

export function weekRange(weekStart: string) {
  const from = startOfWeek(weekStart);
  return { from, to: shiftDateKey(from, 6) };
}

export function weekDays(weekStart: string) {
  const from = startOfWeek(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const iso = shiftDateKey(from, index);
    const date = dateFromKey(iso)!;
    return {
      iso,
      day: date.getUTCDate(),
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date),
      month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
    };
  });
}

export function monthKeyForDate(dateKey: string): string {
  const date = dateFromKey(dateKey);
  if (!date) throw new Error(`Invalid calendar date: ${dateKey}`);
  return currentMonthKey(date);
}

export function weekLabel(weekStart: string): string {
  const from = startOfWeek(weekStart);
  const to = shiftDateKey(from, 6);
  const fromDate = dateFromKey(from)!;
  const toDate = dateFromKey(to)!;
  const sameMonth = fromDate.getUTCFullYear() === toDate.getUTCFullYear() && fromDate.getUTCMonth() === toDate.getUTCMonth();
  const sameYear = fromDate.getUTCFullYear() === toDate.getUTCFullYear();
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (sameMonth) {
    const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(fromDate);
    return `${month} ${fromDate.getUTCDate()}–${toDate.getUTCDate()}, ${toDate.getUTCFullYear()}`;
  }
  if (sameYear) return `${monthDay.format(fromDate)}–${monthDay.format(toDate)}, ${toDate.getUTCFullYear()}`;
  const full = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${full.format(fromDate)}–${full.format(toDate)}`;
}

export function monthParts(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

export function shiftMonthKey(monthKey: string, amount: number): string {
  const { year, monthIndex } = monthParts(monthKey);
  const date = new Date(Date.UTC(year, monthIndex + amount, 1));
  return currentMonthKey(date);
}

export function monthLabel(monthKey: string): string {
  const { year, monthIndex } = monthParts(monthKey);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthIndex, 1)));
}

export function monthRange(monthKey: string) {
  const { year, monthIndex } = monthParts(monthKey);
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return { from: `${prefix}-01`, to: `${prefix}-${String(lastDay).padStart(2, "0")}` };
}

export function monthGrid(monthKey: string) {
  const { year, monthIndex } = monthParts(monthKey);
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  return Array.from({ length: cells }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, index - firstWeekday + 1));
    const iso = date.toISOString().slice(0, 10);
    return { iso, day: date.getUTCDate(), inMonth: date.getUTCMonth() === monthIndex };
  });
}
