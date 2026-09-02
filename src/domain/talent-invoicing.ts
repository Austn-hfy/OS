export function calendarMonthPeriod(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("Choose a valid service month.");
  const start = `${monthKey}-01`;
  const [year, month] = monthKey.split("-").map(Number);
  if (month < 1 || month > 12) throw new Error("Choose a valid service month.");
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function isFullCalendarMonth(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  const period = calendarMonthPeriod(start.slice(0, 7));
  return start === period.start && end === period.end;
}

export function carryForwardAdjustmentDescription(input: {
  serviceDate: string;
  shiftName: string;
  kind: "added" | "cancelled" | "hours_changed";
}) {
  const action = input.kind === "added" ? "Added after invoice"
    : input.kind === "cancelled" ? "Credit for cancellation after invoice"
      : "Schedule change after invoice";
  return `${action}: ${input.shiftName} (${input.serviceDate})`;
}
