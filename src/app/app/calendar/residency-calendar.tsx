"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { addCalendarAssignmentAction, bookResidencyDateAction, cancelHfyTalentRequestAction, clearDaypartDateExceptionAction, deleteCalendarShiftAction, deleteOneTimeOccurrenceAction, removeCalendarAssignmentAction, rescheduleAssignmentAction, saveDaypartDateOverrideAction, skipDaypartDateAction, updateOneTimeOccurrenceAction, updateOneTimeShiftAction, type ResidencyActionState } from "@/app/app/actions";
import { HfyRequestFulfillment } from "@/app/app/hfy-request-fulfillment";
import { createClientOwnedArtistAction } from "@/app/residency/actions";
import { ArtistSearchPicker, type CreateArtistResult } from "@/components/artist-search-picker";
import { CalendarShareButton } from "@/components/calendar-share-button";
import { CalendarStatusLegend } from "@/components/calendar-status-legend";
import { DaypartColorPicker } from "@/components/daypart-color-picker";
import { Status } from "@/components/format";
import { SensitiveInput } from "@/components/privacy-mode";
import { TimeSelect } from "@/components/time-select";
import { MonthCalendar, type MonthCalendarEvent } from "@/components/month-calendar";
import { HFY_BOOKED_COLOR, clockToMinute, formatLocalMinute, hasOverlappingAssignmentMinutes, minuteToClock, resolveAssignmentMinutes, resolveEndMinute, weekdayForDate, weekdayNames, type DaypartDateException, type DaypartScheduleMode } from "@/domain/dayparts";
import { calendarDaypartsHref, monthLabel, shiftMonthKey } from "@/lib/calendar";
import type { DaypartBillingMode, DaypartType } from "@/domain/dayparts";
import type { PublicCalendarLinkSettings } from "@/data/internal";
import { MISSING_RESIDENCY_TALENT_RATE_MESSAGE } from "@/domain/residency-rates";
import { replacementDraftFromAssignment } from "@/domain/assignment-editing";
import { TALENT_GENRES } from "@/domain/talent-genres";

export type CalendarAssignment = {
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

export type ResidencyEvent = MonthCalendarEvent & {
  daypartId: string | null;
  shiftStartMinute: number;
  shiftEndMinute: number;
  projected: boolean;
  recordType: "financial_shift" | "nonfinancial_occurrence" | "projected";
  daypartType: DaypartType;
  billingMode: DaypartBillingMode | null;
  defaultDjCount?: number | null;
  programDetails: string;
  manualHostName: string;
  room?: string;
  notes?: string;
  editableColor?: string;
  assignments: CalendarAssignment[];
  economicsMode?: "hfy" | "client_owned" | "hfy_request";
  clientTalentDefaultRateCents?: number | null;
  hfyRequestId?: string | null;
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
    scheduleMode: DaypartScheduleMode;
    suggestedStartMinute: number | null;
    suggestedEndMinute: number | null;
    defaultTalentRateCents: number | null;
    activeUntil: string | null;
    active: boolean;
    rules: Array<{ weekday: number; startMinute: number; endMinute: number; defaultDjCount: number | null }>;
  }>;
  talent: Array<{ id: string; stageName: string; homeMarket: string; genres: string[]; priority: number | null; ownership?: "hfy" | "residency" }>;
  requestTalent?: Array<{ id: string; stageName: string; homeMarket: string; genres: string[]; priority: number | null; ownership?: "hfy" | "residency" }>;
  dateExceptions: DaypartDateException[];
  residencyOptions?: Array<{ id: string; name: string }>;
  residencySelectionParam?: "residency" | "calendarResidency";
  initialEventId?: string;
  previewMode?: boolean;
  fullProgramming?: boolean;
  calendarBasePath?: string;
  daypartsHref?: string;
  canManage?: boolean;
};

type SlotDraft = { id: string; talentId: string; start: string; end: string; confirmed: boolean; compensationType: "hourly" | "fixed" | "na"; rateOverride: string; fixedFee: string };
type SuggestionDraft = { daypartId: string; sourceDaypartId: string | null; oneTime: boolean; recurringToday: boolean; exceptionKind: "skip" | "override" | null; name: string; room: string; color: string; type: DaypartType | null; billingMode: DaypartBillingMode | null; defaultTalentRateCents: number | null; defaultDjCount: number | null; existing: boolean; start: string; end: string; clientTalentDefaultRate: string; clientRateOverride: string; notes: string; programDetails: string; manualHostName: string; requestHfy: boolean; slots: SlotDraft[] };
type ReplacementDraft = { assignmentId: string; talentId: string; start: string; end: string };
type OneTimeEditDraft = { name: string; room: string; color: string; start: string; end: string; clientTalentDefaultRate: string; notes: string; programDetails: string; manualHostName: string };
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

function oneTimeDraftFromEvent(event: ResidencyEvent): OneTimeEditDraft {
  return {
    name: event.title,
    room: event.room ?? "",
    color: event.editableColor ?? event.color ?? "#7A65D1",
    start: minuteToClock(event.shiftStartMinute),
    end: minuteToClock(event.shiftEndMinute),
    clientTalentDefaultRate: event.clientTalentDefaultRateCents === null || event.clientTalentDefaultRateCents === undefined ? "" : (event.clientTalentDefaultRateCents / 100).toFixed(2),
    notes: event.notes ?? "",
    programDetails: event.programDetails,
    manualHostName: event.manualHostName,
  };
}

export function ResidencyCalendar({ residency, monthKey, events, dayparts, talent, requestTalent = [], dateExceptions, residencyOptions, residencySelectionParam = "residency", initialEventId, previewMode = false, fullProgramming = false, calendarBasePath = "/app/calendar", daypartsHref, canManage = true }: ResidencyCalendarProps) {
  const router = useRouter();
  const initialEditingEvent = initialEventId ? events.find((event) => event.id === initialEventId && !event.projected) : undefined;
  const [modal, setModal] = useState<ModalState>(() => initialEditingEvent ? { type: "edit", eventId: initialEditingEvent.id } : null);
  const [suggestions, setSuggestions] = useState<SuggestionDraft[]>([]);
  const [activeDaypartId, setActiveDaypartId] = useState("");
  const [addMode, setAddMode] = useState<AddMode>("choose");
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [directDaypartSelection, setDirectDaypartSelection] = useState(false);
  const [clientArtistFlow, setClientArtistFlow] = useState(false);
  const [artistPickerKey, setArtistPickerKey] = useState(0);
  const [replacementDraft, setReplacementDraft] = useState<ReplacementDraft | null>(null);
  const [newAssignmentDraft, setNewAssignmentDraft] = useState<SlotDraft | null>(null);
  const [oneTimeEditDraft, setOneTimeEditDraft] = useState<OneTimeEditDraft | null>(() => initialEditingEvent && !initialEditingEvent.daypartId ? oneTimeDraftFromEvent(initialEditingEvent) : null);
  const [editState, setEditState] = useState<ResidencyActionState>(initialActionState);
  const [editPending, setEditPending] = useState(false);
  const [dateActionState, setDateActionState] = useState<ResidencyActionState>(initialActionState);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [daypartFilter, setDaypartFilter] = useState("all");
  const [addedTalent, setAddedTalent] = useState<typeof talent>([]);
  const oneTimeColorPickerRef = useRef<HTMLDetailsElement>(null);
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
    const savedDaypart = window.localStorage.getItem("hfy-calendar-daypart-filter");
    const restoreFilters = window.setTimeout(() => {
      if (savedDaypart && (savedDaypart === "all" || dayparts.some((daypart) => daypart.id === savedDaypart))) setDaypartFilter(savedDaypart);
    }, 0);
    return () => window.clearTimeout(restoreFilters);
  }, [dayparts]);

  const availableTalent = useMemo(() => {
    const artistsById = new Map(talent.map((artist) => [artist.id, artist]));
    addedTalent.forEach((artist) => artistsById.set(artist.id, artist));
    return [...artistsById.values()];
  }, [addedTalent, talent]);

  const artistOptions = useMemo(() => availableTalent.map((artist) => ({
    id: artist.id,
    name: artist.stageName,
    meta: [artist.homeMarket, artist.genres.join(" ")].filter(Boolean).join(" · "),
  })), [availableTalent]);
  const canCreateCalendarArtist = previewMode && !fullProgramming && canManage;

  async function createCalendarArtist(name: string): Promise<CreateArtistResult> {
    const formData = new FormData();
    formData.set("name", name);
    formData.set("contact", "");
    formData.set("homeMarket", "");
    formData.set("instagramHandle", "");
    formData.set("genre", TALENT_GENRES[1]);
    formData.set("customGenre", "");
    const result = await createClientOwnedArtistAction({ status: "idle", message: "" }, formData);
    if (result.status !== "success" || !result.artist) {
      return { status: "error", message: result.message || "Unable to add this DJ." };
    }
    const artist = { ...result.artist, priority: null, ownership: "residency" as const };
    setAddedTalent((current) => current.some((item) => item.id === artist.id) ? current : [...current, artist]);
    return {
      status: "success",
      artist: {
        id: artist.id,
        name: artist.stageName,
        meta: [artist.homeMarket, artist.genres.join(" ")].filter(Boolean).join(" · "),
      },
    };
  }

  const activeSuggestion = activeDaypartId
    ? suggestions.find((item) => item.daypartId === activeDaypartId)
    : undefined;
  const roomOptions = useMemo(() => {
    const rooms = new Map<string, { name: string; colors: string[]; daypartCount: number }>();
    suggestions.filter((suggestion) => !suggestion.oneTime).forEach((suggestion) => {
      const key = suggestion.room.trim().toLocaleLowerCase();
      if (!key) return;
      const current = rooms.get(key);
      if (current) {
        current.daypartCount += 1;
        if (!current.colors.includes(suggestion.color)) current.colors.push(suggestion.color);
      } else {
        rooms.set(key, { name: suggestion.room.trim(), colors: [suggestion.color], daypartCount: 1 });
      }
    });
    return [...rooms.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [suggestions]);
  const selectedRoomSuggestions = selectedRoom
    ? suggestions.filter((suggestion) => !suggestion.oneTime && suggestion.room.trim().toLocaleLowerCase() === selectedRoom.toLocaleLowerCase())
    : [];
  const clientStandingHfy = Boolean(previewMode && activeSuggestion?.type === "dj_artist" && (fullProgramming || (activeSuggestion.billingMode === "billed_by_hfy" && !activeSuggestion.oneTime)));
  const editingEvent = modal?.type === "edit" ? events.find((event) => event.id === modal.eventId) : undefined;
  const editingEventCanManageAssignments = Boolean(editingEvent && (
    editingEvent.recordType !== "financial_shift"
    || (previewMode ? editingEvent.economicsMode === "client_owned" : editingEvent.economicsMode !== "client_owned" && editingEvent.economicsMode !== "hfy_request")
  ));
  const pendingHfyRequest = !previewMode && editingEvent?.economicsMode === "hfy_request";
  const residencyTalentRateConfigured = residency.defaultTalentRateCents > 0;
  const needsDjCount = events.filter((event) => event.schedulingStatus === "empty" || event.schedulingStatus === "partial").length;
  const filteredEvents = events.filter((event) => {
    const statusMatches = statusFilter === "all"
      || (statusFilter === "needs" && (event.schedulingStatus === "empty" || event.schedulingStatus === "partial"))
      || (statusFilter === "filled" && event.schedulingStatus === "filled");
    return statusMatches && (daypartFilter === "all" || event.daypartId === daypartFilter);
  });

  function changeStatusFilter(value: StatusFilter) { setStatusFilter(value); }

  function changeDaypartFilter(value: string) {
    setDaypartFilter(value);
    window.localStorage.setItem("hfy-calendar-daypart-filter", value);
  }

  function openDate(date: string, preferredDaypartId?: string) {
    const weekday = weekdayForDate(date);
    const existingDayparts = new Set(events.filter((event) => !event.projected && event.date === date && event.daypartId).map((event) => event.daypartId));
    const nextSuggestions: SuggestionDraft[] = dayparts.flatMap((daypart) => {
      if (!daypart.active || (daypart.activeUntil && date > daypart.activeUntil)) return [];
      const recurringRule = daypart.scheduleMode === "standing_weekly" ? daypart.rules.find((item) => item.weekday === weekday) : undefined;
      const rule = recurringRule ?? (daypart.scheduleMode === "calendar_only" && daypart.suggestedStartMinute !== null && daypart.suggestedEndMinute !== null
        ? { weekday, startMinute: daypart.suggestedStartMinute, endMinute: daypart.suggestedEndMinute, defaultDjCount: null }
        : daypart.rules[0]);
      if (!rule) return [];
      const dateException = dateExceptions.find((item) => item.daypartId === daypart.id && item.serviceDate === date);
      const startMinute = dateException?.kind === "override" && dateException.startMinute !== null ? dateException.startMinute : rule.startMinute;
      const endMinute = dateException?.kind === "override" && dateException.endMinute !== null ? dateException.endMinute : rule.endMinute;
      const start = minuteToClock(startMinute);
      const end = minuteToClock(endMinute);
      return [{
        daypartId: daypart.id,
        sourceDaypartId: daypart.id,
        oneTime: false,
        recurringToday: daypart.scheduleMode === "standing_weekly" && Boolean(recurringRule),
        exceptionKind: dateException?.kind ?? null,
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
        clientTalentDefaultRate: "",
        clientRateOverride: "",
        notes: "",
        programDetails: "",
        manualHostName: "",
        requestHfy: false,
        slots: [],
      }];
    });
    nextSuggestions.push({
      daypartId: "one-time",
      sourceDaypartId: null,
      oneTime: true,
      recurringToday: false,
      exceptionKind: null,
      name: "",
      room: "",
      color: "#7A65D1",
      type: fullProgramming ? "house_activity" : null,
      billingMode: null,
      defaultTalentRateCents: null,
      defaultDjCount: null,
      existing: false,
      start: "18:00",
      end: "21:00",
      clientTalentDefaultRate: "",
      clientRateOverride: "",
      notes: "",
      programDetails: "",
      manualHostName: "",
      requestHfy: false,
      slots: [],
    });
    setSuggestions(nextSuggestions);
    const preferred = nextSuggestions.find((item) => item.daypartId === preferredDaypartId);
    setActiveDaypartId(preferred?.daypartId ?? "");
    setSelectedRoom(preferred?.room ?? null);
    setAddMode(preferred ? "daypart" : "choose");
    setDirectDaypartSelection(Boolean(preferred));
    setClientArtistFlow(false);
    setReplacementDraft(null);
    setNewAssignmentDraft(null);
    setEditState(initialActionState);
    setDateActionState(initialActionState);
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
    setDateActionState(initialActionState);
    setOneTimeEditDraft(residencyEvent && !residencyEvent.daypartId ? oneTimeDraftFromEvent(residencyEvent) : null);
    setModal({ type: "edit", eventId: event.id });
  }

  function openExistingDaypart(daypartId: string, date: string) {
    const event = events.find((item) => !item.projected && item.date === date && item.daypartId === daypartId);
    if (event) {
      setReplacementDraft(null);
      setNewAssignmentDraft(null);
      setEditState(initialActionState);
      setOneTimeEditDraft(!event.daypartId ? oneTimeDraftFromEvent(event) : null);
      setModal({ type: "edit", eventId: event.id });
    }
  }

  function updateSuggestion(next: Partial<SuggestionDraft>) {
    setSuggestions((current) => current.map((item) => item.daypartId === activeDaypartId ? { ...item, ...next } : item));
  }

  function chooseOneTimeType(type: DaypartType) {
    setClientArtistFlow(false);
    updateSuggestion({
      type,
      billingMode: type === "house_activity" ? null : previewMode && !fullProgramming ? "tracking_only" : "billed_by_hfy",
      ...(type === "house_activity" ? { clientTalentDefaultRate: "" } : {}),
      requestHfy: false,
      slots: [],
    });
  }

  function chooseSuggestion(suggestion: SuggestionDraft) {
    setClientArtistFlow(false);
    setActiveDaypartId(suggestion.daypartId);
    if (!suggestion.oneTime) setSelectedRoom(suggestion.room);
    setAddMode(suggestion.oneTime ? "one-time" : "daypart");
    setDirectDaypartSelection(false);
  }

  function chooseRoom(room: string) {
    setSelectedRoom(room);
    setActiveDaypartId("");
    setAddMode("daypart");
    setDirectDaypartSelection(false);
  }

  function chooseOneTime(room?: string) {
    const oneTime = suggestions.find((suggestion) => suggestion.oneTime);
    if (!oneTime) return;
    const nextRoom = room?.trim() ?? "";
    setSuggestions((current) => current.map((suggestion) => suggestion.oneTime ? { ...suggestion, room: nextRoom } : suggestion));
    setSelectedRoom(nextRoom || null);
    setClientArtistFlow(false);
    setActiveDaypartId(oneTime.daypartId);
    setAddMode("one-time");
    setDirectDaypartSelection(false);
  }

  function returnToAddPicker() {
    setClientArtistFlow(false);
    setActiveDaypartId("");
    setDirectDaypartSelection(false);
    setAddMode(selectedRoom ? "daypart" : "choose");
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
    setClientArtistFlow(true);
    setSuggestions((current) => current.map((item) => item.daypartId === activeDaypartId ? {
      ...item,
      requestHfy: false,
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

  function requestHfyForSuggestion() {
    setClientArtistFlow(false);
    setSuggestions((current) => current.map((item) => item.daypartId === activeDaypartId ? {
      ...item,
      requestHfy: true,
      slots: [],
    } : item));
  }

  const assignmentWarning = useMemo(() => {
    if (!activeSuggestion || activeSuggestion.existing) return "";
    if (!activeSuggestion.slots.length) return "";
    if (!previewMode && !residencyTalentRateConfigured) return MISSING_RESIDENCY_TALENT_RATE_MESSAGE;
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
        return `The ${activeSuggestion.name} slot is only ${formatLocalMinute(shiftStartMinute)}–${formatLocalMinute(shiftEndMinute)}. Please adjust talent times.`;
      }
      if (hasOverlappingAssignmentMinutes(windows)) {
        return `Talent times overlap in the ${activeSuggestion.name} slot. Adjust the times before adding this artist.`;
      }
      const unfinished = activeSuggestion.slots.find((slot) => !slot.confirmed);
      if (unfinished) {
        const artist = availableTalent.find((item) => item.id === unfinished.talentId);
        return `Finish adding ${artist?.stageName ?? "this artist"}: confirm their hours before saving the ${activeSuggestion.name} slot.`;
      }
      return "";
    } catch {
      return "Choose valid talent start and end times.";
    }
  }, [activeSuggestion, availableTalent, previewMode, residencyTalentRateConfigured]);

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
    if (modal?.type !== "add" || !activeSuggestion || activeSuggestion.existing || !activeSuggestion.type) return "";
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
          type: activeSuggestion.oneTime ? activeSuggestion.type : undefined,
          billingMode: activeSuggestion.oneTime ? activeSuggestion.billingMode : undefined,
          clientTalentDefaultRateCents: activeSuggestion.oneTime && activeSuggestion.type === "dj_artist"
            ? dollarsToCents(activeSuggestion.clientTalentDefaultRate)
            : undefined,
          startMinute,
          endMinute,
          clientRateOverrideCents: dollarsToCents(activeSuggestion.clientRateOverride),
          notes: activeSuggestion.notes,
          programDetails: activeSuggestion.programDetails,
          manualHostName: activeSuggestion.manualHostName,
          requestHfy: previewMode && !fullProgramming && activeSuggestion.requestHfy,
          assignments: (activeSuggestion.type === "house_activity" ? [] : activeSuggestion.slots.filter((slot) => slot.confirmed)).map((slot) => {
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
  }, [activeSuggestion, fullProgramming, modal, previewMode, residency.id]);

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
    if (!previewMode && !residencyTalentRateConfigured) {
      setEditState({ status: "error", message: MISSING_RESIDENCY_TALENT_RATE_MESSAGE });
      return;
    }
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
    if (result.status === "success") {
      setReplacementDraft(null);
      router.refresh();
    }
  }

  async function removeExistingAssignment(assignmentId: string) {
    const formData = new FormData();
    formData.set("assignmentId", assignmentId);
    setEditPending(true);
    const result = await removeCalendarAssignmentAction(formData);
    setEditPending(false);
    setEditState(result);
    if (result.status === "success") {
      if (replacementDraft?.assignmentId === assignmentId) setReplacementDraft(null);
      router.refresh();
    }
  }

  async function deleteExistingShift() {
    if (!editingEvent || editingEvent.recordType !== "financial_shift") return;
    if (!window.confirm(`Delete the ${editingEvent.title} Shift on ${editingEvent.date}? This removes its uncompleted DJ assignments too.`)) return;
    setEditPending(true);
    const formData = new FormData();
    formData.set("shiftId", editingEvent.id);
    const result = await deleteCalendarShiftAction(formData);
    setEditState(result);
    setEditPending(false);
    if (result.status === "success") setModal(null);
  }

  function oneTimeRecordFormData(event: ResidencyEvent, draft: OneTimeEditDraft) {
    const startMinute = clockToMinute(draft.start);
    const endMinute = resolveEndMinute(startMinute, draft.end);
    const formData = new FormData();
    formData.set("id", event.id);
    formData.set("name", draft.name);
    formData.set("room", draft.room);
    formData.set("calendarColor", draft.color);
    formData.set("startMinute", String(startMinute));
    formData.set("endMinute", String(endMinute));
    formData.set("clientTalentDefaultRateCents", draft.clientTalentDefaultRate ? String(dollarsToCents(draft.clientTalentDefaultRate) ?? "") : "");
    formData.set("notes", draft.notes);
    formData.set("programDetails", draft.programDetails);
    formData.set("manualHostName", draft.manualHostName);
    return formData;
  }

  async function saveOneTimeRecord() {
    if (!editingEvent || editingEvent.daypartId || !oneTimeEditDraft) return;
    setEditPending(true);
    try {
      const formData = oneTimeRecordFormData(editingEvent, oneTimeEditDraft);
      const result = editingEvent.recordType === "financial_shift"
        ? await updateOneTimeShiftAction(formData)
        : await updateOneTimeOccurrenceAction(formData);
      setEditState(result);
      if (result.status === "success") {
        setModal(null);
        router.refresh();
      }
    } catch {
      setEditState({ status: "error", message: "Choose valid one-time slot details and hours." });
    } finally {
      setEditPending(false);
    }
  }

  async function deleteExistingOccurrence() {
    if (!editingEvent || editingEvent.recordType !== "nonfinancial_occurrence" || editingEvent.daypartId) return;
    if (!window.confirm(`Delete ${editingEvent.title} on ${editingEvent.date}?`)) return;
    const formData = new FormData();
    formData.set("occurrenceId", editingEvent.id);
    setEditPending(true);
    const result = await deleteOneTimeOccurrenceAction(formData);
    setEditPending(false);
    setEditState(result);
    if (result.status === "success") {
      setModal(null);
      router.refresh();
    }
  }

  async function saveDateOverride() {
    if (modal?.type !== "add" || !activeSuggestion?.sourceDaypartId) return;
    let startMinute: number;
    let endMinute: number;
    try {
      startMinute = clockToMinute(activeSuggestion.start);
      endMinute = resolveEndMinute(startMinute, activeSuggestion.end);
    } catch {
      setDateActionState({ status: "error", message: "Choose valid hours for this date." });
      return;
    }
    const formData = new FormData();
    formData.set("residencyId", residency.id);
    formData.set("daypartId", activeSuggestion.sourceDaypartId);
    formData.set("serviceDate", modal.date);
    formData.set("startMinute", String(startMinute));
    formData.set("endMinute", String(endMinute));
    setEditPending(true);
    const result = await saveDaypartDateOverrideAction(formData);
    setEditPending(false);
    setDateActionState(result);
    if (result.status === "success") {
      setModal(null);
      router.refresh();
    }
  }

  async function skipSelectedDate() {
    const daypartId = modal?.type === "add" ? activeSuggestion?.sourceDaypartId : editingEvent?.daypartId;
    const serviceDate = modal?.type === "add" ? modal.date : editingEvent?.date;
    if (!daypartId || !serviceDate) return;
    const message = editingEvent
      ? `Skip ${editingEvent.title} on ${serviceDate}? Its dated schedule and any uncompleted DJ assignments will be removed, but the standing Daypart will remain.`
      : `Skip this Daypart on ${serviceDate}? Its weekly pattern will remain unchanged.`;
    if (!window.confirm(message)) return;
    const formData = new FormData();
    formData.set("residencyId", residency.id);
    formData.set("daypartId", daypartId);
    formData.set("serviceDate", serviceDate);
    setEditPending(true);
    const result = await skipDaypartDateAction(formData);
    setEditPending(false);
    setDateActionState(result);
    if (result.status === "success") {
      setModal(null);
      router.refresh();
    }
  }

  async function cancelSelectedHfyRequest() {
    if (!editingEvent || editingEvent.economicsMode !== "hfy_request") return;
    if (!window.confirm(`Cancel the HFY request for ${editingEvent.title} on ${editingEvent.date}? Only this date will return to Client Managed.`)) return;
    const formData = new FormData();
    formData.set("residencyId", residency.id);
    formData.set("shiftId", editingEvent.id);
    formData.set("daypartId", editingEvent.daypartId ?? "");
    formData.set("serviceDate", editingEvent.date);
    setEditPending(true);
    const result = await cancelHfyTalentRequestAction(formData);
    setEditPending(false);
    setDateActionState(result);
    if (result.status === "success") {
      setModal(null);
      router.refresh();
    }
  }

  async function restoreStandingDate() {
    if (modal?.type !== "add" || !activeSuggestion?.sourceDaypartId) return;
    const formData = new FormData();
    formData.set("residencyId", residency.id);
    formData.set("daypartId", activeSuggestion.sourceDaypartId);
    formData.set("serviceDate", modal.date);
    setEditPending(true);
    const result = await clearDaypartDateExceptionAction(formData);
    setEditPending(false);
    setDateActionState(result);
    if (result.status === "success") {
      setModal(null);
      router.refresh();
    }
  }

  const monthHref = (target: string) => {
    if (calendarBasePath !== "/app/calendar") return `${calendarBasePath}?month=${target}`;
    const query = new URLSearchParams({ mode: "hfy", month: target, [residencySelectionParam]: residency.id });
    if (residencySelectionParam === "residency") query.set("view", "operations");
    return `${calendarBasePath}?${query.toString()}`;
  };
  const previousHref = monthHref(shiftMonthKey(monthKey, -1));
  const nextHref = monthHref(shiftMonthKey(monthKey, 1));
  const createDaypartHref = calendarDaypartsHref(residency.id, previewMode, daypartsHref);
  const activeSourceDaypart = activeSuggestion?.sourceDaypartId ? dayparts.find((daypart) => daypart.id === activeSuggestion.sourceDaypartId) : undefined;
  const activeCalendarOnly = activeSourceDaypart?.scheduleMode === "calendar_only";
  const activeStandingRule = modal?.type === "add" && activeSuggestion?.sourceDaypartId
    ? (() => {
      const source = dayparts.find((daypart) => daypart.id === activeSuggestion.sourceDaypartId);
      if (source?.scheduleMode === "calendar_only") return source.suggestedStartMinute !== null && source.suggestedEndMinute !== null
        ? { weekday: weekdayForDate(modal.date), startMinute: source.suggestedStartMinute, endMinute: source.suggestedEndMinute, defaultDjCount: null }
        : undefined;
      return source?.rules.find((rule) => rule.weekday === weekdayForDate(modal.date)) ?? source?.rules[0];
    })()
    : undefined;
  const activeStandingWindow = activeStandingRule
    ? `${formatLocalMinute(activeStandingRule.startMinute)}–${formatLocalMinute(activeStandingRule.endMinute)}`
    : null;
  const oneTimeClientRateMissing = Boolean(previewMode && activeSuggestion?.oneTime && activeSuggestion.type === "dj_artist" && !activeSuggestion.requestHfy
    && (!dollarsToCents(activeSuggestion.clientTalentDefaultRate) || (dollarsToCents(activeSuggestion.clientTalentDefaultRate) ?? 0) <= 0));
  const canEditOneTimeRecord = Boolean(editingEvent && !editingEvent.daypartId && oneTimeEditDraft
    && (editingEvent.recordType === "nonfinancial_occurrence" || editingEventCanManageAssignments));
  const editingOneTimeClientRateMissing = Boolean(editingEvent?.daypartType === "dj_artist" && editingEvent.economicsMode === "client_owned"
    && (!dollarsToCents(oneTimeEditDraft?.clientTalentDefaultRate ?? "") || (dollarsToCents(oneTimeEditDraft?.clientTalentDefaultRate ?? "") ?? 0) <= 0));
  const oneTimeRecordEditor = canEditOneTimeRecord && editingEvent && oneTimeEditDraft ? <section className="one-time-record-editor">
    <div className="quick-program-fields"><div className="field"><label>{editingEvent.daypartType === "house_activity" ? "Activity name" : "Session name"}</label><input value={oneTimeEditDraft.name} onChange={(event) => setOneTimeEditDraft({ ...oneTimeEditDraft, name: event.target.value })} required /></div><div className="field"><label>Room / space</label><input value={oneTimeEditDraft.room} onChange={(event) => setOneTimeEditDraft({ ...oneTimeEditDraft, room: event.target.value })} required /></div></div>
    <div className="quick-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel="One-time slot start time" value={oneTimeEditDraft.start} onChange={(start) => setOneTimeEditDraft({ ...oneTimeEditDraft, start })} stepMinutes={15} required /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel="One-time slot end time" value={oneTimeEditDraft.end} onChange={(end) => setOneTimeEditDraft({ ...oneTimeEditDraft, end })} stepMinutes={15} required /></div><div className="field quick-one-time-color-field"><label>Calendar color</label><details className="quick-color-picker"><summary aria-label="Choose one-time slot color"><span style={{ background: oneTimeEditDraft.color }} aria-hidden="true" /></summary><div className="quick-color-popover"><DaypartColorPicker ariaLabel="One-time slot color presets" value={oneTimeEditDraft.color} onChange={(color) => setOneTimeEditDraft({ ...oneTimeEditDraft, color })} /></div></details></div></div>
    {editingEvent.daypartType === "dj_artist" && editingEvent.economicsMode === "client_owned" ? <div className={`one-time-session-rate ${editingOneTimeClientRateMissing ? "needs-attention" : ""}`}><div><strong>Session artist rate</strong><small>This default applies to every artist in this one-time session. Payment Status overrides still win.</small></div><div className="field"><label>Hourly rate ($/hr) <span>Required</span></label><input type="number" min="0.01" step="0.01" value={oneTimeEditDraft.clientTalentDefaultRate} onChange={(event) => setOneTimeEditDraft({ ...oneTimeEditDraft, clientTalentDefaultRate: event.target.value })} placeholder="Enter hourly rate" required /></div></div> : null}
    {editingEvent.daypartType === "house_activity" ? <div className="quick-program-fields"><div className="field"><label>Program / activity details <span>optional</span></label><input value={oneTimeEditDraft.programDetails} onChange={(event) => setOneTimeEditDraft({ ...oneTimeEditDraft, programDetails: event.target.value })} /></div><div className="field"><label>Host / guest name <span>optional</span></label><input value={oneTimeEditDraft.manualHostName} onChange={(event) => setOneTimeEditDraft({ ...oneTimeEditDraft, manualHostName: event.target.value })} /></div></div> : null}
    <div className="field quick-booking-notes"><label>Notes <span>optional</span></label><textarea value={oneTimeEditDraft.notes} onChange={(event) => setOneTimeEditDraft({ ...oneTimeEditDraft, notes: event.target.value })} /></div>
    <div className="replacement-actions"><span className="privacy-note">{editingEvent.daypartType === "house_activity" ? "House Activity" : "Talent Activity"} · one-time ownership is locked.</span><button className="button" type="button" disabled={editPending || !oneTimeEditDraft.name.trim() || !oneTimeEditDraft.room.trim() || editingOneTimeClientRateMissing} onClick={saveOneTimeRecord}>{editPending ? "Saving…" : "Save session changes"}</button></div>
  </section> : null;

  return (
    <>
      <header className="page-header calendar-page-header calendar-command-bar">
        <div className="calendar-command-primary">
          <div className="calendar-title"><p className="eyebrow">{residency.name}</p><h1>Calendar</h1></div>
          <div className="calendar-month-cluster">
            <div className={`calendar-needs-summary ${needsDjCount ? "attention" : "clear"}`}><strong>{needsDjCount}</strong><span>{needsDjCount === 1 ? "slot needs scheduling" : "slots need scheduling"}</span></div>
            <div className="month-navigation"><Link className="calendar-arrow" aria-label="Previous month" href={previousHref}>←</Link><h2>{monthLabel(monthKey)}</h2><Link className="calendar-arrow" aria-label="Next month" href={nextHref}>→</Link></div>
          </div>
        </div>
        <div className="calendar-command-secondary">
          <div className="calendar-view-filters">
            {residencyOptions?.length ? <form className="calendar-filter-form" method="get"><input name="mode" type="hidden" value="hfy" /><input name="month" type="hidden" value={monthKey} />{residencySelectionParam === "residency" ? <input name="view" type="hidden" value="operations" /> : null}<div className="field calendar-filter"><label htmlFor="calendar-residency-switcher">Residency calendar</label><select id="calendar-residency-switcher" name={residencySelectionParam} defaultValue={residency.id}>{residencyOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div><button className="button secondary" type="submit">View</button></form> : null}
            <div className="field"><label htmlFor="calendar-status-filter">Status</label><select id="calendar-status-filter" value={statusFilter} onChange={(event) => changeStatusFilter(event.target.value as StatusFilter)}><option value="all">All slots</option><option value="needs">Needs scheduling</option><option value="filled">Scheduled</option></select></div>
            <div className="field"><label htmlFor="calendar-daypart-filter">Daypart</label><select id="calendar-daypart-filter" value={daypartFilter} onChange={(event) => changeDaypartFilter(event.target.value)}><option value="all">All Dayparts</option>{dayparts.filter((daypart) => daypart.active).map((daypart) => <option value={daypart.id} key={daypart.id}>{daypart.name}</option>)}</select></div>
          </div>
          <div className="calendar-command-actions">
            {canManage ? <Link className="button secondary calendar-daypart-setup-button" href={createDaypartHref}>+ Create New Daypart</Link> : null}
            {canManage ? <CalendarShareButton residencyId={residency.id} residencyName={residency.name} linkSettings={residency.calendarLinkSettings} dayparts={dayparts.filter((daypart) => daypart.active).map((daypart) => ({ id: daypart.id, name: daypart.name, room: daypart.room, color: daypart.color }))} /> : null}
            <CalendarStatusLegend internal={!previewMode} />
          </div>
        </div>
      </header>
      <MonthCalendar compact monthKey={monthKey} events={filteredEvents} selectedDate={modal?.type === "add" ? modal.date : editingEvent?.date} onDateClick={canManage ? openDate : undefined} onEventClick={canManage ? openEvent : undefined} />

      {modal ? <div className="quick-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setModal(null); }}>
        <section className={`quick-modal ${modal.type === "edit" ? "quick-modal-edit" : ""}`} role="dialog" aria-modal="true" aria-labelledby="quick-modal-title">
          <header className="quick-modal-header">
            <div><p className="eyebrow">{modal.type === "add" ? `${weekdayNames[weekdayForDate(modal.date)]}, ${modal.date}` : editingEvent?.date}</p><h2 id="quick-modal-title">{modal.type === "add" ? addMode === "choose" ? "Choose a room" : addMode === "one-time" ? "Create a one-time activity" : activeSuggestion ? "Schedule Daypart" : `${selectedRoom ?? "Room"} Dayparts` : `Manage · ${editingEvent?.title ?? "Slot"}`}</h2></div>
            <button className="quick-modal-close" type="button" aria-label="Close popup" onClick={() => setModal(null)}>×</button>
          </header>

          <div className="quick-modal-body">
            {modal.type === "add" ? (
              addMode === "choose" ? <div className="quick-room-picker-shell"><div className="quick-picker-intro"><strong>Where is this happening?</strong><small>Choose a room to see only the Dayparts set up for that space.</small></div><div className="quick-room-picker" role="group" aria-label="Choose a room">{roomOptions.map((room) => <button className="quick-room-option" type="button" onClick={() => chooseRoom(room.name)} key={room.name}><span className="quick-room-swatches" aria-hidden="true">{room.colors.slice(0, 4).map((color) => <i style={{ background: color }} key={color} />)}</span><span><strong>{room.name}</strong><small>{room.daypartCount} Daypart{room.daypartCount === 1 ? "" : "s"}</small></span><b aria-hidden="true">→</b></button>)}<button className="quick-room-option other" type="button" onClick={() => chooseOneTime()}><span className="quick-room-other-mark" aria-hidden="true">+</span><span><strong>Other</strong><small>Create a one-time activity in another room or space.</small></span><b aria-hidden="true">→</b></button></div><div className="quick-slot-picker-actions"><button className="button secondary" type="button" onClick={() => setModal(null)}>Cancel</button></div></div> : <form action={formAction} className="quick-book-form">
                <input name="payload" type="hidden" value={payload} />
                {addMode === "daypart" && !directDaypartSelection ? <>
                  <div className="quick-picker-heading"><button className="text-action" type="button" onClick={() => { setSelectedRoom(null); setAddMode("choose"); }}>← All rooms</button><div><span>Room selected</span><strong>{selectedRoom}</strong></div></div>
                  <div className="quick-slot-picker" role="group" aria-label={`Choose a ${selectedRoom} Daypart`}>{selectedRoomSuggestions.map((suggestion) => { const source = dayparts.find((daypart) => daypart.id === suggestion.sourceDaypartId); return <button className={`quick-slot-option ${activeSuggestion?.daypartId === suggestion.daypartId ? "active" : ""}`} style={{ "--daypart-color": suggestion.color } as CSSProperties} type="button" onClick={() => chooseSuggestion(suggestion)} key={suggestion.daypartId}><span><strong>{suggestion.name}</strong><small>{suggestion.exceptionKind === "skip" ? "Skipped on this date" : source?.scheduleMode === "calendar_only" ? `One-off / Occasional · suggested ${formatLocalMinute(clockToMinute(suggestion.start))}–${formatLocalMinute(resolveEndMinute(clockToMinute(suggestion.start), suggestion.end))}` : suggestion.recurringToday ? `${formatLocalMinute(clockToMinute(suggestion.start))}–${formatLocalMinute(resolveEndMinute(clockToMinute(suggestion.start), suggestion.end))}${suggestion.exceptionKind === "override" ? " · custom hours" : ""}` : "Not normally scheduled this day"}</small></span>{suggestion.existing ? <Status value="scheduled" /> : null}</button>; })}<button className="quick-slot-option other" type="button" onClick={() => chooseOneTime(selectedRoom ?? undefined)}><span><strong>Other</strong><small>Create a one-time activity in {selectedRoom}.</small></span><b aria-hidden="true">→</b></button></div>
                  <div className="quick-slot-picker-actions"><button className="button secondary" type="button" onClick={() => setModal(null)}>Cancel</button></div>
                </> : null}

                {activeSuggestion?.exceptionKind === "skip" ? <div className="quick-existing"><p>This occurrence is skipped only on {modal.date}. The standing Daypart is still active.</p><button className="button" type="button" disabled={editPending} onClick={restoreStandingDate}>{editPending ? "Restoring…" : "Restore this date"}</button></div> : activeSuggestion?.existing ? <div className="quick-existing"><p>This slot is already scheduled.</p><button className="button" type="button" onClick={() => openExistingDaypart(activeSuggestion.daypartId, modal.date)}>View scheduled slot</button></div> : activeSuggestion ? <>
                  {activeSuggestion.oneTime ? <div className="field quick-one-time-type"><label>Type</label><div className="daypart-type-options">{!fullProgramming ? <button className={activeSuggestion.type === "dj_artist" ? "active" : ""} type="button" onClick={() => chooseOneTimeType("dj_artist")}><strong>Talent Activity</strong><small>Schedule talent with assignments and the appropriate financial tracking.</small></button> : null}<button className={activeSuggestion.type === "house_activity" ? "active" : ""} type="button" onClick={() => chooseOneTimeType("house_activity")}><strong>House Activity</strong><small>Schedule an activity or host without Assignment, Payout, or Invoice records.</small></button></div>{fullProgramming ? <small>HFY creates and staffs all Talent Activities for Full Programming accounts.</small> : null}</div> : null}
                  {activeSuggestion.oneTime && !activeSuggestion.type ? <div className="card empty daypart-type-gate">Choose Talent Activity or House Activity to continue.</div> : null}
                  {activeSuggestion.oneTime && activeSuggestion.type ? <><div className="quick-one-time-fields"><div className="field"><label>{activeSuggestion.type === "house_activity" ? "Activity name" : "Session name"}</label><input value={activeSuggestion.name} onChange={(event) => updateSuggestion({ name: event.target.value })} placeholder={activeSuggestion.type === "house_activity" ? "Movie Night" : "Poolside Session"} required /></div><div className="field"><label>Room / space</label><input value={activeSuggestion.room} onChange={(event) => updateSuggestion({ room: event.target.value })} placeholder="Pool" required /></div><div className="field quick-one-time-color-field"><label>Calendar color</label><details className="quick-color-picker" ref={oneTimeColorPickerRef}><summary aria-label="Choose one-time slot color" title="Choose calendar color"><span style={{ background: activeSuggestion.color }} aria-hidden="true" /></summary><div className="quick-color-popover"><DaypartColorPicker ariaLabel="One-time slot color presets" value={activeSuggestion.color} onChange={(color) => { updateSuggestion({ color }); oneTimeColorPickerRef.current?.removeAttribute("open"); }} /><small>Hue runs left to right; intensity runs dark to light.</small></div></details></div></div>{activeSuggestion.type === "dj_artist" && previewMode ? <div className={`one-time-session-rate ${oneTimeClientRateMissing ? "needs-attention" : ""}`}><div><strong>Session artist rate</strong><small>Used for every artist you assign to this one-time session. You can override an individual payout later.</small></div><div className="field"><label>Hourly rate ($/hr) <span>Required</span></label><input type="number" min="0.01" step="0.01" value={activeSuggestion.clientTalentDefaultRate} onChange={(event) => updateSuggestion({ clientTalentDefaultRate: event.target.value })} placeholder="Enter hourly rate" required /></div></div> : null}</> : null}
                  {!activeSuggestion.oneTime ? <section className="quick-selected-daypart quick-selected-daypart-editable" style={{ "--daypart-color": activeSuggestion.color } as CSSProperties}><div className="quick-selected-daypart-summary"><span>Selected Daypart</span><strong>{activeSuggestion.name}</strong><small>{activeSuggestion.room}</small></div><div className="quick-selected-window"><div className="quick-selected-window-heading"><span>Hours for this date</span>{activeSuggestion.exceptionKind === "override" ? <em>Custom</em> : null}</div>{activeStandingWindow ? <small>{activeCalendarOnly ? "Suggested" : "Recommended"} window: {activeStandingWindow}</small> : null}<div className="quick-inline-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel={`${activeSuggestion.name} date-specific start time`} value={activeSuggestion.start} onChange={(value) => updateShiftTime("start", value)} stepMinutes={15} required /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel={`${activeSuggestion.name} date-specific end time`} value={activeSuggestion.end} onChange={(value) => updateShiftTime("end", value)} stepMinutes={15} required /></div></div></div>{activeCalendarOnly ? <div className="date-exception-actions"><small>This One-off / Occasional Daypart will be added only to {modal.date}.</small></div> : <div className="date-exception-actions"><small>Any change applies only to {modal.date}.</small><button className="button secondary" type="button" disabled={editPending} onClick={saveDateOverride}>{editPending ? "Saving…" : "Save custom hours"}</button>{activeSuggestion.exceptionKind === "override" ? <button className="button secondary" type="button" disabled={editPending} onClick={restoreStandingDate}>Use standing hours</button> : null}<button className="remove-dj-button" type="button" disabled={editPending} onClick={skipSelectedDate}>Skip this date</button></div>}</section> : activeSuggestion.type ? <div className="quick-time-fields"><div className="field"><label>Slot starts</label><TimeSelect ariaLabel="One-time slot start time" value={activeSuggestion.start} onChange={(value) => updateShiftTime("start", value)} stepMinutes={15} required /></div><div className="field"><label>Slot ends</label><TimeSelect ariaLabel="One-time slot end time" value={activeSuggestion.end} onChange={(value) => updateShiftTime("end", value)} stepMinutes={15} required /></div></div> : null}

                  {activeSuggestion.type === "house_activity" ? <div className="quick-program-fields"><div className="field"><label>Program / activity details <span>optional</span></label><input value={activeSuggestion.programDetails} onChange={(event) => updateSuggestion({ programDetails: event.target.value })} placeholder="Movie title, theme, or event detail" /></div><div className="field"><label>Host / guest name <span>optional</span></label><input value={activeSuggestion.manualHostName} onChange={(event) => updateSuggestion({ manualHostName: event.target.value })} placeholder="Employee or outside host" /><small>Typed names remain informational and never become Artist, Assignment, Payout, or Invoice records.</small></div></div> : null}

                  {activeSuggestion.type === "dj_artist" ? clientStandingHfy ? <div className="standing-hfy-calendar-notice" style={{ "--hfy-booked-color": HFY_BOOKED_COLOR } as CSSProperties}><span>HFY-managed Talent Activity</span><strong>HFY handles this occurrence automatically.</strong><small>No client artist assignment or per-date request is needed. HFY manages talent staffing and talent billing.</small></div> : <><div className="quick-assignment-heading"><div><strong>{activeSuggestion.requestHfy ? "HFY requested" : activeSuggestion.slots.length ? "Your artists" : "Choose who handles this date"}</strong><small>{previewMode ? "Add one of your own artists, or ask HFY to staff this entire date." : "Only HFY-owned artists approved for this Residency appear here."}</small></div></div>
                  {activeSuggestion.requestHfy ? <div className="request-hfy-selection"><div><span>HFY system option</span><strong>Request HFY</strong><small>Creates a pending request without assigning an artist. HFY controls both rates after fulfillment.</small></div><button type="button" onClick={() => updateSuggestion({ requestHfy: false })}>Choose your own artist instead</button></div> : null}
                  {!activeSuggestion.slots.length && !activeSuggestion.requestHfy ? <div className={`client-assignment-choices ${previewMode && !clientArtistFlow ? "equal-options" : ""}`}><ArtistSearchPicker key={`${activeSuggestion.daypartId}-${artistPickerKey}`} artists={artistOptions} excludedIds={[]} label="Add your artist" initiallyOpen={false} collapsedEyebrow={previewMode ? "Client managed" : undefined} collapsedDescription={previewMode ? "Choose one of your Residency’s artists and manage the rate yourself." : undefined} onOpenChange={(open) => { if (previewMode) setClientArtistFlow(open); }} onCreateArtist={canCreateCalendarArtist ? createCalendarArtist : undefined} onSelect={addArtist} />{previewMode && !clientArtistFlow ? <button className="request-hfy-option" type="button" onClick={requestHfyForSuggestion}><span>HFY system option</span><strong>Request HFY</strong><small>Send this entire date to HFY without choosing an artist or seeing HFY rates.</small></button> : null}{previewMode && clientArtistFlow ? <button className="button secondary" type="button" onClick={() => { setClientArtistFlow(false); setArtistPickerKey((value) => value + 1); }}>Back to handling options</button> : null}</div> : null}
                  <div className="quick-assignment-list">{activeSuggestion.slots.map((slot, slotIndex) => {
                    const artist = availableTalent.find((item) => item.id === slot.talentId);
                    return <div className={`quick-assignment-card ${slot.confirmed ? "confirmed" : "draft"}`} key={slot.id}>
                      <div className="quick-assignment-card-heading"><div><span>Talent {slotIndex + 1}</span><strong>{artist?.stageName ?? "Artist"}</strong><small>{slot.confirmed ? "✓ Added" : "Finish this artist"}</small></div><div className="quick-card-actions">{slot.confirmed ? <button type="button" onClick={() => updateSlot(slotIndex, { confirmed: false })}>Edit</button> : null}<button type="button" onClick={() => removeArtist(slot.id)}>Remove</button></div></div>
                      {!slot.confirmed ? <div className="quick-assignment-time-intro"><div><strong>Choose appearance time</strong><small>Recommended: {formatLocalMinute(clockToMinute(activeSuggestion.start))}–{formatLocalMinute(resolveEndMinute(clockToMinute(activeSuggestion.start), activeSuggestion.end))}</small></div><button type="button" onClick={() => updateSlot(slotIndex, { start: activeSuggestion.start, end: activeSuggestion.end })}>Use recommended</button></div> : null}
                      <div className="quick-dj-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel={`${artist?.stageName ?? `Talent ${slotIndex + 1}`} start time`} value={slot.start} disabled={slot.confirmed} onChange={(value) => updateSlot(slotIndex, { start: value })} stepMinutes={15} required /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel={`${artist?.stageName ?? `Talent ${slotIndex + 1}`} end time`} value={slot.end} disabled={slot.confirmed} onChange={(value) => updateSlot(slotIndex, { end: value })} stepMinutes={15} required /></div></div>
                      {!slot.confirmed ? <button className="button quick-confirm-dj" type="button" disabled={draftTimeInvalid} onClick={() => confirmArtist(slot.id)}>Add talent</button> : null}
                    </div>;
                  })}</div>
                  {activeSuggestion.slots.length && !activeSuggestion.requestHfy && !activeSuggestion.slots.some((slot) => !slot.confirmed) ? <ArtistSearchPicker artists={artistOptions} excludedIds={activeSuggestion.slots.map((slot) => slot.talentId)} label="Add another registered artist" onCreateArtist={canCreateCalendarArtist ? createCalendarArtist : undefined} onSelect={addArtist} /> : null}
                  {assignmentWarning ? <p className={assignmentWarning.startsWith("Finish adding") ? "draft-notice" : "error"} aria-live="polite">{assignmentWarning}</p> : null}

                  {!previewMode && activeSuggestion.billingMode === "billed_by_hfy" ? <details className="quick-more"><summary>Pay and billing options</summary><div className="quick-more-fields"><div className="field"><label>Client rate override</label><SensitiveInput type="number" min="0" step="0.01" value={activeSuggestion.clientRateOverride} onChange={(event) => updateSuggestion({ clientRateOverride: event.target.value })} placeholder={`Default $${((residency.clientHourlyRateCents ?? 0) / 100).toFixed(0)}/hr`} /></div>{activeSuggestion.slots.map((slot, slotIndex) => <div className="quick-slot-details" key={slot.id}><strong>Talent {slotIndex + 1}</strong><div className="field"><label>Compensation</label><select value={slot.compensationType} onChange={(event) => updateSlot(slotIndex, { compensationType: event.target.value as SlotDraft["compensationType"] })}><option value="hourly">Hourly</option><option value="fixed">Fixed fee</option><option value="na">N/A</option></select></div><div className="field"><label>{slot.compensationType === "fixed" ? "Fixed fee" : "Talent rate override"}</label><SensitiveInput type="number" min="0" step="0.01" value={slot.compensationType === "fixed" ? slot.fixedFee : slot.rateOverride} onChange={(event) => updateSlot(slotIndex, slot.compensationType === "fixed" ? { fixedFee: event.target.value } : { rateOverride: event.target.value })} placeholder={slot.compensationType === "hourly" ? `${activeSuggestion.defaultTalentRateCents === null ? "Residency" : "Daypart"} default $${((activeSuggestion.defaultTalentRateCents ?? residency.defaultTalentRateCents ?? 0) / 100).toFixed(0)}/hr` : undefined} /></div></div>)}</div></details> : null}
                  <div className="field quick-booking-notes"><label>Notes <span>optional</span></label><textarea value={activeSuggestion.notes} onChange={(event) => updateSuggestion({ notes: event.target.value })} placeholder="Anything the team should know about this booking" /></div></> : null}
                </> : null}

                {state.status === "error" ? <p className="error" aria-live="polite">{state.message}</p> : null}
                {dateActionState.status === "error" ? <p className="error" aria-live="polite">{dateActionState.message}</p> : null}
                {activeSuggestion && !activeSuggestion.existing && activeSuggestion.exceptionKind !== "skip" ? clientStandingHfy ? <footer className="quick-modal-footer"><button className="button secondary" type="button" onClick={returnToAddPicker}>Back</button><span>No action needed for this date.</span><button className="button" type="button" onClick={() => setModal(null)}>Done</button></footer> : <footer className="quick-modal-footer"><button className="button secondary" type="button" onClick={returnToAddPicker}>Back</button><span>{oneTimeClientRateMissing ? "Enter the session artist rate to continue." : activeSuggestion.type ? "Ready to schedule?" : "Choose an activity type to continue."}</span><button className="button secondary" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button" type="submit" disabled={pending || !activeSuggestion.type || !activeSuggestion.name.trim() || !activeSuggestion.room.trim() || oneTimeClientRateMissing || Boolean(assignmentWarning) || Boolean(previewMode && activeSuggestion.type === "dj_artist" && !activeSuggestion.requestHfy && !activeSuggestion.slots.length)}>{pending ? "Saving…" : activeSuggestion.requestHfy ? "Send Request to HFY" : activeSuggestion.billingMode === "tracking_only" && !activeSuggestion.slots.length ? "Mark scheduled" : `Save ${activeSuggestion.name || "Daypart"}`}</button></footer> : activeSuggestion ? <footer className="quick-modal-footer"><button className="button secondary" type="button" onClick={returnToAddPicker}>Back</button><button className="button secondary" type="button" onClick={() => setModal(null)}>Done</button></footer> : null}
              </form>
            ) : editingEvent ? editingEvent.recordType === "nonfinancial_occurrence" ? <>
              <div className="quick-time-summary"><span>{editingEvent.title}</span><strong>{editingEvent.time}</strong></div>
              {editingEvent.daypartId ? <div className="quick-house-activity"><strong>Tracking-only Daypart scheduled</strong><p>No payout or invoice records were created.</p>{editingEvent.programDetails ? <p><strong>Program:</strong> {editingEvent.programDetails}</p> : null}{editingEvent.manualHostName ? <p><strong>Host:</strong> {editingEvent.manualHostName}</p> : null}</div> : oneTimeRecordEditor}
              {editingEvent.assignments.length ? <div className="quick-reschedule-list">{editingEvent.assignments.map((assignment, index) => <div className="quick-reschedule-row" key={assignment.id}><div className="quick-existing-dj"><span>DJ {index + 1}</span><strong>{assignment.talentName}</strong><small>{formatLocalMinute(resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, assignment.startClock, assignment.endClock).startMinute)}–{formatLocalMinute(resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, assignment.startClock, assignment.endClock).endMinute)}</small></div></div>)}</div> : null}
              {dateActionState.status === "error" ? <p className="error" aria-live="polite">{dateActionState.message}</p> : null}
              <footer className="quick-modal-footer">{editingEvent.daypartId ? <button className="button danger-button" type="button" disabled={editPending} onClick={skipSelectedDate}>Skip this date</button> : <button className="button danger-button" type="button" disabled={editPending} onClick={deleteExistingOccurrence}>Delete activity</button>}<span>{editingEvent.daypartId ? "The standing Daypart remains active." : "One-time activity"}</span><button className="button secondary" type="button" onClick={() => setModal(null)}>Done</button></footer>
            </> : <>
              <div className="quick-time-summary"><span>{editingEvent.title}</span><strong>{editingEvent.time}</strong></div>
              {!editingEvent.daypartId && editingEvent.economicsMode !== "hfy_request" ? oneTimeRecordEditor : null}
              {editingEvent.programDetails || editingEvent.manualHostName ? <div className="quick-program-fields">{editingEvent.programDetails ? <div><span>Program / activity</span><strong>{editingEvent.programDetails}</strong></div> : null}{editingEvent.manualHostName ? <div><span>Host / guest</span><strong>{editingEvent.manualHostName}</strong></div> : null}</div> : null}
              {pendingHfyRequest && editingEvent.hfyRequestId ? <section className="replacement-editor new-assignment-editor hfy-request-calendar-editor"><div className="replacement-step"><span>1</span><div><strong>Schedule the requested shift</strong><small>Choose one artist or split the full service window. Residency rates apply automatically.</small></div></div><HfyRequestFulfillment requestId={editingEvent.hfyRequestId} shiftName={editingEvent.title} shiftStartMinute={editingEvent.shiftStartMinute} shiftEndMinute={editingEvent.shiftEndMinute} artists={requestTalent.map((artist) => ({ id: artist.id, stageName: artist.stageName, homeMarket: artist.homeMarket }))} ratesConfigured={residencyTalentRateConfigured && residency.clientHourlyRateCents > 0} onSuccess={() => { setModal(null); router.refresh(); }} /></section> : editingEventCanManageAssignments ? <div className="quick-existing-toolbar"><p className="quick-guidance">Add, change, or remove one DJ at a time. Every change requires explicit hours{previewMode ? "." : " because those hours determine pay."}</p><button className="button" type="button" disabled={editPending || Boolean(newAssignmentDraft) || (!previewMode && !residencyTalentRateConfigured)} onClick={startAddingAssignment}>+ Add another DJ</button></div> : <div className="request-hfy-selection"><div><span>{editingEvent.economicsMode === "hfy_request" ? "Pending request" : editingEvent.economicsMode === "client_owned" ? "Client-managed slot" : "HFY-managed slot"}</span><strong>{editingEvent.economicsMode === "hfy_request" ? "Request HFY is awaiting fulfillment" : "This slot is read-only here"}</strong><small>{editingEvent.economicsMode === "client_owned" ? "The client controls its artist assignments and private rates." : previewMode ? "HFY controls staffing and both HFY rates. Your Invoice will show the resulting billed total." : "This slot is not editable here."}</small></div></div>}
              {editingEventCanManageAssignments && !previewMode && !residencyTalentRateConfigured ? <p className="error" aria-live="polite">{MISSING_RESIDENCY_TALENT_RATE_MESSAGE}</p> : null}
              {newAssignmentDraft ? <section className="replacement-editor new-assignment-editor">
                <div className="replacement-step"><span>1</span><div><strong>Choose the DJ</strong><small>Only artists approved for this Residency appear here.</small></div></div>
                {newAssignmentDraft.talentId ? <div className="replacement-selected"><div><span>Selected DJ</span><strong>{availableTalent.find((item) => item.id === newAssignmentDraft.talentId)?.stageName}</strong></div><button type="button" onClick={() => setNewAssignmentDraft({ ...newAssignmentDraft, talentId: "" })}>Choose someone else</button></div> : <ArtistSearchPicker label="Choose DJ" artists={artistOptions} excludedIds={editingEvent.assignments.map((item) => item.talentId).filter((id): id is string => Boolean(id))} onCreateArtist={canCreateCalendarArtist ? createCalendarArtist : undefined} onSelect={(talentId) => setNewAssignmentDraft({ ...newAssignmentDraft, talentId })} />}
                <div className="replacement-step"><span>2</span><div><strong>Set their hours</strong><small>The service window may use one DJ or several, but their times cannot overlap.</small></div></div>
                <div className="quick-dj-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel="New DJ start time" value={newAssignmentDraft.start} onChange={(value) => setNewAssignmentDraft({ ...newAssignmentDraft, start: value })} stepMinutes={15} /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel="New DJ end time" value={newAssignmentDraft.end} onChange={(value) => setNewAssignmentDraft({ ...newAssignmentDraft, end: value })} stepMinutes={15} /></div></div>
                {previewMode ? null : <details className="quick-more"><summary>Pay options</summary><div className="quick-more-fields"><div className="field"><label>Compensation</label><select value={newAssignmentDraft.compensationType} onChange={(event) => setNewAssignmentDraft({ ...newAssignmentDraft, compensationType: event.target.value as SlotDraft["compensationType"] })}><option value="hourly">Hourly</option><option value="fixed">Fixed fee</option><option value="na">N/A</option></select></div><div className="field"><label>{newAssignmentDraft.compensationType === "fixed" ? "Fixed fee" : "Talent rate override"}</label><SensitiveInput type="number" min="0" step="0.01" value={newAssignmentDraft.compensationType === "fixed" ? newAssignmentDraft.fixedFee : newAssignmentDraft.rateOverride} onChange={(event) => setNewAssignmentDraft({ ...newAssignmentDraft, ...(newAssignmentDraft.compensationType === "fixed" ? { fixedFee: event.target.value } : { rateOverride: event.target.value }) })} placeholder={newAssignmentDraft.compensationType === "hourly" ? "Uses Daypart or Residency default" : undefined} /></div></div></details>}
                {newAssignmentWarning ? <p className="error" aria-live="polite">{newAssignmentWarning}</p> : null}
                <div className="replacement-actions"><button className="button secondary" type="button" onClick={() => setNewAssignmentDraft(null)}>Cancel</button><button className="button" type="button" disabled={editPending || !newAssignmentDraft.talentId || !newAssignmentDraft.start || !newAssignmentDraft.end || Boolean(newAssignmentWarning)} onClick={saveNewAssignment}>{editPending ? "Saving…" : "Add DJ to Shift"}</button></div>
              </section> : null}
              <div className="quick-reschedule-list">{editingEvent.assignments.map((assignment, index) => {
                const changing = replacementDraft?.assignmentId === assignment.id;
                const replacement = changing ? availableTalent.find((item) => item.id === replacementDraft.talentId) : undefined;
                return <div className={`quick-reschedule-row ${changing ? "changing" : ""}`} key={assignment.id}>
                  <div className="quick-existing-dj"><span>DJ {index + 1}</span><strong>{assignment.talentName || assignment.guestName || "Open slot"}</strong><small>{formatLocalMinute(resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, assignment.startClock, assignment.endClock).startMinute)}–{formatLocalMinute(resolveAssignmentMinutes(editingEvent.shiftStartMinute, editingEvent.shiftEndMinute, assignment.startClock, assignment.endClock).endMinute)}</small></div>
                  {editingEventCanManageAssignments ? <div className="quick-existing-actions"><button className="button secondary" type="button" disabled={editPending} onClick={() => { setNewAssignmentDraft(null); setEditState(initialActionState); setReplacementDraft(replacementDraftFromAssignment(assignment)); }}>Change DJ</button><button className="remove-dj-button" type="button" disabled={editPending} onClick={() => removeExistingAssignment(assignment.id)}>Remove DJ</button></div> : null}
                  {changing && replacementDraft ? <div className="replacement-editor">
                    <div className="replacement-step"><span>1</span><div><strong>Choose the replacement DJ</strong><small>The current DJ remains unchanged until you save.</small></div></div>
                    {replacement ? <div className="replacement-selected"><div><span>Replacement</span><strong>{replacement.stageName}</strong></div><button type="button" onClick={() => setReplacementDraft({ ...replacementDraft, talentId: "" })}>Choose someone else</button></div> : <ArtistSearchPicker label="Choose replacement" artists={artistOptions} excludedIds={editingEvent.assignments.map((item) => item.talentId).filter((id): id is string => Boolean(id))} onCreateArtist={canCreateCalendarArtist ? createCalendarArtist : undefined} onSelect={(talentId) => setReplacementDraft({ ...replacementDraft, talentId })} />}
                    <div className="replacement-step"><span>2</span><div><strong>Confirm their hours</strong><small>{previewMode ? "Set the exact time this DJ will play." : "These hours determine this DJ's payout."}</small></div></div>
                    <div className="quick-dj-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel="Replacement DJ start time" value={replacementDraft.start} onChange={(value) => setReplacementDraft({ ...replacementDraft, start: value })} stepMinutes={15} /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel="Replacement DJ end time" value={replacementDraft.end} onChange={(value) => setReplacementDraft({ ...replacementDraft, end: value })} stepMinutes={15} /></div></div>
                    {replacementWarning ? <p className="error" aria-live="polite">{replacementWarning}</p> : null}
                    <div className="replacement-actions"><button className="button secondary" type="button" onClick={() => setReplacementDraft(null)}>Cancel change</button><button className="button" type="button" disabled={editPending || !replacementDraft.talentId || !replacementDraft.start || !replacementDraft.end || Boolean(replacementWarning)} onClick={saveReplacement}>{editPending ? "Saving…" : "Save DJ change"}</button></div>
                  </div> : null}
                </div>;
              })}</div>
              {editState.status !== "idle" ? <p className={editState.status === "error" ? "error" : "success"} aria-live="polite">{editState.message}</p> : null}
              {dateActionState.status === "error" ? <p className="error" aria-live="polite">{dateActionState.message}</p> : null}
              {!editingEvent.assignments.length ? <div className="empty quick-empty">This Shift has no Assignment slots to edit.</div> : null}
              <footer className="quick-modal-footer">{pendingHfyRequest ? <span>Pending Request HFY for {editingEvent.date}.</span> : editingEventCanManageAssignments ? <><button className="button danger-button" type="button" disabled={editPending} onClick={deleteExistingShift}>Delete Shift</button>{editingEvent.daypartId ? <button className="button danger-button" type="button" disabled={editPending} onClick={skipSelectedDate}>Skip this date</button> : null}<span>Deletion is blocked once financial history is finalized.</span></> : fullProgramming && previewMode && editingEvent.daypartId ? <><button className="button danger-button" type="button" disabled={editPending} onClick={skipSelectedDate}>Skip this date</button><span>HFY will remove staffing for this date; the standing Daypart remains active.</span></> : previewMode && !fullProgramming && editingEvent.economicsMode === "hfy_request" ? <><button className="button danger-button" type="button" disabled={editPending} onClick={cancelSelectedHfyRequest}>{editPending ? "Cancelling…" : "Cancel Request HFY"}</button><span>Only {editingEvent.date} will return to Client Managed.</span></> : <span>{fullProgramming && previewMode ? "HFY manages talent staffing for this activity." : "Ownership controls are enforced for this slot."}</span>}<button className="button secondary" type="button" onClick={() => setModal(null)}>Done</button></footer>
            </> : <div className="empty quick-empty">This slot is no longer available.</div>}
          </div>
        </section>
      </div> : null}
    </>
  );
}
