import Link from "next/link";
import { formatTimeInput } from "@/components/format";
import { MonthCalendar, type MonthCalendarEvent } from "@/components/month-calendar";
import { CalendarStatusLegend } from "@/components/calendar-status-legend";
import { getCalendarData, getPublicCalendarLinkSettings, getResidencyList } from "@/data/internal";
import { calendarToneForSlot, monthLabel, monthRange, normalizeMonthKey, shiftMonthKey } from "@/lib/calendar";
import { calendarColorForEconomics, clockToMinute, daypartDateKey, formatCompactMinuteRange, projectDaypartSlots, resolveAssignmentMinutes, resolveEndMinute, slotSchedulingStatus } from "@/domain/dayparts";
import { getActiveTalentLookup, getDaypartDateExceptionsForResidencies, getDaypartsForResidencies, getDaypartsForResidency, getHfyRequestTalentLookup } from "@/services/dayparts";
import { isHfyManagedEconomicsMode, isStandingHfyDaypart } from "@/domain/hfy-programming";
import { ResidencyCalendar } from "./residency-calendar";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ residency?: string; calendarResidency?: string; month?: string; event?: string }> }) {
  const params = await searchParams;
  const residencyList = await getResidencyList();
  const workspaceResidency = residencyList.find((item) => item.id === params.residency);
  const filteredCalendarResidency = residencyList.find((item) => item.id === params.calendarResidency);
  const selectedResidency = workspaceResidency ?? filteredCalendarResidency;

  if (!selectedResidency) {
    const monthKey = normalizeMonthKey(params.month);
    const range = monthRange(monthKey);
    const visibleResidencies = residencyList;
    const [calendar, visibleDayparts, dateExceptions] = await Promise.all([
      getCalendarData(undefined, range),
      getDaypartsForResidencies(visibleResidencies.map((residency) => residency.id)),
      getDaypartDateExceptionsForResidencies(visibleResidencies.map((residency) => residency.id), range),
    ]);
    const hfyCalendar = calendar.filter((shift) => isHfyManagedEconomicsMode(shift.economicsMode));
    const hfyDayparts = visibleDayparts.filter(isStandingHfyDaypart);
    const tones: MonthCalendarEvent["tone"][] = ["blue", "navy", "sky"];
    const savedShiftEvents = hfyCalendar.map((shift) => {
      const activeAssignments = shift.assignments.filter((assignment) => assignment.bookingStatus !== "cancelled");
      const shiftStartMinute = clockToMinute(formatTimeInput(shift.startsAt, shift.residencyTimezone));
      const shiftEndMinute = resolveEndMinute(shiftStartMinute, formatTimeInput(shift.endsAt, shift.residencyTimezone));
      const coverage = activeAssignments
        .filter((assignment) => assignment.talentId && ["confirmed", "completed"].includes(assignment.bookingStatus))
        .map((assignment) => resolveAssignmentMinutes(shiftStartMinute, shiftEndMinute, formatTimeInput(assignment.startsAt, shift.residencyTimezone), formatTimeInput(assignment.endsAt, shift.residencyTimezone)))
        .filter((window) => window.withinShift);
      const assignmentStatus = slotSchedulingStatus(shiftStartMinute, shiftEndMinute, coverage);
      const schedulingStatus = assignmentStatus === "empty" && (shift.programDetails || shift.manualHostName) ? "filled" : assignmentStatus;
      const statusLabel = schedulingStatus === "empty" ? "Needs scheduling" : schedulingStatus === "partial" ? "Partially scheduled" : activeAssignments.length ? `${activeAssignments.length} talent` : "Scheduled";
      return {
        id: shift.id,
        date: shift.serviceDate,
        title: `${shift.name} · ${shift.residencyName}`,
        time: `${formatCompactMinuteRange(shiftStartMinute, shiftEndMinute)} · ${statusLabel}`,
        residencyName: shift.residencyName,
        color: calendarColorForEconomics(shift.daypartColor, shift.shiftCalendarColor, shift.economicsMode, "internal"),
        bookingState: shift.economicsMode === "hfy_request" ? "hfy_pending" as const : shift.economicsMode === "hfy" ? "hfy_confirmed" as const : undefined,
        tone: calendarToneForSlot(shift.room, tones[Math.max(0, residencyList.findIndex((item) => item.id === shift.residencyId)) % tones.length]),
        schedulingStatus,
        startMinute: shiftStartMinute,
        href: `/app/calendar?${new URLSearchParams({ mode: "hfy", calendarResidency: shift.residencyId, month: monthKey, event: shift.id }).toString()}`,
      };
    });
    const existingDaypartDates = new Set(hfyCalendar.flatMap((shift) => shift.daypartId ? [daypartDateKey(shift.daypartId, shift.serviceDate)] : []));
    const projectedEvents = visibleResidencies.flatMap((residency) => projectDaypartSlots(
      hfyDayparts.filter((daypart) => daypart.residencyId === residency.id),
      range.from,
      range.to,
      existingDaypartDates,
      dateExceptions,
    ).map((slot) => ({
      id: slot.id,
      date: slot.date,
      title: `${slot.name} · ${residency.name}`,
      time: `${formatCompactMinuteRange(slot.startMinute, slot.endMinute)} · Needs scheduling`,
      residencyName: residency.name,
      color: slot.color,
      tone: calendarToneForSlot(slot.room, tones[Math.max(0, residencyList.findIndex((item) => item.id === residency.id)) % tones.length]),
      schedulingStatus: "empty" as const,
      startMinute: slot.startMinute,
      href: `/app/calendar?${new URLSearchParams({ mode: "hfy", calendarResidency: residency.id, month: monthKey }).toString()}`,
    })));
    const events: MonthCalendarEvent[] = [...savedShiftEvents, ...projectedEvents]
      .sort((left, right) => left.date.localeCompare(right.date) || left.startMinute - right.startMinute);
    const needsDjCount = events.filter((event) => event.schedulingStatus === "empty" || event.schedulingStatus === "partial").length;

    function monthHref(target: string) {
      const query = new URLSearchParams({ month: target });
      return `/app/calendar?${query.toString()}`;
    }

    return (
      <div className="calendar-page">
        <header className="page-header calendar-page-header calendar-command-bar"><div className="calendar-title"><p className="eyebrow">HFY company</p><h1>Calendar</h1></div><div className="calendar-command-controls">
          <form className="calendar-filter-form" method="get">
            <input name="month" type="hidden" value={monthKey} />
            <div className="field calendar-filter"><label htmlFor="calendar-residency">Residency calendar</label><select id="calendar-residency" name="calendarResidency" defaultValue=""><option value="">All residencies</option>{residencyList.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
            <button className="button secondary" type="submit">View</button>
          </form>
          <CalendarStatusLegend internal />
          <div className="calendar-month-cluster"><div className={`calendar-needs-summary ${needsDjCount ? "attention" : "clear"}`}><strong>{needsDjCount}</strong><span>{needsDjCount === 1 ? "slot needs scheduling" : "slots need scheduling"}</span></div><div className="month-navigation"><Link className="calendar-arrow" aria-label="Previous month" href={monthHref(shiftMonthKey(monthKey, -1))}>←</Link><h2>{monthLabel(monthKey)}</h2><Link className="calendar-arrow" aria-label="Next month" href={monthHref(shiftMonthKey(monthKey, 1))}>→</Link></div></div>
        </div></header>
        <MonthCalendar compact monthKey={monthKey} events={events} ariaLabel="HFY company programming calendar" />
      </div>
    );
  }

  const monthKey = normalizeMonthKey(params.month);
  const range = monthRange(monthKey);
  const [calendar, dayparts, talent, requestTalent, calendarLinkSettings, dateExceptions] = await Promise.all([
    getCalendarData(selectedResidency.id, range),
    getDaypartsForResidency(selectedResidency.id),
    getActiveTalentLookup(selectedResidency.id),
    getHfyRequestTalentLookup(selectedResidency.id),
    getPublicCalendarLinkSettings(selectedResidency.id),
    getDaypartDateExceptionsForResidencies([selectedResidency.id], range),
  ]);
  const hfyCalendar = calendar.filter((shift) => isHfyManagedEconomicsMode(shift.economicsMode));
  const hfyDayparts = dayparts.filter(isStandingHfyDaypart);
  const realEvents = hfyCalendar.map((shift) => {
    const activeAssignments = shift.assignments.filter((assignment) => assignment.bookingStatus !== "cancelled");
    const artistNames = activeAssignments.map((assignment) => assignment.talentName || assignment.guestName).filter(Boolean);
    const matchedDaypart = dayparts.find((daypart) => daypart.id === shift.daypartId);
    const daypartIndex = matchedDaypart ? dayparts.indexOf(matchedDaypart) : -1;
    const daypartTones: MonthCalendarEvent["tone"][] = ["blue", "sky", "navy"];
    const shiftStartClock = formatTimeInput(shift.startsAt, selectedResidency.timezone);
    const shiftStartMinute = clockToMinute(shiftStartClock);
    const shiftEndMinute = resolveEndMinute(shiftStartMinute, formatTimeInput(shift.endsAt, selectedResidency.timezone));
    const coverageWindows = activeAssignments
      .filter((assignment) => assignment.talentId && ["confirmed", "completed"].includes(assignment.bookingStatus))
      .map((assignment) => resolveAssignmentMinutes(shiftStartMinute, shiftEndMinute, formatTimeInput(assignment.startsAt, selectedResidency.timezone), formatTimeInput(assignment.endsAt, selectedResidency.timezone)))
      .filter((window) => window.withinShift);
    const assignmentStatus = slotSchedulingStatus(shiftStartMinute, shiftEndMinute, coverageWindows);
    const schedulingStatus = assignmentStatus === "empty" && (shift.programDetails || shift.manualHostName) ? "filled" : assignmentStatus;
    const schedulingLabel = schedulingStatus === "empty"
      ? "Needs scheduling"
      : schedulingStatus === "partial"
        ? "Partially scheduled"
        : activeAssignments.length ? `${activeAssignments.length} talent` : "Scheduled";
    return {
    id: shift.id,
    date: shift.serviceDate,
    title: matchedDaypart?.name ?? shift.name,
    time: `${formatCompactMinuteRange(shiftStartMinute, shiftEndMinute)} · ${schedulingLabel}`,
    residencyName: artistNames.length ? artistNames.join(" + ") : shift.manualHostName || shift.programDetails || shift.name,
    color: calendarColorForEconomics(matchedDaypart?.color ?? shift.daypartColor, shift.shiftCalendarColor, shift.economicsMode, "internal"),
    bookingState: shift.economicsMode === "hfy_request" ? "hfy_pending" as const : shift.economicsMode === "hfy" ? "hfy_confirmed" as const : undefined,
    tone: calendarToneForSlot(shift.room, daypartTones[Math.max(0, daypartIndex) % daypartTones.length]),
    daypartId: shift.daypartId,
    shiftStartMinute,
    shiftEndMinute,
    projected: false,
    recordType: "financial_shift" as const,
    daypartType: "dj_artist" as const,
    billingMode: matchedDaypart?.billingMode ?? "billed_by_hfy" as const,
    programDetails: shift.programDetails,
    manualHostName: shift.manualHostName,
    economicsMode: shift.economicsMode,
    hfyRequestId: shift.hfyRequestId,
    schedulingStatus,
    assignments: activeAssignments.map((assignment) => ({
      id: assignment.id,
      talentId: assignment.talentId,
      talentName: assignment.talentName,
      guestName: assignment.guestName,
      startsAt: assignment.startsAt.toISOString(),
      endsAt: assignment.endsAt.toISOString(),
      startClock: formatTimeInput(assignment.startsAt, selectedResidency.timezone),
      endClock: formatTimeInput(assignment.endsAt, selectedResidency.timezone),
      bookingStatus: assignment.bookingStatus,
      payoutStatus: assignment.payoutStatus,
    })),
  };
  });
  const existingDaypartDates = new Set(hfyCalendar.flatMap((shift) => shift.daypartId ? [daypartDateKey(shift.daypartId, shift.serviceDate)] : []));
  const projectedEvents = projectDaypartSlots(hfyDayparts, range.from, range.to, existingDaypartDates, dateExceptions).map((slot) => ({
    id: slot.id,
    date: slot.date,
    title: slot.name,
    time: `${formatCompactMinuteRange(slot.startMinute, slot.endMinute)} · Needs scheduling`,
    residencyName: "Projected from Setup",
    color: slot.color,
    daypartId: slot.daypartId,
    shiftStartMinute: slot.startMinute,
    shiftEndMinute: slot.endMinute,
    projected: true,
    recordType: "projected" as const,
    daypartType: slot.type,
    billingMode: slot.billingMode,
    programDetails: "",
    manualHostName: "",
    defaultDjCount: slot.defaultDjCount,
    schedulingStatus: "empty" as const,
    assignments: [],
  }));
  const events = [...realEvents, ...projectedEvents].sort((left, right) => left.date.localeCompare(right.date) || left.shiftStartMinute - right.shiftStartMinute);
  return (
    <div className="calendar-page">
      <ResidencyCalendar
        key={selectedResidency.id}
        residency={{ id: selectedResidency.id, name: selectedResidency.name, timezone: selectedResidency.timezone, defaultTalentRateCents: selectedResidency.defaultTalentRateCents, clientHourlyRateCents: selectedResidency.clientHourlyRateCents, calendarLinkSettings }}
        monthKey={monthKey}
        events={events}
        dayparts={hfyDayparts.map((daypart) => ({ id: daypart.id, name: daypart.name, room: daypart.room, color: daypart.color, type: daypart.type, billingMode: daypart.billingMode, defaultTalentRateCents: daypart.defaultTalentRateCents, activeUntil: daypart.activeUntil, active: daypart.active, rules: daypart.rules.map((rule) => ({ weekday: rule.weekday, startMinute: rule.startMinute, endMinute: rule.endMinute, defaultDjCount: rule.defaultDjCount })) }))}
        talent={talent}
        requestTalent={requestTalent}
        dateExceptions={dateExceptions}
        residencyOptions={residencyList.map((item) => ({ id: item.id, name: item.name }))}
        residencySelectionParam={workspaceResidency ? "residency" : "calendarResidency"}
        initialEventId={params.event}
      />
    </div>
  );
}
