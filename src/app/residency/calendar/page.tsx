import Link from "next/link";
import { formatTimeInput } from "@/components/format";
import { MonthCalendar, type MonthCalendarEvent } from "@/components/month-calendar";
import { getResidencyClientCalendar } from "@/data/residency-client";
import { clockToMinute, formatCompactMinuteRange, projectDaypartSlots, resolveAssignmentMinutes, resolveEndMinute, slotSchedulingStatus } from "@/domain/dayparts";
import { requireResidencyActor } from "@/lib/auth";
import { monthLabel, monthRange, normalizeMonthKey, shiftMonthKey } from "@/lib/calendar";
import { getDaypartsForResidency } from "@/services/dayparts";

export default async function ResidencyClientCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [actor, params] = await Promise.all([requireResidencyActor(), searchParams]);
  const monthKey = normalizeMonthKey(params.month);
  const range = monthRange(monthKey);
  const [calendar, daypartRows] = await Promise.all([
    getResidencyClientCalendar(actor.residencyId, range),
    getDaypartsForResidency(actor.residencyId),
  ]);
  const realEvents: MonthCalendarEvent[] = calendar.map((shift) => {
    const active = shift.assignments.filter((assignment) => assignment.bookingStatus !== "cancelled");
    const shiftStart = clockToMinute(formatTimeInput(new Date(shift.startsAt), actor.residencyTimezone));
    const shiftEnd = resolveEndMinute(shiftStart, formatTimeInput(new Date(shift.endsAt), actor.residencyTimezone));
    const coverage = active.filter((assignment) => ["confirmed", "completed"].includes(assignment.bookingStatus)).map((assignment) => resolveAssignmentMinutes(
      shiftStart,
      shiftEnd,
      formatTimeInput(new Date(assignment.startsAt), actor.residencyTimezone),
      formatTimeInput(new Date(assignment.endsAt), actor.residencyTimezone),
    )).filter((window) => window.withinShift);
    const status = slotSchedulingStatus(shiftStart, shiftEnd, coverage);
    const names = active.map((assignment) => assignment.talentName || assignment.guestName).filter(Boolean);
    return {
      id: shift.id,
      date: shift.serviceDate,
      title: shift.daypartName ?? shift.name,
      time: `${formatCompactMinuteRange(shiftStart, shiftEnd)} · ${status === "empty" ? "Open" : status === "partial" ? "Partly scheduled" : names.join(" + ") || "Scheduled"}`,
      residencyName: actor.residencyName,
      color: shift.daypartColor ?? shift.calendarColor ?? undefined,
      schedulingStatus: status,
    };
  });
  const existing = new Set(calendar.flatMap((shift) => shift.daypartId ? [`${shift.daypartId}:${shift.serviceDate}`] : []));
  const projected: MonthCalendarEvent[] = projectDaypartSlots(daypartRows, range.from, range.to, existing).map((slot) => ({
    id: slot.id,
    date: slot.date,
    title: slot.name,
    time: `${formatCompactMinuteRange(slot.startMinute, slot.endMinute)} · Open`,
    residencyName: actor.residencyName,
    color: slot.color,
    schedulingStatus: "empty",
  }));
  return <div className="calendar-page client-calendar-page">
    <header className="page-header calendar-page-header calendar-command-bar card"><div className="calendar-title"><p className="eyebrow">{actor.residencyName}</p><h1>Calendar</h1></div><div className="calendar-command-controls"><div className="month-navigation"><Link className="calendar-arrow" aria-label="Previous month" href={`/residency/calendar?month=${shiftMonthKey(monthKey, -1)}`}>←</Link><h2>{monthLabel(monthKey)}</h2><Link className="calendar-arrow" aria-label="Next month" href={`/residency/calendar?month=${shiftMonthKey(monthKey, 1)}`}>→</Link></div></div></header>
    <MonthCalendar compact monthKey={monthKey} events={[...realEvents, ...projected]} ariaLabel={`${actor.residencyName} calendar`} />
  </div>;
}
