const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type CalendarTone = "blue" | "navy" | "sky" | "orange";

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
