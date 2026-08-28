"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, type CSSProperties } from "react";
import { addCalendarAssignmentAction, bookResidencyDateAction, removeCalendarAssignmentAction, rescheduleAssignmentAction, type ResidencyActionState } from "@/app/app/actions";
import { ArtistSearchPicker } from "@/components/artist-search-picker";
import { CalendarShareButton } from "@/components/calendar-share-button";
import { Status } from "@/components/format";
import { SensitiveInput } from "@/components/privacy-mode";
import { TimeSelect } from "@/components/time-select";
import { MonthCalendar, type MonthCalendarEvent } from "@/components/month-calendar";
import { clockToMinute, formatLocalMinute, hasOverlappingAssignmentMinutes, minuteToClock, resolveAssignmentMinutes, resolveEndMinute, weekdayForDate, weekdayNames } from "@/domain/dayparts";
import { monthLabel, shiftMonthKey } from "@/lib/calendar";
import type { DaypartBillingMode, DaypartType } from "@/domain/dayparts";
import type { PublicCalendarLinkSettings } from "@/data/internal";

type CalendarAssignment = {
  id: string;
  talentId: string | null;
  talentName: string | null;
  guestName: string;
  startsAt: string;
  endsAt: string;
  startClock: string;
  endClock: string;
  bookingStatus: string;
  payoutStatus: string;
};

type ResidencyEvent = MonthCalendarEvent & {
  daypartId: string | null;
  shiftStartMinute: number;
  shiftEndMinute: number;
  projected: boolean;
  recordType: "financial_shift" | "nonfinancial_occurrence" | "projected";
  daypartType: DaypartType;
  billingMode: DaypartBillingMode | null;
  defaultDjCount?: number | null;
  assignments: CalendarAssignment[];
};

type ResidencyCalendarProps = {
  residency: { id: string; name: string; timezone: string; defaultTalentRateCents: number; clientHourlyRateCents: number; calendarLinkSettings: PublicCalendarLinkSettings };
  monthKey: string;
  events: ResidencyEvent[];
  dayparts: Array<{
    id: string;
    name: string;
    room: string;
    color: string;
    type: DaypartType;
    billingMode: DaypartBillingMode | null;
    defaultTalentRateCents: number | null;
    activeUntil: string | null;
    active: boolean;
    rules: Array<{ weekday: number; startMinute: number; endMinute: number; defaultDjCount: number | null }>;
  }>;
  talent: Array<{ id: string; stageName: string; homeMarket: string; genres: string[]; priority: number | null }>;
  previewMode?: boolean;
};

type SlotDraft = { id: string; talentId: string; start: string; end: string; confirmed: boolean; compensationType: "hourly" | "fixed" | "na"; rateOverride: string; fixedFee: string };
type SuggestionDraft = { daypartId: string; sourceDaypartId: string | null; oneTime: boolean; recurringToday: boolean; name: string; room: string; color: string; type: DaypartType; billingMode: DaypartBillingMode | null; defaultTalentRateCents: number | null; defaultDjCount: number | null; existing: boolean; start: string; end: string; clientRateOverride: string; slots: SlotDraft[] };
type ReplacementDraft = { assignmentId: string; talentId: string; start: string; end: string };
type ModalState = { type: "add"; date: string } | { type: "edit"; eventId: string } | null;
type StatusFilter = "needs" | "all" | "filled";
type AddMode = "choose" | "daypart" | "one-time";
const initialActionState: ResidencyActionState = { status: "idle", message: "" };

function dollarsToCents(value: string): number | null {
  if (!value.trim()) return null;
  const dollars = Number(value);
  return Number.isFinite(dollars) && dollars >= 0 ? Math.round(dollars * 100) : null;
}

function emptySlot(talentId: string, start: string, end: string): SlotDraft {
  return { id: crypto.randomUUID(), talentId, start, end, confirmed: false, compensationType: "hourly", rateOverride: "", fixedFee: "" };
}

export function ResidencyCalendar({ residency, monthKey, events, dayparts, talent, previewMode = false }: ResidencyCalendarProps) {
  const [modal, setModal] = useState<ModalState>(null);
  const [suggestions, setSuggestions] = useState<SuggestionDraft[]>([]);
  const [activeDaypartId, setActiveDaypartId] = useState("");
  const [addMode, setAddMode] = useState<AddMode>("choose");
  const [directDaypartSelection, setDirectDaypartSelection] = useState(false);
  const [replacementDraft, setReplacementDraft] = useState<ReplacementDraft | null>(null);
  const [newAssignmentDraft, setNewAssignmentDraft] = useState<SlotDraft | null>(null);
  const [editState, setEditState] = useState<ResidencyActionState>(initialActionState);
  const [editPending, setEditPending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("needs");
  const [daypartFilter, setDaypartFilter] = useState("all");
  const submitBooking = async (previous: ResidencyActionState, formData: FormData) => {
    const result = await bookResidencyDateAction(previous, formData);
    if (result.status === "success") setModal(null);
    return result;
  };
  const [state, formAction, pending] = useActionState(submitBooking, initialActionState);

  const modalOpen = modal !== null;
  useEffect(() => {
    if (!modalOpen) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [modalOpen]);

  useEffect(() => {
    const savedStatus = window.localStorage.getItem("hfy-calendar-status-filter");
    const savedDaypart = window.localStorage.getItem("hfy-calendar-daypart-filter");
    const restoreFilters = window.setTimeout(() => {
      if (savedStatus === "needs" || savedStatus === "all" || savedStatus === "filled") setStatusFilter(savedStatus);
      if (savedDaypart && (savedDaypart === "all" || dayparts.some((daypart) => daypart.id === savedDaypart))) setDaypartFilter(savedDaypart);
    }, 0);
    return () => window.clearTimeout(restoreFilters);
  }, [dayparts]);

  const artistOptions = useMemo(() => talent.map((artist) => ({
    id: artist.id,
    name: artist.stageName,
    meta: [artist.homeMarket, artist.genres.join(" ")].filter(Boolean).join(" · "),
  })), [talent]);

  const activeSuggestion = suggestions.find((item) => item.daypartId === activeDaypartId) ?? suggestions[0];
  const editingEvent = modal?.type === "edit" ? events.find((event) => event.id === modal.eventId) : undefined;
  const needsDjCount = events.filter((event) => event.schedulingStatus === "empty" || event.schedulingStatus === "partial").length;
  const filteredEvents = events.filter((event) => {
    const statusMatches = statusFilter === "all"
      || (statusFilter === "needs" && (event.schedulingStatus === "empty" || event.schedulingStatus === "partial"))
      || (statusFilter === "filled" && event.schedulingStatus === "filled");
    return statusMatches && (daypartFilter === "all" || event.daypartId === daypartFilter);
  });

  function changeStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    window.localStorage.setItem("hfy-calendar-status-filter", value);
  }

  function changeDaypartFilter(value: string) {
    setDaypartFilter(value);
    window.localStorage.setItem("hfy-calendar-daypart-filter", value);
  }

  function openDate(date: string, preferredDaypartId?: string) {
    const weekday = weekdayForDate(date);
    const existingDayparts = new Set(events.filter((event) => !event.projected && event.date === date && event.daypartId).map((event) => event.daypartId));
    const nextSuggestions: SuggestionDraft[] = dayparts.flatMap((daypart) => {
      if (!daypart.active || (daypart.activeUntil && date > daypart.activeUntil)) return [];
      const recurringRule = daypart.rules.find((item) => item.weekday === weekday);
      const rule = recurringRule ?? daypart.rules[0];
      if (!rule) return [];
      const start = minuteToClock(rule.startMinute);
      const end = minuteToClock(rule.endMinute);
      return [{
        daypartId: daypart.id,
        sourceDaypartId: daypart.id,
        oneTime: false,
        recurringToday: Boolean(recurringRule),
        name: daypart.name,
        room: daypart.room,
        color: daypart.color,
        type: daypart.type,
        billingMode: daypart.billingMode,
        defaultTalentRateCents: daypart.defaultTalentRateCents,
        defaultDjCount: recurringRule?.defaultDjCount ?? rule.defaultDjCount ?? null,
        existing: existingDayparts.has(daypart.id),
        start,
        end,
        clientRateOverride: "",
        slots: [],
      }];
    });
    nextSuggestions.push({
      daypartId: "one-time",
      sourceDaypartId: null,
      oneTime: true,
      recurringToday: false,
      name: "",
      room: "",
      color: "#7A65D1",
      type: "dj_artist",
      billingMode: "billed_by_hfy",
      defaultTalentRateCents: null,
      defaultDjCount: 1,
      existing: false,
      start: "18:00",
      end: "21:00",
      clientRateOverride: "",
      slots: [],
    });
    setSuggestions(nextSuggestions);
    const preferred = nextSuggestions.find((item) => item.daypartId === preferredDaypartId);
    const firstAvailable = nextSuggestions.find((item) => !item.existing && !item.oneTime);
    const initial = preferred ?? firstAvailable ?? nextSuggestions.find((item) => item.oneTime)!;
    setActiveDaypartId(initial.daypartId);
    setAddMode(preferred ? "daypart" : "choose");
    setDirectDaypartSelection(Boolean(preferred));
    setReplacementDraft(null);
    setNewAssignmentDraft(null);
    setEditState(initialActionState);
    setModal({ type: "add", date });
  }

  function openEvent(event: MonthCalendarEvent) {
    const residencyEvent = events.find((item) => item.id === event.id);
    if (residencyEvent?.projected && residencyEvent.daypartId) {
      openDate(residencyEvent.date, residencyEvent.daypartId);
      return;
    }
    setReplacementDraft(null);
    setNewAssignmentDraft(null);
    setEditState(initialActionState);
    setModal({ type: "edit", eventId: event.id });
  }

  function openExistingDaypart(daypartId: string, date: string) {
    const event = events.find((item) => !item.projected && item.date === date && item.daypartId === daypartId);
    if (event) {
      setReplacementDraft(null);
      setNewAssignmentDraft(null);
      setEditState(initialActionState);
      setModal({ type: "edit", eventId: event.id });
    }
  }

  function updateSuggestion(next: Partial<SuggestionDraft>) {
    setSuggestions((current) => current.map((item) => item.daypartId === activeDaypartId ? { ...item, ...next } : item));
  }

  function chooseSuggestion(suggestion: SuggestionDraft) {
    setActiveDaypartId(suggestion.daypartId);
    setAddMode(suggestion.oneTime ? "one-time" : "daypart");
    setDirectDaypartSelection(false);
  }

  function updateShiftTime(field: "start" | "end", value: string) {
    setSuggestions((current) => current.map((item) => {
      if (item.daypartId !== activeDaypartId) return item;
      const previous = item[field];
      return {
        ...item,
        [field]: value,
        slots: item.slots.map((slot) => slot[field] === previous ? { ...slot, [field]: value } : slot),
      };
    }));
  }

  function updateSlot(slotIndex: number, next: Partial<SlotDraft>) {
    setSuggestions((current) => current.map((item) => item.daypartId === activeDaypartId ? {
      ...item,
      slots: item.slots.map((slot, currentSlotIndex) => currentSlotIndex === slotIndex ? { ...slot, ...next } : slot),
    } : item));
  }

  function addArtist(talentId: string) {
    setSuggestions((current) => current.map((item) => item.daypartId === activeDaypartId ? {
      ...item,
      slots: [...item.slots, (() => {
        const shiftStartMinute = clockToMinute(item.start);
        const shiftEndMinute = resolveEndMinute(shiftStartMinute, item.end);
        const confirmedEnds = item.slots.filter((slot) => slot.confirmed).map((slot) => resolveAssignmentMinutes(shiftStartMinute, shiftEndMinute, slot.start, slot.end).endMinute);
        const suggestedStartMinute = confirmedEnds.length ? Math.max(...confirmedEnds) : shiftStartMinute;
        const suggestedStart = suggestedStartMinute < shiftEndMinute ? minuteToClock(suggestedStartMinute) : item.start;
        return emptySlot(talentId, suggestedStart, item.end);
      })()],
    } : item));
  }

  function confirmArtist(slotId: string) {
    setSuggestions((current) => current.map((item) => item.daypartId === activeDaypartId ? {
      ...item,
      slots: item.slots.map((slot) => slot.id === slotId ? { ...slot, confirmed: true } : slot),
    } : item));
  }

  function removeArtist(slotId: string) {
    setSuggestions((current) => current.map((item) => item.daypartId === activeDaypartId ? {
      ...item,
      slots: item.slots.filter((slot) => slot.id !== slotId),
    } : item));
  }

  const assignmentWarning = useMemo(() => {
    if (!activeSuggestion || activeSuggestion.existing) return "";
    if (activeSuggestion.type === "house_activity") return "";
    if (!activeSuggestion.slots.length) return `Add at least one DJ to the ${activeSuggestion.name} slot.`;
    try {
      const shiftStartMinute = clockToMinute(activeSuggestion.start);
      const shiftEndMinute = resolveEndMinute(shiftStartMinute, activeSuggestion.end);
      const windows = activeSuggestion.slots.map((slot) => resolveAssignmentMinutes(
        shiftStartMinute,
        shiftEndMinute,
        slot.start,
        slot.end,
      ));
      if (windows.some((window) => !window.withinShift)) {
        return `The ${activeSuggestion.name} slot is only ${formatLocalMinute(shiftStartMinute)}–${formatLocalMinute(shiftEndMinute)}. Please adjust DJ times.`;
      }
      if (hasOverlappingAssignmentMinutes(windows)) {
        return `DJ times overlap in the ${activeSuggestion.name} slot. Adjust the times before adding this DJ.`;
      }
      const unfinished = activeSuggestion.slots.find((slot) => !slot.confirmed);
      if (unfinished) {
        const artist = talent.find((item) => item.id === unfinished.talentId);
        return `Finish adding ${artist?.stageName ?? "this DJ"}: confirm their hours before saving the ${activeSuggestion.name} slot.`;
      }
      return "";
    } catch {
      return "Choose valid DJ start and end times.";
    }
  }, [activeSuggestion, talent]);

  const draftTimeInvalid = useMemo(() => {
    if (!activeSuggestion) return true;
    try {
      const shiftStartMinute = clockToMinute(activeSuggestion.start);
      const shiftEndMinute = resolveEndMinute(shiftStartMinute, activeSuggestion.end);
      const windows = activeSuggestion.slots.map((slot) => resolveAssignmentMinutes(shiftStartMinute, shiftEndMinute, slot.start, slot.end));
      return windows.some((window) => !window.withinShift) || hasOverlappingAssignmentMinutes(windows);
    } catch {
      return true;
    }
  }, [activeSuggestion]);

  const payload = useMemo(() => {
    if (modal?.type !== "add" || !activeSuggestion || activeSuggestion.existing) return "";
    try {
      const startMinute = clockToMinute(activeSuggestion.start);
      const endMinute = resolveEndMinute(startMinute, activeSuggestion.end);
      return JSON.stringify({
        residencyId: residency.id,
        serviceDate: modal.date,
        dayparts: [{
          daypartId: activeSuggestion.sourceDaypartId,
          name: activeSuggestion.oneTime ? activeSuggestion.name : undefined,
          room: activeSuggestion.oneTime ? activeSuggestion.room : undefined,
          calendarColor: activeSuggestion.oneTime ? activeSuggestion.color : undefined,
          startMinute,
          endMinute,
          clientRateOverrideCents: dollarsToCents(activeSuggestion.clientRateOverride),
          assignments: activeSuggestion.type === "house_activity" ? [] : activeSuggestion.slots.filter((slot) => slot.confirmed).map((slot) => {
            const assignment = resolveAssignmentMinutes(startMinute, endMinute, slot.start, slot.end);
            return {
              talentId: slot.talentId,
              startsAtMinute: assignment.startMinute,
              endsAtMinute: assignment.endMinute,
              compensationType: slot.compensationType,
              talentRateOverrideCents: dollarsToCents(slot.rateOverride),
              fixedFeeCents: dollarsToCents(slot.fixedFee),
            };
          }),
        }],
      });
    } catch {
      return "";
    }
  }, [activeSuggestion, modal, residency.id]);

  const replacementWarning = useMemo(() => {
    if (!replacementDraft || !editingEvent) return "";
    if (!replacementDraft.start || !replacementDraft.end) return "";
    try {
      const replacement = resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, replacementDraft.start, replacementDraft.end);
      if (!replacement.withinShift) {
        return `The ${editingEvent.title} slot is only ${formatLocalMinute(editingEvent.shiftStartMinute)}–${formatLocalMinute(editingEvent.shiftEndMinute)}. Please adjust DJ times.`;
      }
      const otherWindows = editingEvent.assignments.filter((assignment) => assignment.id !== replacementDraft.assignmentId).map((assignment) => (
        resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, assignment.startClock, assignment.endClock)
      ));
      if (hasOverlappingAssignmentMinutes([replacement, ...otherWindows])) {
        return `This DJ's time overlaps another DJ in the ${editingEvent.title} slot.`;
      }
      return "";
    } catch {
      return "Choose valid start and end times for the replacement DJ.";
    }
  }, [editingEvent, replacementDraft]);

  const newAssignmentWarning = useMemo(() => {
    if (!newAssignmentDraft || !editingEvent || !newAssignmentDraft.start || !newAssignmentDraft.end) return "";
    try {
      const candidate = resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, newAssignmentDraft.start, newAssignmentDraft.end);
      if (!candidate.withinShift) {
        return `The ${editingEvent.title} service window is ${formatLocalMinute(editingEvent.shiftStartMinute)}–${formatLocalMinute(editingEvent.shiftEndMinute)}. Please adjust DJ times.`;
      }
      const existingWindows = editingEvent.assignments.map((assignment) => resolveAssignmentMinutes(
        editingEvent.shiftStartMinute,
        editingEvent.shiftEndMinute,
        assignment.startClock,
        assignment.endClock,
      ));
      if (hasOverlappingAssignmentMinutes([candidate, ...existingWindows])) return `This DJ's time overlaps another DJ in the ${editingEvent.title} slot.`;
      return "";
    } catch {
      return "Choose valid start and end times for this DJ.";
    }
  }, [editingEvent, newAssignmentDraft]);

  function startAddingAssignment() {
    if (!editingEvent) return;
    const existingEnds = editingEvent.assignments.map((assignment) => resolveAssignmentMinutes(
      editingEvent.shiftStartMinute,
      editingEvent.shiftEndMinute,
      assignment.startClock,
      assignment.endClock,
    ).endMinute);
    const suggestedStart = existingEnds.length ? Math.max(...existingEnds) : editingEvent.shiftStartMinute;
    setReplacementDraft(null);
    setEditState(initialActionState);
    setNewAssignmentDraft(emptySlot("", minuteToClock(suggestedStart < editingEvent.shiftEndMinute ? suggestedStart : editingEvent.shiftStartMinute), minuteToClock(editingEvent.shiftEndMinute)));
  }

  async function saveNewAssignment() {
    if (!editingEvent || !newAssignmentDraft?.talentId || !newAssignmentDraft.start || !newAssignmentDraft.end || newAssignmentWarning) return;
    const window = resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, newAssignmentDraft.start, newAssignmentDraft.end);
    const formData = new FormData();
    formData.set("shiftId", editingEvent.id);
    formData.set("talentId", newAssignmentDraft.talentId);
    formData.set("startsAtMinute", String(window.startMinute));
    formData.set("endsAtMinute", String(window.endMinute));
    formData.set("compensationType", newAssignmentDraft.compensationType);
    formData.set("talentRateOverride", newAssignmentDraft.rateOverride);
    formData.set("fixedFee", newAssignmentDraft.fixedFee);
    setEditPending(true);
    const result = await addCalendarAssignmentAction(formData);
    setEditPending(false);
    setEditState(result);
    if (result.status === "success") setNewAssignmentDraft(null);
  }

  async function saveReplacement() {
    if (!editingEvent || !replacementDraft?.talentId || !replacementDraft.start || !replacementDraft.end || replacementWarning) return;
    const window = resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, replacementDraft.start, replacementDraft.end);
    const formData = new FormData();
    formData.set("assignmentId", replacementDraft.assignmentId);
    formData.set("talentId", replacementDraft.talentId);
    formData.set("startsAtMinute", String(window.startMinute));
    formData.set("endsAtMinute", String(window.endMinute));
    setEditPending(true);
    const result = await rescheduleAssignmentAction(formData);
    setEditPending(false);
    setEditState(result);
    if (result.status === "success") setReplacementDraft(null);
  }

  async function removeExistingAssignment(assignmentId: string) {
    const formData = new FormData();
    formData.set("assignmentId", assignmentId);
    setEditPending(true);
    const result = await removeCalendarAssignmentAction(formData);
    setEditPending(false);
    setEditState(result);
    if (replacementDraft?.assignmentId === assignmentId) setReplacementDraft(null);
  }

  const previousHref = `/app/calendar?residency=${residency.id}&month=${shiftMonthKey(monthKey, -1)}`;
  const nextHref = `/app/calendar?residency=${residency.id}&month=${shiftMonthKey(monthKey, 1)}`;

  return (
    <>
      <header className="page-header calendar-page-header calendar-command-bar">
        <div className="calendar-title"><p className="eyebrow">{residency.name}</p><h1>Calendar</h1></div>
        <div className="calendar-command-controls">
          <div className="calendar-view-filters">
          <div className="field"><label htmlFor="calendar-status-filter">Status</label><select id="calendar-status-filter" value={statusFilter} onChange={(event) => changeStatusFilter(event.target.value as StatusFilter)}><option value="needs">Needs coverage</option><option value="all">All slots</option><option value="filled">Scheduled</option></select></div>
          <div className="field"><label htmlFor="calendar-daypart-filter">Daypart</label><select id="calendar-daypart-filter" value={daypartFilter} onChange={(event) => changeDaypartFilter(event.target.value)}><option value="all">All Dayparts</option>{dayparts.filter((daypart) => daypart.active).map((daypart) => <option value={daypart.id} key={daypart.id}>{daypart.name}</option>)}</select></div>
          </div>
          <CalendarShareButton residencyId={residency.id} residencyName={residency.name} linkSettings={residency.calendarLinkSettings} dayparts={dayparts.filter((daypart) => daypart.active).map((daypart) => ({ id: daypart.id, name: daypart.name, room: daypart.room, color: daypart.color }))} />
          <div className="calendar-month-cluster">
            <div className={`calendar-needs-summary ${needsDjCount ? "attention" : "clear"}`}><strong>{needsDjCount}</strong><span>{needsDjCount === 1 ? "slot needs coverage" : "slots need coverage"}</span></div>
            <div className="month-navigation"><Link className="calendar-arrow" aria-label="Previous month" href={previousHref}>←</Link><h2>{monthLabel(monthKey)}</h2><Link className="calendar-arrow" aria-label="Next month" href={nextHref}>→</Link></div>
          </div>
        </div>
      </header>
      <MonthCalendar compact monthKey={monthKey} events={filteredEvents} selectedDate={modal?.type === "add" ? modal.date : editingEvent?.date} onDateClick={openDate} onEventClick={openEvent} />

      {modal ? <div className="quick-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setModal(null); }}>
        <section className={`quick-modal ${modal.type === "edit" ? "quick-modal-edit" : ""}`} role="dialog" aria-modal="true" aria-labelledby="quick-modal-title">
          <header className="quick-modal-header">
            <div><p className="eyebrow">{modal.type === "add" ? `${weekdayNames[weekdayForDate(modal.date)]}, ${modal.date}` : editingEvent?.date}</p><h2 id="quick-modal-title">{modal.type === "add" ? activeSuggestion?.type === "house_activity" ? "Schedule house activity" : "Assign DJ" : editingEvent?.daypartType === "house_activity" ? `Scheduled · ${editingEvent.title}` : `Manage DJs · ${editingEvent?.title ?? "Slot"}`}</h2></div>
            <button className="quick-modal-close" type="button" aria-label="Close popup" onClick={() => setModal(null)}>×</button>
          </header>

          <div className="quick-modal-body">
            {modal.type === "add" ? (
              addMode === "choose" ? <div className="quick-add-choice">
                <button className="quick-add-choice-card" type="button" onClick={() => { const next = suggestions.find((suggestion) => !suggestion.oneTime && !suggestion.existing) ?? suggestions.find((suggestion) => !suggestion.oneTime); if (next) chooseSuggestion(next); }} disabled={!suggestions.some((suggestion) => !suggestion.oneTime)}><span>Existing Daypart</span><strong>Use a setup Daypart</strong><small>Choose any active Daypart and adjust the hours for this date.</small></button>
                <button className="quick-add-choice-card one-time" type="button" onClick={() => { const next = suggestions.find((suggestion) => suggestion.oneTime); if (next) chooseSuggestion(next); }}><span>One-time</span><strong>Create a one-time slot</strong><small>Add something unique to this date without creating a recurring rule.</small></button>
              </div> : <form action={formAction} className="quick-book-form">
                <input name="payload" type="hidden" value={payload} />
                {addMode === "daypart" && !directDaypartSelection ? <div className="quick-slot-picker" role="group" aria-label="Choose Daypart">{suggestions.filter((suggestion) => !suggestion.oneTime).map((suggestion) => <button className={`quick-slot-option ${activeSuggestion?.daypartId === suggestion.daypartId ? "active" : ""}`} style={{ "--daypart-color": suggestion.color } as CSSProperties} type="button" onClick={() => chooseSuggestion(suggestion)} key={suggestion.daypartId}><span><strong>{suggestion.name}</strong><small>{suggestion.recurringToday ? `${suggestion.room} · ${formatLocalMinute(clockToMinute(suggestion.start))}–${formatLocalMinute(resolveEndMinute(clockToMinute(suggestion.start), suggestion.end))}` : `${suggestion.room} · not normally scheduled this day`}</small></span>{suggestion.existing ? <Status value="scheduled" /> : null}</button>)}</div> : null}

                {activeSuggestion?.existing ? <div className="quick-existing"><p>This slot is already scheduled.</p><button className="button" type="button" onClick={() => openExistingDaypart(activeSuggestion.daypartId, modal.date)}>View scheduled slot</button></div> : activeSuggestion ? <>
                  {activeSuggestion.oneTime ? <div className="quick-one-time-fields"><div className="field"><label>Slot name</label><input value={activeSuggestion.name} onChange={(event) => updateSuggestion({ name: event.target.value })} placeholder="Movie Night" required /></div><div className="field"><label>Room / space</label><input value={activeSuggestion.room} onChange={(event) => updateSuggestion({ room: event.target.value })} placeholder="Pool" required /></div><div className="field"><label>Calendar color</label><div className="daypart-color-control"><input aria-label="One-time slot color" type="color" value={activeSuggestion.color} onChange={(event) => updateSuggestion({ color: event.target.value.toUpperCase() })} /><strong>{activeSuggestion.color}</strong></div></div></div> : null}
                  {!activeSuggestion.oneTime ? <div className="quick-selected-daypart" style={{ "--daypart-color": activeSuggestion.color } as CSSProperties}><div><span>Selected Daypart</span><strong>{activeSuggestion.name}</strong><small>{activeSuggestion.room}</small></div><div className="quick-selected-window"><span>Recommended window</span><strong>{formatLocalMinute(clockToMinute(activeSuggestion.start))}–{formatLocalMinute(resolveEndMinute(clockToMinute(activeSuggestion.start), activeSuggestion.end))}</strong></div></div> : <div className="quick-time-fields"><div className="field"><label>Slot starts</label><TimeSelect ariaLabel="One-time slot start time" value={activeSuggestion.start} onChange={(value) => updateShiftTime("start", value)} stepMinutes={15} required /></div><div className="field"><label>Slot ends</label><TimeSelect ariaLabel="One-time slot end time" value={activeSuggestion.end} onChange={(value) => updateShiftTime("end", value)} stepMinutes={15} required /></div></div>}
                  {!activeSuggestion.oneTime ? <details className="quick-shift-options"><summary>Change this slot&apos;s overall window</summary><div className="quick-time-fields"><div className="field"><label>Slot starts</label><TimeSelect ariaLabel={`${activeSuggestion.name} slot start time`} value={activeSuggestion.start} onChange={(value) => updateShiftTime("start", value)} stepMinutes={15} required /></div><div className="field"><label>Slot ends</label><TimeSelect ariaLabel={`${activeSuggestion.name} slot end time`} value={activeSuggestion.end} onChange={(value) => updateShiftTime("end", value)} stepMinutes={15} required /></div></div></details> : null}

                  {activeSuggestion.type === "dj_artist" ? <><div className="quick-assignment-heading"><div><strong>{activeSuggestion.slots.length ? "DJ assignments" : "Choose a DJ"}</strong><small>{activeSuggestion.slots.length ? "Add another DJ if needed; individual hours cannot overlap." : "Search and select the artist first. You’ll choose their exact play time next."}</small></div></div>
                  {!activeSuggestion.slots.length ? <ArtistSearchPicker artists={artistOptions} excludedIds={[]} label="Search and select a DJ" initiallyOpen onSelect={addArtist} /> : null}
                  <div className="quick-assignment-list">{activeSuggestion.slots.map((slot, slotIndex) => {
                    const artist = talent.find((item) => item.id === slot.talentId);
                    return <div className={`quick-assignment-card ${slot.confirmed ? "confirmed" : "draft"}`} key={slot.id}>
                      <div className="quick-assignment-card-heading"><div><span>DJ {slotIndex + 1}</span><strong>{artist?.stageName ?? "DJ"}</strong><small>{slot.confirmed ? "✓ Added" : "Finish this DJ"}</small></div><div className="quick-card-actions">{slot.confirmed ? <button type="button" onClick={() => updateSlot(slotIndex, { confirmed: false })}>Edit</button> : null}<button type="button" onClick={() => removeArtist(slot.id)}>Remove</button></div></div>
                      {!slot.confirmed ? <div className="quick-assignment-time-intro"><div><strong>Choose play time</strong><small>Recommended: {formatLocalMinute(clockToMinute(activeSuggestion.start))}–{formatLocalMinute(resolveEndMinute(clockToMinute(activeSuggestion.start), activeSuggestion.end))}</small></div><button type="button" onClick={() => updateSlot(slotIndex, { start: activeSuggestion.start, end: activeSuggestion.end })}>Use recommended</button></div> : null}
                      <div className="quick-dj-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel={`${artist?.stageName ?? `DJ ${slotIndex + 1}`} start time`} value={slot.start} disabled={slot.confirmed} onChange={(value) => updateSlot(slotIndex, { start: value })} stepMinutes={15} required /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel={`${artist?.stageName ?? `DJ ${slotIndex + 1}`} end time`} value={slot.end} disabled={slot.confirmed} onChange={(value) => updateSlot(slotIndex, { end: value })} stepMinutes={15} required /></div></div>
                      {!slot.confirmed ? <button className="button quick-confirm-dj" type="button" disabled={draftTimeInvalid} onClick={() => confirmArtist(slot.id)}>Add DJ</button> : null}
                    </div>;
                  })}</div>
                  {activeSuggestion.slots.length && !activeSuggestion.slots.some((slot) => !slot.confirmed) ? <ArtistSearchPicker artists={artistOptions} excludedIds={activeSuggestion.slots.map((slot) => slot.talentId)} label="Add another DJ" onSelect={addArtist} /> : null}
                  {assignmentWarning && activeSuggestion.slots.length ? <p className={assignmentWarning.startsWith("Finish adding") ? "draft-notice" : "error"} aria-live="polite">{assignmentWarning}</p> : null}

                  {!previewMode && activeSuggestion.billingMode === "billed_by_hfy" ? <details className="quick-more"><summary>Pay and billing options</summary><div className="quick-more-fields"><div className="field"><label>Client rate override</label><SensitiveInput type="number" min="0" step="0.01" value={activeSuggestion.clientRateOverride} onChange={(event) => updateSuggestion({ clientRateOverride: event.target.value })} placeholder={`Default $${(residency.clientHourlyRateCents / 100).toFixed(0)}/hr`} /></div>{activeSuggestion.slots.map((slot, slotIndex) => <div className="quick-slot-details" key={slot.id}><strong>DJ {slotIndex + 1}</strong><div className="field"><label>Compensation</label><select value={slot.compensationType} onChange={(event) => updateSlot(slotIndex, { compensationType: event.target.value as SlotDraft["compensationType"] })}><option value="hourly">Hourly</option><option value="fixed">Fixed fee</option><option value="na">N/A</option></select></div><div className="field"><label>{slot.compensationType === "fixed" ? "Fixed fee" : "Talent rate override"}</label><SensitiveInput type="number" min="0" step="0.01" value={slot.compensationType === "fixed" ? slot.fixedFee : slot.rateOverride} onChange={(event) => updateSlot(slotIndex, slot.compensationType === "fixed" ? { fixedFee: event.target.value } : { rateOverride: event.target.value })} placeholder={slot.compensationType === "hourly" ? `${activeSuggestion.defaultTalentRateCents === null ? "Residency" : "Daypart"} default $${((activeSuggestion.defaultTalentRateCents ?? residency.defaultTalentRateCents) / 100).toFixed(0)}/hr` : undefined} /></div></div>)}</div></details> : activeSuggestion.billingMode === "tracking_only" ? <p className="privacy-note">Tracking only — this booking will appear on the calendar and in the artist&apos;s booking history, with no payout or invoice records.</p> : null}</> : <div className="quick-house-activity"><strong>Ready to schedule</strong><p>This activity will be marked on the calendar without an artist, rate, payout, or invoice record.</p></div>}
                </> : null}

                {state.status === "error" ? <p className="error" aria-live="polite">{state.message}</p> : null}
                <footer className="quick-modal-footer"><button className="button secondary" type="button" onClick={() => { setDirectDaypartSelection(false); setAddMode("choose"); }}>Back</button><span>{activeSuggestion?.type === "house_activity" ? "Confirm this activity?" : "All DJs added?"}</span><button className="button secondary" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button" type="submit" disabled={pending || !activeSuggestion || activeSuggestion.existing || !activeSuggestion.name.trim() || !activeSuggestion.room.trim() || Boolean(assignmentWarning)}>{pending ? "Saving…" : activeSuggestion?.type === "house_activity" ? "Mark scheduled" : `Save ${activeSuggestion?.name || "music"} slot`}</button></footer>
              </form>
            ) : editingEvent ? editingEvent.recordType === "nonfinancial_occurrence" ? <>
              <div className="quick-time-summary"><span>{editingEvent.title}</span><strong>{editingEvent.time}</strong></div>
              <div className="quick-house-activity"><strong>{editingEvent.daypartType === "house_activity" ? "House activity scheduled" : "Tracking-only booking scheduled"}</strong><p>{editingEvent.daypartType === "house_activity" ? "No artist or financial records were created." : "This artist booking is tracked without payout or invoice records."}</p></div>
              {editingEvent.assignments.length ? <div className="quick-reschedule-list">{editingEvent.assignments.map((assignment, index) => <div className="quick-reschedule-row" key={assignment.id}><div className="quick-existing-dj"><span>DJ {index + 1}</span><strong>{assignment.talentName}</strong><small>{formatLocalMinute(resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, assignment.startClock, assignment.endClock).startMinute)}–{formatLocalMinute(resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, assignment.startClock, assignment.endClock).endMinute)}</small></div></div>)}</div> : null}
              <footer className="quick-modal-footer"><button className="button secondary" type="button" onClick={() => setModal(null)}>Done</button></footer>
            </> : <>
              <div className="quick-time-summary"><span>{editingEvent.title}</span><strong>{editingEvent.time}</strong></div>
              <div className="quick-existing-toolbar"><p className="quick-guidance">Add, change, or remove one DJ at a time. Every change requires explicit hours{previewMode ? "." : " because those hours determine pay."}</p><button className="button" type="button" disabled={editPending || Boolean(newAssignmentDraft)} onClick={startAddingAssignment}>+ Add another DJ</button></div>
              {newAssignmentDraft ? <section className="replacement-editor new-assignment-editor">
                <div className="replacement-step"><span>1</span><div><strong>Choose the DJ</strong><small>Only artists approved for this Residency appear here.</small></div></div>
                {newAssignmentDraft.talentId ? <div className="replacement-selected"><div><span>Selected DJ</span><strong>{talent.find((item) => item.id === newAssignmentDraft.talentId)?.stageName}</strong></div><button type="button" onClick={() => setNewAssignmentDraft({ ...newAssignmentDraft, talentId: "" })}>Choose someone else</button></div> : <ArtistSearchPicker label="Choose DJ" artists={artistOptions} excludedIds={editingEvent.assignments.map((item) => item.talentId).filter((id): id is string => Boolean(id))} onSelect={(talentId) => setNewAssignmentDraft({ ...newAssignmentDraft, talentId })} />}
                <div className="replacement-step"><span>2</span><div><strong>Set their hours</strong><small>The service window may use one DJ or several, but their times cannot overlap.</small></div></div>
                <div className="quick-dj-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel="New DJ start time" value={newAssignmentDraft.start} onChange={(value) => setNewAssignmentDraft({ ...newAssignmentDraft, start: value })} stepMinutes={15} /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel="New DJ end time" value={newAssignmentDraft.end} onChange={(value) => setNewAssignmentDraft({ ...newAssignmentDraft, end: value })} stepMinutes={15} /></div></div>
                {previewMode ? null : <details className="quick-more"><summary>Pay options</summary><div className="quick-more-fields"><div className="field"><label>Compensation</label><select value={newAssignmentDraft.compensationType} onChange={(event) => setNewAssignmentDraft({ ...newAssignmentDraft, compensationType: event.target.value as SlotDraft["compensationType"] })}><option value="hourly">Hourly</option><option value="fixed">Fixed fee</option><option value="na">N/A</option></select></div><div className="field"><label>{newAssignmentDraft.compensationType === "fixed" ? "Fixed fee" : "Talent rate override"}</label><SensitiveInput type="number" min="0" step="0.01" value={newAssignmentDraft.compensationType === "fixed" ? newAssignmentDraft.fixedFee : newAssignmentDraft.rateOverride} onChange={(event) => setNewAssignmentDraft({ ...newAssignmentDraft, ...(newAssignmentDraft.compensationType === "fixed" ? { fixedFee: event.target.value } : { rateOverride: event.target.value }) })} placeholder={newAssignmentDraft.compensationType === "hourly" ? "Uses Daypart or Residency default" : undefined} /></div></div></details>}
                {newAssignmentWarning ? <p className="error" aria-live="polite">{newAssignmentWarning}</p> : null}
                <div className="replacement-actions"><button className="button secondary" type="button" onClick={() => setNewAssignmentDraft(null)}>Cancel</button><button className="button" type="button" disabled={editPending || !newAssignmentDraft.talentId || !newAssignmentDraft.start || !newAssignmentDraft.end || Boolean(newAssignmentWarning)} onClick={saveNewAssignment}>{editPending ? "Saving…" : "Add DJ to Shift"}</button></div>
              </section> : null}
              <div className="quick-reschedule-list">{editingEvent.assignments.map((assignment, index) => {
                const changing = replacementDraft?.assignmentId === assignment.id;
                const replacement = changing ? talent.find((item) => item.id === replacementDraft.talentId) : undefined;
                return <div className={`quick-reschedule-row ${changing ? "changing" : ""}`} key={assignment.id}>
                  <div className="quick-existing-dj"><span>DJ {index + 1}</span><strong>{assignment.talentName || assignment.guestName || "Open slot"}</strong><small>{formatLocalMinute(resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, assignment.startClock, assignment.endClock).startMinute)}–{formatLocalMinute(resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, assignment.startClock, assignment.endClock).endMinute)}</small></div>
                  <div className="quick-existing-actions"><button className="button secondary" type="button" disabled={editPending} onClick={() => { setNewAssignmentDraft(null); setEditState(initialActionState); setReplacementDraft({ assignmentId: assignment.id, talentId: "", start: "", end: "" }); }}>Change DJ</button><button className="remove-dj-button" type="button" disabled={editPending} onClick={() => removeExistingAssignment(assignment.id)}>Remove DJ</button></div>
                  {changing && replacementDraft ? <div className="replacement-editor">
                    <div className="replacement-step"><span>1</span><div><strong>Choose the replacement DJ</strong><small>The current DJ remains unchanged until you save.</small></div></div>
                    {replacement ? <div className="replacement-selected"><div><span>Replacement</span><strong>{replacement.stageName}</strong></div><button type="button" onClick={() => setReplacementDraft({ ...replacementDraft, talentId: "" })}>Choose someone else</button></div> : <ArtistSearchPicker label="Choose replacement" artists={artistOptions} excludedIds={editingEvent.assignments.map((item) => item.talentId).filter((id): id is string => Boolean(id))} onSelect={(talentId) => setReplacementDraft({ ...replacementDraft, talentId })} />}
                    <div className="replacement-step"><span>2</span><div><strong>Confirm their hours</strong><small>{previewMode ? "Set the exact time this DJ will play." : "These hours determine this DJ's payout."}</small></div></div>
                    <div className="quick-dj-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel="Replacement DJ start time" value={replacementDraft.start} onChange={(value) => setReplacementDraft({ ...replacementDraft, start: value })} stepMinutes={15} /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel="Replacement DJ end time" value={replacementDraft.end} onChange={(value) => setReplacementDraft({ ...replacementDraft, end: value })} stepMinutes={15} /></div></div>
                    {replacementWarning ? <p className="error" aria-live="polite">{replacementWarning}</p> : null}
                    <div className="replacement-actions"><button className="button secondary" type="button" onClick={() => setReplacementDraft(null)}>Cancel change</button><button className="button" type="button" disabled={editPending || !replacementDraft.talentId || !replacementDraft.start || !replacementDraft.end || Boolean(replacementWarning)} onClick={saveReplacement}>{editPending ? "Saving…" : "Save DJ change"}</button></div>
                  </div> : null}
                </div>;
              })}</div>
              {editState.status !== "idle" ? <p className={editState.status === "error" ? "error" : "success"} aria-live="polite">{editState.message}</p> : null}
              {!editingEvent.assignments.length ? <div className="empty quick-empty">This Shift has no Assignment slots to edit.</div> : null}
              <footer className="quick-modal-footer"><button className="button secondary" type="button" onClick={() => setModal(null)}>Done</button></footer>
            </> : <div className="empty quick-empty">This slot is no longer available.</div>}
          </div>
        </section>
      </div> : null}
    </>
  );
}
