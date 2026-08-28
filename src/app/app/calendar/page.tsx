import Link from "next/link";
import { redirect } from "next/navigation";
import { formatTimeInput } from "@/components/format";
import { MonthCalendar, type MonthCalendarEvent } from "@/components/month-calendar";
import { CalendarShareButton } from "@/components/calendar-share-button";
import { CalendarStatusLegend } from "@/components/calendar-status-legend";
import { getCalendarData, getPublicCalendarLinkSettings, getResidencyList, getScheduleOccurrenceData } from "@/data/internal";
import { calendarToneForSlot, monthLabel, monthRange, normalizeMonthKey, shiftMonthKey } from "@/lib/calendar";
import { clockToMinute, formatCompactMinuteRange, projectDaypartSlots, resolveAssignmentMinutes, resolveEndMinute, slotSchedulingStatus } from "@/domain/dayparts";
import { getActiveTalentLookup, getDaypartsForResidencies, getDaypartsForResidency } from "@/services/dayparts";
import { ResidencyCalendar } from "./residency-calendar";
import { viewAsResidencyId } from "@/lib/view-as";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ residency?: string; calendarResidency?: string; month?: string }> }) {
  const params = await searchParams;
  const [residencyList, previewResidencyId] = await Promise.all([getResidencyList(), viewAsResidencyId()]);
  if (previewResidencyId && params.residency !== previewResidencyId) redirect(`/app/calendar?residency=${previewResidencyId}`);
  const workspaceResidency = residencyList.find((item) => item.id === params.residency);

  if (!workspaceResidency) {
    const monthKey = normalizeMonthKey(params.month);
    const range = monthRange(monthKey);
    const calendarResidency = residencyList.find((item) => item.id === params.calendarResidency);
    const visibleResidencies = calendarResidency ? [calendarResidency] : residencyList;
    const [calendar, occurrences, visibleDayparts, calendarLinkSettings] = await Promise.all([
      getCalendarData(calendarResidency?.id, range),
      getScheduleOccurrenceData(calendarResidency?.id, range),
      getDaypartsForResidencies(visibleResidencies.map((residency) => residency.id)),
      calendarResidency ? getPublicCalendarLinkSettings(calendarResidency.id) : Promise.resolve({ hasLink: false, scope: "all" as const, daypartIds: [] }),
    ]);
    const tones: MonthCalendarEvent["tone"][] = ["blue", "navy", "sky"];
    const savedShiftEvents = calendar.map((shift) => {
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
        title: calendarResidency ? shift.name : `${shift.name} · ${shift.residencyName}`,
        time: `${formatCompactMinuteRange(shiftStartMinute, shiftEndMinute)} · ${statusLabel}`,
        residencyName: shift.residencyName,
        color: shift.daypartColor ?? shift.shiftCalendarColor ?? undefined,
        tone: calendarToneForSlot(shift.room, tones[Math.max(0, residencyList.findIndex((item) => item.id === shift.residencyId)) % tones.length]),
        schedulingStatus,
        startMinute: shiftStartMinute,
      };
    });
    const savedOccurrenceEvents = occurrences.map((occurrence) => {
      const startMinute = clockToMinute(formatTimeInput(occurrence.startsAt, occurrence.residencyTimezone));
      return {
        id: occurrence.id,
        date: occurrence.serviceDate,
        title: calendarResidency ? occurrence.name : `${occurrence.name} · ${occurrence.residencyName}`,
        time: `${formatCompactMinuteRange(startMinute, resolveEndMinute(startMinute, formatTimeInput(occurrence.endsAt, occurrence.residencyTimezone)))} · Scheduled`,
        residencyName: occurrence.assignments.map((assignment) => assignment.talentName).join(" + ") || occurrence.manualHostName || occurrence.programDetails || "Scheduled activity",
        color: occurrence.color,
        tone: "blue" as const,
        schedulingStatus: "filled" as const,
        startMinute,
      };
    });
    const existingDaypartDates = new Set([
      ...calendar.flatMap((shift) => shift.daypartId ? [`${shift.daypartId}:${shift.serviceDate}`] : []),
      ...occurrences.map((occurrence) => `${occurrence.daypartId}:${occurrence.serviceDate}`),
    ]);
    const projectedEvents = visibleResidencies.flatMap((residency) => projectDaypartSlots(
      visibleDayparts.filter((daypart) => daypart.residencyId === residency.id),
      range.from,
      range.to,
      existingDaypartDates,
    ).map((slot) => ({
      id: slot.id,
      date: slot.date,
      title: calendarResidency ? slot.name : `${slot.name} · ${residency.name}`,
      time: `${formatCompactMinuteRange(slot.startMinute, slot.endMinute)} · Needs scheduling`,
      residencyName: residency.name,
      color: slot.color,
      tone: calendarToneForSlot(slot.room, tones[Math.max(0, residencyList.findIndex((item) => item.id === residency.id)) % tones.length]),
      schedulingStatus: "empty" as const,
      startMinute: slot.startMinute,
    })));
    const events: MonthCalendarEvent[] = [...savedShiftEvents, ...savedOccurrenceEvents, ...projectedEvents]
      .sort((left, right) => left.date.localeCompare(right.date) || left.startMinute - right.startMinute);
    const needsDjCount = events.filter((event) => event.schedulingStatus === "empty" || event.schedulingStatus === "partial").length;

    function monthHref(target: string) {
      const query = new URLSearchParams({ month: target });
      if (calendarResidency) query.set("calendarResidency", calendarResidency.id);
      return `/app/calendar?${query.toString()}`;
    }

    return (
      <div className="calendar-page">
        <header className="page-header calendar-page-header calendar-command-bar"><div className="calendar-title"><p className="eyebrow">HFY company</p><h1>Calendar</h1></div><div className="calendar-command-controls">
          <form className="calendar-filter-form" method="get">
            <input name="month" type="hidden" value={monthKey} />
            <div className="field calendar-filter"><label htmlFor="calendar-residency">Residency calendar</label><select id="calendar-residency" name="calendarResidency" defaultValue={calendarResidency?.id ?? ""}><option value="">All residencies</option>{residencyList.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
            <button className="button secondary" type="submit">View</button>
          </form>
          {calendarResidency ? <CalendarShareButton residencyId={calendarResidency.id} residencyName={calendarResidency.name} linkSettings={calendarLinkSettings} dayparts={visibleDayparts.filter((daypart) => daypart.active).map((daypart) => ({ id: daypart.id, name: daypart.name, room: daypart.room, color: daypart.color }))} /> : null}
          <div className="calendar-month-cluster"><div className={`calendar-needs-summary ${needsDjCount ? "attention" : "clear"}`}><strong>{needsDjCount}</strong><span>{needsDjCount === 1 ? "slot needs scheduling" : "slots need scheduling"}</span></div><div className="month-navigation"><Link className="calendar-arrow" aria-label="Previous month" href={monthHref(shiftMonthKey(monthKey, -1))}>←</Link><h2>{monthLabel(monthKey)}</h2><Link className="calendar-arrow" aria-label="Next month" href={monthHref(shiftMonthKey(monthKey, 1))}>→</Link></div></div>
        </div></header>
        <CalendarStatusLegend />
        <MonthCalendar compact monthKey={monthKey} events={events} ariaLabel="HFY company programming calendar" />
      </div>
    );
  }

  const monthKey = normalizeMonthKey(params.month);
  const range = monthRange(monthKey);
  const [calendar, occurrences, dayparts, talent, calendarLinkSettings] = await Promise.all([
    getCalendarData(workspaceResidency.id, range),
    getScheduleOccurrenceData(workspaceResidency.id, range),
    getDaypartsForResidency(workspaceResidency.id),
    getActiveTalentLookup(workspaceResidency.id),
    getPublicCalendarLinkSettings(workspaceResidency.id),
  ]);
  const realEvents = calendar.map((shift) => {
    const activeAssignments = shift.assignments.filter((assignment) => assignment.bookingStatus !== "cancelled");
    const artistNames = activeAssignments.map((assignment) => assignment.talentName || assignment.guestName).filter(Boolean);
    const matchedDaypart = dayparts.find((daypart) => daypart.id === shift.daypartId);
    const daypartIndex = matchedDaypart ? dayparts.indexOf(matchedDaypart) : -1;
    const daypartTones: MonthCalendarEvent["tone"][] = ["blue", "sky", "navy"];
    const shiftStartClock = formatTimeInput(shift.startsAt, workspaceResidency.timezone);
    const shiftStartMinute = clockToMinute(shiftStartClock);
    const shiftEndMinute = resolveEndMinute(shiftStartMinute, formatTimeInput(shift.endsAt, workspaceResidency.timezone));
    const coverageWindows = activeAssignments
      .filter((assignment) => assignment.talentId && ["confirmed", "completed"].includes(assignment.bookingStatus))
      .map((assignment) => resolveAssignmentMinutes(shiftStartMinute, shiftEndMinute, formatTimeInput(assignment.startsAt, workspaceResidency.timezone), formatTimeInput(assignment.endsAt, workspaceResidency.timezone)))
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
    color: matchedDaypart?.color ?? shift.daypartColor ?? shift.shiftCalendarColor ?? undefined,
    tone: calendarToneForSlot(shift.room, daypartTones[Math.max(0, daypartIndex) % daypartTones.length]),
    daypartId: shift.daypartId,
    shiftStartMinute,
    shiftEndMinute,
    projected: false,
    recordType: "financial_shift" as const,
    daypartType: "dj_artist" as const,
    billingMode: "billed_by_hfy" as const,
    programDetails: shift.programDetails,
    manualHostName: shift.manualHostName,
    schedulingStatus,
    assignments: activeAssignments.map((assignment) => ({
      id: assignment.id,
      talentId: assignment.talentId,
      talentName: assignment.talentName,
      guestName: assignment.guestName,
      startsAt: assignment.startsAt.toISOString(),
      endsAt: assignment.endsAt.toISOString(),
      startClock: formatTimeInput(assignment.startsAt, workspaceResidency.timezone),
      endClock: formatTimeInput(assignment.endsAt, workspaceResidency.timezone),
      bookingStatus: assignment.bookingStatus,
      payoutStatus: assignment.payoutStatus,
    })),
  };
  });
  const nonfinancialEvents = occurrences.map((occurrence) => {
    const shiftStartMinute = clockToMinute(formatTimeInput(occurrence.startsAt, workspaceResidency.timezone));
    const shiftEndMinute = resolveEndMinute(shiftStartMinute, formatTimeInput(occurrence.endsAt, workspaceResidency.timezone));
    return {
      id: occurrence.id,
      date: occurrence.serviceDate,
      title: occurrence.name,
      time: `${formatCompactMinuteRange(shiftStartMinute, shiftEndMinute)} · Scheduled`,
      residencyName: occurrence.assignments.map((assignment) => assignment.talentName).join(" + ") || occurrence.manualHostName || occurrence.programDetails || "Scheduled activity",
      color: occurrence.color,
      daypartId: occurrence.daypartId,
      shiftStartMinute,
      shiftEndMinute,
      projected: false,
      recordType: "nonfinancial_occurrence" as const,
      daypartType: occurrence.type,
      billingMode: occurrence.billingMode,
      programDetails: occurrence.programDetails,
      manualHostName: occurrence.manualHostName,
      schedulingStatus: "filled" as const,
      assignments: occurrence.assignments.map((assignment) => ({
        id: assignment.id,
        talentId: assignment.talentId,
        talentName: assignment.talentName,
        guestName: "",
        startsAt: assignment.startsAt.toISOString(),
        endsAt: assignment.endsAt.toISOString(),
        startClock: formatTimeInput(assignment.startsAt, workspaceResidency.timezone),
        endClock: formatTimeInput(assignment.endsAt, workspaceResidency.timezone),
        bookingStatus: "confirmed",
        payoutStatus: "not_applicable",
      })),
    };
  });
  const existingDaypartDates = new Set([
    ...calendar.flatMap((shift) => shift.daypartId ? [`${shift.daypartId}:${shift.serviceDate}`] : []),
    ...occurrences.map((occurrence) => `${occurrence.daypartId}:${occurrence.serviceDate}`),
  ]);
  const projectedEvents = projectDaypartSlots(dayparts, range.from, range.to, existingDaypartDates).map((slot) => ({
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
  const events = [...realEvents, ...nonfinancialEvents, ...projectedEvents].sort((left, right) => left.date.localeCompare(right.date) || left.shiftStartMinute - right.shiftStartMinute);
  return (
    <div className="calendar-page">
      <ResidencyCalendar
        residency={{ id: workspaceResidency.id, name: workspaceResidency.name, timezone: workspaceResidency.timezone, defaultTalentRateCents: workspaceResidency.defaultTalentRateCents, clientHourlyRateCents: workspaceResidency.clientHourlyRateCents, calendarLinkSettings }}
        monthKey={monthKey}
        events={events}
        dayparts={dayparts.map((daypart) => ({ id: daypart.id, name: daypart.name, room: daypart.room, color: daypart.color, type: daypart.type, billingMode: daypart.billingMode, defaultTalentRateCents: daypart.defaultTalentRateCents, activeUntil: daypart.activeUntil, active: daypart.active, rules: daypart.rules.map((rule) => ({ weekday: rule.weekday, startMinute: rule.startMinute, endMinute: rule.endMinute, defaultDjCount: rule.defaultDjCount })) }))}
        talent={talent}
        previewMode={Boolean(previewResidencyId)}
      />
    </div>
  );
}
