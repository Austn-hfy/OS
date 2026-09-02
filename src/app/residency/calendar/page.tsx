import { formatTimeInput } from "@/components/format";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { getCalendarData, getPublicCalendarLinkSettings, getScheduleOccurrenceData } from "@/data/internal";
import { getResidencyClientSafeRoster } from "@/data/residency-client";
import { calendarColorForEconomics, clockToMinute, daypartDateKey, formatCompactMinuteRange, projectDaypartSlots, resolveAssignmentMinutes, resolveEndMinute, slotSchedulingStatus } from "@/domain/dayparts";
import { requireResidencyActor } from "@/lib/auth";
import { calendarToneForSlot, monthRange, normalizeMonthKey } from "@/lib/calendar";
import { getDaypartDateExceptionsForResidencies, getDaypartsForResidency } from "@/services/dayparts";
import { ResidencyCalendar, type ResidencyEvent } from "@/app/app/calendar/residency-calendar";

export default async function ResidencyClientCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [actor, params] = await Promise.all([requireResidencyActor(), searchParams]);
  const monthKey = normalizeMonthKey(params.month);
  const range = monthRange(monthKey);
  const [calendar, occurrences, dayparts, roster, calendarLinkSettings, dateExceptions] = await Promise.all([
    getCalendarData(actor.residencyId, range),
    getScheduleOccurrenceData(actor.residencyId, range),
    getDaypartsForResidency(actor.residencyId),
    getResidencyClientSafeRoster(actor.residencyId),
    getPublicCalendarLinkSettings(actor.residencyId),
    getDaypartDateExceptionsForResidencies([actor.residencyId], range),
  ]);

  const savedShifts: ResidencyEvent[] = calendar.map((shift) => {
    const activeAssignments = shift.assignments.filter((assignment) => assignment.bookingStatus !== "cancelled");
    const matchedDaypart = dayparts.find((daypart) => daypart.id === shift.daypartId);
    const start = clockToMinute(formatTimeInput(shift.startsAt, actor.residencyTimezone));
    const end = resolveEndMinute(start, formatTimeInput(shift.endsAt, actor.residencyTimezone));
    const coverage = activeAssignments.filter((assignment) => assignment.talentId && ["confirmed", "completed"].includes(assignment.bookingStatus))
      .map((assignment) => resolveAssignmentMinutes(start, end, formatTimeInput(assignment.startsAt, actor.residencyTimezone), formatTimeInput(assignment.endsAt, actor.residencyTimezone)))
      .filter((window) => window.withinShift);
    const status = slotSchedulingStatus(start, end, coverage);
    const names = activeAssignments.map((assignment) => assignment.talentName || assignment.guestName).filter(Boolean);
    const pendingHfy = shift.economicsMode === "hfy_request";
    return {
      id: shift.id, date: shift.serviceDate, title: matchedDaypart?.name ?? shift.name,
      time: `${formatCompactMinuteRange(start, end)} · ${pendingHfy ? "Request HFY pending" : status === "empty" ? "Needs scheduling" : status === "partial" ? "Partially scheduled" : `${activeAssignments.length} talent`}`,
      residencyName: pendingHfy ? "HFY staffing requested" : names.join(" + ") || shift.name,
      color: calendarColorForEconomics(matchedDaypart?.color ?? shift.daypartColor, shift.shiftCalendarColor, shift.economicsMode),
      bookingState: pendingHfy ? "hfy_pending" : shift.economicsMode === "hfy" ? "hfy_confirmed" : undefined,
      tone: calendarToneForSlot(shift.room, "blue"), daypartId: shift.daypartId, shiftStartMinute: start, shiftEndMinute: end,
      projected: false, recordType: "financial_shift", daypartType: "dj_artist", billingMode: matchedDaypart?.billingMode ?? "billed_by_hfy",
      room: shift.room, notes: shift.notes, editableColor: shift.shiftCalendarColor ?? matchedDaypart?.color ?? shift.daypartColor ?? undefined,
      programDetails: shift.programDetails, manualHostName: shift.manualHostName, schedulingStatus: status,
      economicsMode: shift.economicsMode,
      assignments: activeAssignments.map((assignment) => ({
        id: assignment.id, talentId: assignment.talentId, talentName: assignment.talentName, guestName: assignment.guestName,
        startsAt: assignment.startsAt.toISOString(), endsAt: assignment.endsAt.toISOString(),
        startClock: formatTimeInput(assignment.startsAt, actor.residencyTimezone), endClock: formatTimeInput(assignment.endsAt, actor.residencyTimezone),
        bookingStatus: assignment.bookingStatus, payoutStatus: assignment.payoutStatus,
      })),
    };
  });

  const savedOccurrences: ResidencyEvent[] = occurrences.map((occurrence) => {
    const start = clockToMinute(formatTimeInput(occurrence.startsAt, actor.residencyTimezone));
    const end = resolveEndMinute(start, formatTimeInput(occurrence.endsAt, actor.residencyTimezone));
    return {
      id: occurrence.id, date: occurrence.serviceDate, title: occurrence.name,
      time: `${formatCompactMinuteRange(start, end)} · Scheduled`,
      residencyName: occurrence.assignments.map((assignment) => assignment.talentName).join(" + ") || occurrence.manualHostName || occurrence.programDetails || "Scheduled activity",
      color: occurrence.color, daypartId: occurrence.daypartId, shiftStartMinute: start, shiftEndMinute: end,
      projected: false, recordType: "nonfinancial_occurrence", daypartType: occurrence.type, billingMode: occurrence.billingMode,
      room: occurrence.room, notes: occurrence.notes, editableColor: occurrence.color,
      programDetails: occurrence.programDetails, manualHostName: occurrence.manualHostName, schedulingStatus: "filled",
      assignments: occurrence.assignments.map((assignment) => ({
        id: assignment.id, talentId: assignment.talentId, talentName: assignment.talentName, guestName: "",
        startsAt: assignment.startsAt.toISOString(), endsAt: assignment.endsAt.toISOString(),
        startClock: formatTimeInput(assignment.startsAt, actor.residencyTimezone), endClock: formatTimeInput(assignment.endsAt, actor.residencyTimezone),
        bookingStatus: "confirmed", payoutStatus: "not_applicable",
      })),
    };
  });

  const existing = new Set([
    ...calendar.flatMap((shift) => shift.daypartId ? [daypartDateKey(shift.daypartId, shift.serviceDate)] : []),
    ...occurrences.flatMap((occurrence) => occurrence.daypartId ? [daypartDateKey(occurrence.daypartId, occurrence.serviceDate)] : []),
  ]);
  const projected: ResidencyEvent[] = projectDaypartSlots(dayparts, range.from, range.to, existing, dateExceptions).map((slot) => ({
    id: slot.id, date: slot.date, title: slot.name, time: `${formatCompactMinuteRange(slot.startMinute, slot.endMinute)} · Needs scheduling`,
    residencyName: "Projected from Day Parts", color: slot.color, daypartId: slot.daypartId, shiftStartMinute: slot.startMinute, shiftEndMinute: slot.endMinute,
    projected: true, recordType: "projected", daypartType: slot.type, billingMode: slot.billingMode, defaultDjCount: slot.defaultDjCount,
    programDetails: "", manualHostName: "", schedulingStatus: "empty", assignments: [],
  }));
  const events = [...savedShifts, ...savedOccurrences, ...projected].sort((left, right) => left.date.localeCompare(right.date) || left.shiftStartMinute - right.shiftStartMinute);
  const safeDayparts = dayparts.map((daypart) => ({
    id: daypart.id, name: daypart.name, room: daypart.room, color: daypart.color, type: daypart.type, billingMode: daypart.billingMode,
    scheduleMode: daypart.scheduleMode, suggestedStartMinute: daypart.suggestedStartMinute, suggestedEndMinute: daypart.suggestedEndMinute,
    defaultTalentRateCents: null, activeUntil: daypart.activeUntil, active: daypart.active,
    rules: daypart.rules.map((rule) => ({ weekday: rule.weekday, startMinute: rule.startMinute, endMinute: rule.endMinute, defaultDjCount: rule.defaultDjCount })),
  }));

  return <>
    <ResidencyPageHeader eyebrow={actor.residencyName} title="Calendar" />
    <div className="calendar-page client-calendar-page"><ResidencyCalendar
      residency={{ id: actor.residencyId, name: actor.residencyName, timezone: actor.residencyTimezone, defaultTalentRateCents: 0, clientHourlyRateCents: 0, calendarLinkSettings }}
      monthKey={monthKey} events={events} dayparts={safeDayparts}
      talent={roster.filter((artist) => artist.ownership === "residency").map((artist) => ({ ...artist, priority: null }))}
      dateExceptions={dateExceptions}
      previewMode calendarBasePath="/residency/calendar" canManage={actor.accessRole === "manager"} showTitle={false}
    /></div>
  </>;
}
