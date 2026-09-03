"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import { addCalendarAssignmentAction, bookResidencyDateAction, cancelHfyTalentRequestAction, clearDaypartDateExceptionAction, createResidencyRoomAction, deleteCalendarShiftAction, deleteOneTimeOccurrenceAction, removeCalendarAssignmentAction, rescheduleAssignmentAction, saveDaypartDateOverrideAction, skipDaypartDateAction, updateOneTimeOccurrenceAction, updateOneTimeShiftAction, type CreateRoomActionState, type ResidencyActionState } from "@/app/app/actions";
import { HfyRequestFulfillment } from "@/app/app/hfy-request-fulfillment";
import { createClientOwnedArtistAction } from "@/app/residency/actions";
import { ArtistSearchPicker, type CreateArtistResult } from "@/components/artist-search-picker";
import { CalendarShareButton } from "@/components/calendar-share-button";
import { CalendarStatusLegend } from "@/components/calendar-status-legend";
import { DaypartColorPicker } from "@/components/daypart-color-picker";
import { RoomHuePicker } from "@/components/room-hue-picker";
import { RoomCombobox, type RoomComboboxOption } from "@/components/room-combobox";
import { Status } from "@/components/format";
import { SensitiveInput } from "@/components/privacy-mode";
import { TimeSelect } from "@/components/time-select";
import { MonthCalendar, type MonthCalendarEvent } from "@/components/month-calendar";
import { WeekCalendar } from "@/components/week-calendar";
import { HFY_BOOKED_COLOR, clockToMinute, formatLocalMinute, hasOverlappingAssignmentMinutes, minuteToClock, resolveAssignmentMinutes, resolveEndMinute, roomColor, roomDaypartColor, roomHueForIndex, weekdayForDate, weekdayNames, type DaypartDateException, type DaypartScheduleMode, type RoomHue } from "@/domain/dayparts";
import { monthKeyForDate, monthLabel, normalizeWeekStart, shiftDateKey, shiftMonthKey, weekLabel, type CalendarViewMode } from "@/lib/calendar";
import type { DaypartBillingMode, DaypartType } from "@/domain/dayparts";
import type { PublicCalendarLinkSettings } from "@/data/internal";
import { MISSING_RESIDENCY_TALENT_RATE_MESSAGE } from "@/domain/residency-rates";
import { replacementDraftFromAssignment } from "@/domain/assignment-editing";
import { TALENT_GENRES } from "@/domain/talent-genres";
import type { ResidencyRoom } from "@/services/rooms";

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
  calendarView?: CalendarViewMode;
  weekStart?: string;
  events: ResidencyEvent[];
  rooms: ResidencyRoom[];
  dayparts: Array<{
    id: string;
    roomId: string | null;
    roomHue: RoomHue | null;
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
  canManage?: boolean;
};

type SlotDraft = { id: string; talentId: string; start: string; end: string; confirmed: boolean; compensationType: "hourly" | "fixed" | "na"; rateOverride: string; fixedFee: string };
type CreateMode = "standing_weekly" | "calendar_only" | "one_time";
type SuggestionDraft = { daypartId: string; sourceDaypartId: string | null; roomId: string | null; oneTime: boolean; createMode: CreateMode | null; repeatWeekdays: number[]; recurringToday: boolean; exceptionKind: "skip" | "override" | null; name: string; room: string; color: string; type: DaypartType | null; billingMode: DaypartBillingMode | null; defaultTalentRateCents: number | null; defaultDjCount: number | null; existing: boolean; start: string; end: string; clientTalentDefaultRate: string; clientRateOverride: string; notes: string; programDetails: string; manualHostName: string; requestHfy: boolean; slots: SlotDraft[] };
type ReplacementDraft = { assignmentId: string; talentId: string; start: string; end: string };
type OneTimeEditDraft = { name: string; roomId: string | null; room: string; roomHue: RoomHue; createRoom: boolean; color: string; start: string; end: string; clientTalentDefaultRate: string; notes: string; programDetails: string; manualHostName: string };
type ModalState = { type: "add"; date: string } | { type: "edit"; eventId: string } | null;
type BatchScheduleState = { daypartId: string; dates: string[]; completedDates: string[]; expandedDate: string | null };
type StatusFilter = "needs" | "all" | "filled";
type AddMode = "room" | "activity" | "new-type" | "new-repeat" | "daypart" | "one-time";
const initialActionState: ResidencyActionState = { status: "idle", message: "" };

export function pendingBatchScheduleDates(
  events: readonly Pick<ResidencyEvent, "date" | "daypartId" | "projected">[],
  daypartId: string,
): string[] {
  return [...new Set(events
    .filter((event) => event.projected && event.daypartId === daypartId)
    .map((event) => event.date))]
    .sort((left, right) => left.localeCompare(right));
}

function formatBatchScheduleDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(2020, month - 1, day)));
}

function dollarsToCents(value: string): number | null {
  if (!value.trim()) return null;
  const dollars = Number(value);
  return Number.isFinite(dollars) && dollars >= 0 ? Math.round(dollars * 100) : null;
}

function emptySlot(talentId: string, start: string, end: string): SlotDraft {
  return { id: crypto.randomUUID(), talentId, start, end, confirmed: false, compensationType: "hourly", rateOverride: "", fixedFee: "" };
}

function oneTimeDraftFromEvent(event: ResidencyEvent, rooms: ResidencyRoom[]): OneTimeEditDraft {
  const room = rooms.find((item) => item.name.toLocaleLowerCase() === (event.room ?? "").trim().toLocaleLowerCase());
  return {
    name: event.title,
    roomId: room?.id ?? null,
    room: event.room ?? "",
    roomHue: room?.hue ?? roomHueForIndex(Math.max(-1, ...rooms.map((item) => item.sortOrder)) + 1),
    createRoom: false,
    color: event.editableColor ?? event.color ?? "#7A65D1",
    start: minuteToClock(event.shiftStartMinute),
    end: minuteToClock(event.shiftEndMinute),
    clientTalentDefaultRate: event.clientTalentDefaultRateCents === null || event.clientTalentDefaultRateCents === undefined ? "" : (event.clientTalentDefaultRateCents / 100).toFixed(2),
    notes: event.notes ?? "",
    programDetails: event.programDetails,
    manualHostName: event.manualHostName,
  };
}

function SchedulingActivityDetailsRow({
  name,
  roomId,
  room,
  createRoom,
  rooms,
  color,
  start,
  end,
  namePlaceholder,
  ariaPrefix,
  colorPickerRef,
  onNameChange,
  onRoomChange,
  onRoomSelect,
  onRoomCreate,
  onColorChange,
  onStartChange,
  onEndChange,
}: {
  name: string;
  roomId: string | null;
  room: string;
  createRoom: boolean;
  rooms: RoomComboboxOption[];
  color: string;
  start: string;
  end: string;
  namePlaceholder?: string;
  ariaPrefix: string;
  colorPickerRef?: RefObject<HTMLDetailsElement | null>;
  onNameChange: (value: string) => void;
  onRoomChange: (value: string) => void;
  onRoomSelect: (room: RoomComboboxOption) => void;
  onRoomCreate: (name: string) => void;
  onColorChange: (value: string) => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  return <div className="quick-activity-details-row">
    <div className="field quick-one-time-color-field"><label>Color</label><details className="quick-color-picker" ref={colorPickerRef}><summary aria-label={`Choose ${ariaPrefix} color`} title="Choose calendar color"><span style={{ background: color }} aria-hidden="true" /></summary><div className="quick-color-popover"><DaypartColorPicker ariaLabel={`${ariaPrefix} color presets`} value={color} onChange={onColorChange} /><small>Hue runs left to right; intensity runs dark to light.</small></div></details></div>
    <div className="field"><label>Session name</label><input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder={namePlaceholder} required /></div>
    <div className="field"><label>Room / space</label><RoomCombobox rooms={rooms} value={room} selectedRoomId={roomId} creationConfirmed={createRoom} ariaLabel={`${ariaPrefix} room or space`} onChange={onRoomChange} onSelect={onRoomSelect} onCreate={onRoomCreate} /></div>
    <div className="field quick-activity-time-field"><label>Slot time</label><div className="quick-activity-time-controls"><TimeSelect ariaLabel={`${ariaPrefix} start time`} value={start} onChange={onStartChange} stepMinutes={15} required /><span aria-hidden="true">to</span><TimeSelect ariaLabel={`${ariaPrefix} end time`} value={end} onChange={onEndChange} stepMinutes={15} required /></div></div>
  </div>;
}

export function ResidencyCalendar({ residency, monthKey, calendarView = "month", weekStart, events, rooms, dayparts, talent, requestTalent = [], dateExceptions, residencyOptions, residencySelectionParam = "residency", initialEventId, previewMode = false, fullProgramming = false, calendarBasePath = "/app/calendar", canManage = true }: ResidencyCalendarProps) {
  const router = useRouter();
  const initialEditingEvent = initialEventId ? events.find((event) => event.id === initialEventId && !event.projected) : undefined;
  const [modal, setModal] = useState<ModalState>(() => initialEditingEvent ? { type: "edit", eventId: initialEditingEvent.id } : null);
  const [suggestions, setSuggestions] = useState<SuggestionDraft[]>([]);
  const [activeDaypartId, setActiveDaypartId] = useState("");
  const [addMode, setAddMode] = useState<AddMode>("room");
  const [createdRooms, setCreatedRooms] = useState<ResidencyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomHue, setNewRoomHue] = useState<RoomHue>(() => roomHueForIndex(Math.max(-1, ...rooms.map((room) => room.sortOrder)) + 1));
  const [newRoomPromptOpen, setNewRoomPromptOpen] = useState(false);
  const [roomCreateState, setRoomCreateState] = useState<CreateRoomActionState>(initialActionState);
  const [roomCreating, setRoomCreating] = useState(false);
  const [clientArtistFlow, setClientArtistFlow] = useState(false);
  const [artistPickerKey, setArtistPickerKey] = useState(0);
  const [replacementDraft, setReplacementDraft] = useState<ReplacementDraft | null>(null);
  const [newAssignmentDraft, setNewAssignmentDraft] = useState<SlotDraft | null>(null);
  const [oneTimeEditDraft, setOneTimeEditDraft] = useState<OneTimeEditDraft | null>(() => initialEditingEvent && !initialEditingEvent.daypartId ? oneTimeDraftFromEvent(initialEditingEvent, rooms) : null);
  const [editState, setEditState] = useState<ResidencyActionState>(initialActionState);
  const [editPending, setEditPending] = useState(false);
  const [dateActionState, setDateActionState] = useState<ResidencyActionState>(initialActionState);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [daypartFilter, setDaypartFilter] = useState("all");
  const [batchSchedule, setBatchSchedule] = useState<BatchScheduleState | null>(null);
  const [bookingFeedbackDate, setBookingFeedbackDate] = useState<string | null>(null);
  const [addedTalent, setAddedTalent] = useState<typeof talent>([]);
  const submitBooking = async (previous: ResidencyActionState, formData: FormData) => {
    const submittedDate = batchSchedule?.expandedDate ?? (modal?.type === "add" ? modal.date : null);
    setBookingFeedbackDate(submittedDate);
    const result = await bookResidencyDateAction(previous, formData);
    if (result.status === "success") {
      if (batchSchedule?.expandedDate) {
        const completedDates = [...new Set([...batchSchedule.completedDates, batchSchedule.expandedDate])];
        const nextDate = batchSchedule.dates.find((date) => !completedDates.includes(date)) ?? null;
        setBatchSchedule({ ...batchSchedule, completedDates, expandedDate: nextDate });
        if (nextDate) prepareDateForScheduling(nextDate, batchSchedule.daypartId, false);
        else {
          setSuggestions([]);
          setActiveDaypartId("");
        }
        router.refresh();
      } else {
        setModal(null);
      }
    }
    return result;
  };
  const [state, formAction, pending] = useActionState(submitBooking, initialActionState);

  const modalOpen = modal !== null;
  const batchOpen = batchSchedule !== null;
  const availableRooms = [...new Map([...rooms, ...createdRooms].map((room) => [room.id, room])).values()];
  const defaultNewRoomHue = roomHueForIndex(Math.max(-1, ...availableRooms.map((room) => room.sortOrder)) + 1);
  useEffect(() => {
    if (!modalOpen && !batchOpen) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (batchOpen) {
        setBatchSchedule(null);
        router.refresh();
      } else {
        setModal(null);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [batchOpen, modalOpen, router]);

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
  const activeSchedulingDate = batchSchedule?.expandedDate ?? (modal?.type === "add" ? modal.date : null);
  const selectedRoom = availableRooms.find((room) => room.id === selectedRoomId);
  const roomSuggestions = suggestions.filter((suggestion) => !suggestion.oneTime && suggestion.roomId === selectedRoomId);
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
  const selectedFilterDaypart = daypartFilter === "all" ? undefined : dayparts.find((daypart) => daypart.id === daypartFilter && daypart.active);
  const selectedDaypartPendingDates = selectedFilterDaypart ? pendingBatchScheduleDates(events, selectedFilterDaypart.id) : [];
  const selectedDaypartCanBatch = Boolean(canManage && selectedFilterDaypart
    && !(previewMode && selectedFilterDaypart.type === "dj_artist" && (fullProgramming || selectedFilterDaypart.billingMode === "billed_by_hfy")));
  const batchRemainingDates = batchSchedule
    ? batchSchedule.dates.filter((date) => !batchSchedule.completedDates.includes(date))
    : [];

  function changeStatusFilter(value: StatusFilter) { setStatusFilter(value); }

  function changeDaypartFilter(value: string) {
    setDaypartFilter(value);
    window.localStorage.setItem("hfy-calendar-daypart-filter", value);
  }

  function prepareDateForScheduling(date: string, preferredDaypartId?: string, openModal = true) {
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
        roomId: daypart.roomId,
        oneTime: false,
        createMode: null,
        repeatWeekdays: [],
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
      roomId: null,
      oneTime: true,
      createMode: null,
      repeatWeekdays: [weekday],
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
    setSelectedRoomId(preferred?.roomId ?? "");
    setAddMode(preferred ? "daypart" : "room");
    setNewRoomName("");
    setNewRoomHue(defaultNewRoomHue);
    setNewRoomPromptOpen(false);
    setRoomCreateState(initialActionState);
    setClientArtistFlow(false);
    setReplacementDraft(null);
    setNewAssignmentDraft(null);
    setEditState(initialActionState);
    setDateActionState(initialActionState);
    setBookingFeedbackDate(null);
    if (openModal) setModal({ type: "add", date });
  }

  function openDate(date: string, preferredDaypartId?: string) {
    prepareDateForScheduling(date, preferredDaypartId);
  }

  function openBatchSchedule() {
    if (!selectedFilterDaypart || !selectedDaypartCanBatch || !selectedDaypartPendingDates.length) return;
    setModal(null);
    setSuggestions([]);
    setActiveDaypartId("");
    setBookingFeedbackDate(null);
    setBatchSchedule({
      daypartId: selectedFilterDaypart.id,
      dates: selectedDaypartPendingDates,
      completedDates: [],
      expandedDate: null,
    });
  }

  function toggleBatchDate(date: string) {
    if (!batchSchedule || !batchSchedule.dates.includes(date)) return;
    if (batchSchedule.expandedDate === date) {
      setBatchSchedule({ ...batchSchedule, expandedDate: null });
      setSuggestions([]);
      setActiveDaypartId("");
      setBookingFeedbackDate(null);
      return;
    }
    setBatchSchedule({ ...batchSchedule, expandedDate: date });
    prepareDateForScheduling(date, batchSchedule.daypartId, false);
  }

  function closeBatchSchedule() {
    setBatchSchedule(null);
    setSuggestions([]);
    setActiveDaypartId("");
    setBookingFeedbackDate(null);
    router.refresh();
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
    setOneTimeEditDraft(residencyEvent && !residencyEvent.daypartId ? oneTimeDraftFromEvent(residencyEvent, availableRooms) : null);
    setModal({ type: "edit", eventId: event.id });
  }

  function openExistingDaypart(daypartId: string, date: string) {
    const event = events.find((item) => !item.projected && item.date === date && item.daypartId === daypartId);
    if (event) {
      setReplacementDraft(null);
      setNewAssignmentDraft(null);
      setEditState(initialActionState);
      setOneTimeEditDraft(!event.daypartId ? oneTimeDraftFromEvent(event, availableRooms) : null);
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
    setAddMode("new-repeat");
  }

  function chooseSuggestion(suggestion: SuggestionDraft) {
    setClientArtistFlow(false);
    setSelectedRoomId(suggestion.roomId ?? "");
    setActiveDaypartId(suggestion.daypartId);
    setAddMode("daypart");
  }

  function chooseRoom(room: RoomComboboxOption) {
    setNewRoomName(room.name);
    setSelectedRoomId(room.id);
    setActiveDaypartId("");
    setAddMode("activity");
    setNewRoomPromptOpen(false);
    setRoomCreateState(initialActionState);
  }

  function openNewRoomPrompt(roomName: string) {
    setNewRoomName(roomName);
    setNewRoomHue(defaultNewRoomHue);
    setRoomCreateState(initialActionState);
    setNewRoomPromptOpen(true);
  }

  function chooseCreateNew() {
    const oneTime = suggestions.find((suggestion) => suggestion.oneTime);
    if (!oneTime || !selectedRoom || modal?.type !== "add") return;
    setSuggestions((current) => current.map((suggestion) => suggestion.oneTime ? {
      ...suggestion,
      roomId: selectedRoom.id,
      room: selectedRoom.name,
      color: roomDaypartColor(selectedRoom.hue, selectedRoom.daypartCount),
      type: null,
      billingMode: suggestion.billingMode,
      createMode: null,
      repeatWeekdays: [weekdayForDate(modal.date)],
      name: "",
      requestHfy: false,
      slots: [],
    } : suggestion));
    setClientArtistFlow(false);
    setActiveDaypartId(oneTime.daypartId);
    setAddMode("new-type");
  }

  function chooseCreateMode(createMode: CreateMode) {
    updateSuggestion({ createMode });
    setAddMode("one-time");
  }

  function toggleRepeatWeekday(weekday: number) {
    if (!activeSuggestion || modal?.type !== "add") return;
    const currentWeekday = weekdayForDate(modal.date);
    const selected = activeSuggestion.repeatWeekdays.includes(weekday);
    if (selected && weekday === currentWeekday) return;
    updateSuggestion({
      repeatWeekdays: selected
        ? activeSuggestion.repeatWeekdays.filter((item) => item !== weekday)
        : [...activeSuggestion.repeatWeekdays, weekday].sort((left, right) => left - right),
    });
  }

  async function createNewRoom() {
    if (!newRoomName.trim()) return;
    const formData = new FormData();
    formData.set("residencyId", residency.id);
    formData.set("name", newRoomName);
    formData.set("hue", newRoomHue);
    setRoomCreating(true);
    const result = await createResidencyRoomAction(formData);
    setRoomCreating(false);
    setRoomCreateState(result);
    const room = result.room;
    if (!room) return;
    setCreatedRooms((current) => current.some((item) => item.id === room.id) ? current : [...current, room]);
    chooseRoom(room);
  }

  function returnToRoomPicker() {
    setClientArtistFlow(false);
    setSelectedRoomId("");
    setActiveDaypartId("");
    setAddMode("room");
  }

  function returnToAddPicker() {
    setClientArtistFlow(false);
    setActiveDaypartId("");
    setAddMode(selectedRoomId ? "activity" : "room");
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

  const assignmentWarning = (() => {
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
  })();

  const draftTimeInvalid = (() => {
    if (!activeSuggestion) return true;
    try {
      const shiftStartMinute = clockToMinute(activeSuggestion.start);
      const shiftEndMinute = resolveEndMinute(shiftStartMinute, activeSuggestion.end);
      const windows = activeSuggestion.slots.map((slot) => resolveAssignmentMinutes(shiftStartMinute, shiftEndMinute, slot.start, slot.end));
      return windows.some((window) => !window.withinShift) || hasOverlappingAssignmentMinutes(windows);
    } catch {
      return true;
    }
  })();

  const payload = (() => {
    if (!activeSchedulingDate || !activeSuggestion || activeSuggestion.existing || !activeSuggestion.type) return "";
    try {
      const startMinute = clockToMinute(activeSuggestion.start);
      const endMinute = resolveEndMinute(startMinute, activeSuggestion.end);
      return JSON.stringify({
        residencyId: residency.id,
        serviceDate: activeSchedulingDate,
        dayparts: [{
          daypartId: activeSuggestion.sourceDaypartId,
          roomId: activeSuggestion.oneTime ? activeSuggestion.roomId : undefined,
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
          createDaypart: activeSuggestion.oneTime && activeSuggestion.createMode && activeSuggestion.createMode !== "one_time"
            ? {
                scheduleMode: activeSuggestion.createMode,
                rules: activeSuggestion.createMode === "standing_weekly"
                  ? activeSuggestion.repeatWeekdays.map((weekday) => ({ weekday, startMinute, endMinute, defaultDjCount: null }))
                  : [],
              }
            : undefined,
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
  })();

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
    formData.set("roomId", draft.roomId ?? "");
    formData.set("room", draft.room);
    formData.set("roomHue", draft.roomHue);
    formData.set("createRoom", String(draft.createRoom));
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
    if (!activeSchedulingDate || !activeSuggestion?.sourceDaypartId) return;
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
    formData.set("serviceDate", activeSchedulingDate);
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
    const daypartId = activeSchedulingDate ? activeSuggestion?.sourceDaypartId : editingEvent?.daypartId;
    const serviceDate = activeSchedulingDate ?? editingEvent?.date;
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
    if (!activeSchedulingDate || !activeSuggestion?.sourceDaypartId) return;
    const formData = new FormData();
    formData.set("residencyId", residency.id);
    formData.set("daypartId", activeSuggestion.sourceDaypartId);
    formData.set("serviceDate", activeSchedulingDate);
    setEditPending(true);
    const result = await clearDaypartDateExceptionAction(formData);
    setEditPending(false);
    setDateActionState(result);
    if (result.status === "success") {
      setModal(null);
      router.refresh();
    }
  }

  const activeWeekStart = weekStart ?? normalizeWeekStart(undefined, monthKey);
  const calendarHref = (viewMode: CalendarViewMode, targetMonth: string, targetWeek?: string) => {
    const query = new URLSearchParams({ month: targetMonth });
    if (viewMode === "week") {
      query.set("calendarView", "week");
      query.set("week", targetWeek ?? activeWeekStart);
    }
    if (calendarBasePath !== "/app/calendar") return `${calendarBasePath}?${query.toString()}`;
    query.set("mode", "hfy");
    query.set(residencySelectionParam, residency.id);
    if (residencySelectionParam === "residency") query.set("view", "operations");
    return `${calendarBasePath}?${query.toString()}`;
  };
  const weekHref = (amount: number) => {
    const targetWeek = shiftDateKey(activeWeekStart, amount * 7);
    return calendarHref("week", monthKeyForDate(shiftDateKey(targetWeek, 3)), targetWeek);
  };
  const previousHref = calendarView === "week" ? weekHref(-1) : calendarHref("month", shiftMonthKey(monthKey, -1));
  const nextHref = calendarView === "week" ? weekHref(1) : calendarHref("month", shiftMonthKey(monthKey, 1));
  const monthViewHref = calendarHref("month", monthKey);
  const weekViewHref = calendarHref("week", monthKeyForDate(shiftDateKey(activeWeekStart, 3)), activeWeekStart);
  const activeSourceDaypart = activeSuggestion?.sourceDaypartId ? dayparts.find((daypart) => daypart.id === activeSuggestion.sourceDaypartId) : undefined;
  const activeCalendarOnly = activeSourceDaypart?.scheduleMode === "calendar_only";
  const activeStandingRule = activeSchedulingDate && activeSuggestion?.sourceDaypartId
    ? (() => {
      const source = dayparts.find((daypart) => daypart.id === activeSuggestion.sourceDaypartId);
      if (source?.scheduleMode === "calendar_only") return source.suggestedStartMinute !== null && source.suggestedEndMinute !== null
        ? { weekday: weekdayForDate(activeSchedulingDate), startMinute: source.suggestedStartMinute, endMinute: source.suggestedEndMinute, defaultDjCount: null }
        : undefined;
      return source?.rules.find((rule) => rule.weekday === weekdayForDate(activeSchedulingDate)) ?? source?.rules[0];
    })()
    : undefined;
  const activeStandingWindow = activeStandingRule
    ? `${formatLocalMinute(activeStandingRule.startMinute)}–${formatLocalMinute(activeStandingRule.endMinute)}`
    : null;
  const batchDaypart = batchSchedule ? dayparts.find((daypart) => daypart.id === batchSchedule.daypartId) : undefined;
  const batchRangeLabel = calendarView === "week" ? weekLabel(activeWeekStart) : monthLabel(monthKey);
  const oneTimeClientRateMissing = Boolean(previewMode && activeSuggestion?.oneTime && activeSuggestion.type === "dj_artist" && !activeSuggestion.requestHfy
    && (!dollarsToCents(activeSuggestion.clientTalentDefaultRate) || (dollarsToCents(activeSuggestion.clientTalentDefaultRate) ?? 0) <= 0));
  const bookingSubmitDisabled = Boolean(pending || !activeSuggestion?.type || (activeSuggestion.oneTime && !activeSuggestion.createMode)
    || !activeSuggestion?.name.trim() || !activeSuggestion?.room.trim() || oneTimeClientRateMissing || assignmentWarning
    || (previewMode && activeSuggestion?.type === "dj_artist" && !activeSuggestion.requestHfy && !activeSuggestion.slots.length));
  const canEditOneTimeRecord = Boolean(editingEvent && !editingEvent.daypartId && oneTimeEditDraft
    && (editingEvent.recordType === "nonfinancial_occurrence" || editingEventCanManageAssignments));
  const editingOneTimeClientRateMissing = Boolean(editingEvent?.daypartType === "dj_artist" && editingEvent.economicsMode === "client_owned"
    && (!dollarsToCents(oneTimeEditDraft?.clientTalentDefaultRate ?? "") || (dollarsToCents(oneTimeEditDraft?.clientTalentDefaultRate ?? "") ?? 0) <= 0));
  const editingOneTimeRoomReady = Boolean(oneTimeEditDraft?.roomId || oneTimeEditDraft?.createRoom);
  const schedulingFields = !activeSchedulingDate ? null : activeSuggestion?.exceptionKind === "skip" ? <div className="quick-existing"><p>This occurrence is skipped only on {activeSchedulingDate}. The standing Daypart is still active.</p><button className="button" type="button" disabled={editPending} onClick={restoreStandingDate}>{editPending ? "Restoring…" : "Restore this date"}</button></div> : activeSuggestion?.existing ? <div className="quick-existing"><p>This slot is already scheduled.</p><button className="button" type="button" onClick={() => openExistingDaypart(activeSuggestion.daypartId, activeSchedulingDate)}>View scheduled slot</button></div> : activeSuggestion ? <>
    {activeSuggestion.oneTime && activeSuggestion.type ? <><section className="quick-selected-daypart quick-new-activity-room" style={{ "--daypart-color": activeSuggestion.color } as CSSProperties}><div><span>Room</span><strong>{activeSuggestion.room}</strong><small>Color is assigned automatically from this room.</small></div><i className="quick-room-color-chip" aria-hidden="true" /></section><div className="quick-new-activity-details"><div className="field"><label>Activity name</label><input value={activeSuggestion.name} onChange={(event) => updateSuggestion({ name: event.target.value })} placeholder={activeSuggestion.type === "house_activity" ? "Movie Night" : "Poolside Session"} required /></div><div className="field quick-activity-time-field"><label>{activeSuggestion.createMode === "standing_weekly" ? "Weekly hours" : "Time for this date"}</label><div className="quick-activity-time-controls"><TimeSelect ariaLabel="Activity start time" value={activeSuggestion.start} onChange={(value) => updateShiftTime("start", value)} stepMinutes={15} required /><span aria-hidden="true">to</span><TimeSelect ariaLabel="Activity end time" value={activeSuggestion.end} onChange={(value) => updateShiftTime("end", value)} stepMinutes={15} required /></div></div></div>{activeSuggestion.createMode === "standing_weekly" ? <div className="quick-repeat-weekdays"><div><strong>Repeats every week on</strong><small>Today’s weekday stays selected so this first date belongs to the recurring Daypart.</small></div><div role="group" aria-label="Recurring weekdays">{weekdayNames.map((weekday, index) => <button className={activeSuggestion.repeatWeekdays.includes(index) ? "active" : ""} type="button" aria-pressed={activeSuggestion.repeatWeekdays.includes(index)} onClick={() => toggleRepeatWeekday(index)} key={weekday}>{weekday.slice(0, 3)}</button>)}</div></div> : null}{activeSuggestion.type === "dj_artist" && previewMode ? <div className={`one-time-session-rate ${oneTimeClientRateMissing ? "needs-attention" : ""}`}><div><strong>Session artist rate</strong><small>{activeSuggestion.createMode === "one_time" ? "Used for every artist you assign to this one-time session." : "Saved as this activity’s default and used for today’s artists."} You can override an individual payout later.</small></div><div className="field"><label>Hourly rate ($/hr) <span>Required</span></label><input type="number" min="0.01" step="0.01" value={activeSuggestion.clientTalentDefaultRate} onChange={(event) => updateSuggestion({ clientTalentDefaultRate: event.target.value })} placeholder="Enter hourly rate" required /></div></div> : null}</> : null}
    {!activeSuggestion.oneTime ? <section className="quick-selected-daypart quick-selected-daypart-editable" style={{ "--daypart-color": activeSuggestion.color } as CSSProperties}><div className="quick-selected-daypart-summary"><span>Selected Daypart</span><strong>{activeSuggestion.name}</strong><small>{activeSuggestion.room}</small></div><div className="quick-selected-window"><div className="quick-selected-window-heading"><span>Hours for this date</span>{activeSuggestion.exceptionKind === "override" ? <em>Custom</em> : null}</div>{activeStandingWindow ? <small>{activeCalendarOnly ? "Suggested" : "Recommended"} window: {activeStandingWindow}</small> : null}<div className="quick-inline-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel={`${activeSuggestion.name} date-specific start time`} value={activeSuggestion.start} onChange={(value) => updateShiftTime("start", value)} stepMinutes={15} required /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel={`${activeSuggestion.name} date-specific end time`} value={activeSuggestion.end} onChange={(value) => updateShiftTime("end", value)} stepMinutes={15} required /></div></div></div>{activeCalendarOnly ? <div className="date-exception-actions"><small>This reusable Daypart template will be added only to {activeSchedulingDate}.</small></div> : batchSchedule ? <div className="date-exception-actions"><small>Any change applies only to {activeSchedulingDate}.</small></div> : <div className="date-exception-actions"><small>Any change applies only to {activeSchedulingDate}.</small><button className="button secondary" type="button" disabled={editPending} onClick={saveDateOverride}>{editPending ? "Saving…" : "Save custom hours"}</button>{activeSuggestion.exceptionKind === "override" ? <button className="button secondary" type="button" disabled={editPending} onClick={restoreStandingDate}>Use standing hours</button> : null}<button className="remove-dj-button" type="button" disabled={editPending} onClick={skipSelectedDate}>Skip this date</button></div>}</section> : null}

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
  </> : null;
  const oneTimeRecordEditor = canEditOneTimeRecord && editingEvent && oneTimeEditDraft ? <section className="one-time-record-editor">
    <SchedulingActivityDetailsRow name={oneTimeEditDraft.name} roomId={oneTimeEditDraft.roomId} room={oneTimeEditDraft.room} createRoom={oneTimeEditDraft.createRoom} rooms={availableRooms} color={oneTimeEditDraft.color} start={oneTimeEditDraft.start} end={oneTimeEditDraft.end} ariaPrefix="scheduled activity" onNameChange={(name) => setOneTimeEditDraft({ ...oneTimeEditDraft, name })} onRoomChange={(roomName) => setOneTimeEditDraft({ ...oneTimeEditDraft, roomId: null, room: roomName, createRoom: false })} onRoomSelect={(room) => setOneTimeEditDraft({ ...oneTimeEditDraft, roomId: room.id, room: room.name, roomHue: room.hue, createRoom: false })} onRoomCreate={(roomName) => setOneTimeEditDraft({ ...oneTimeEditDraft, roomId: null, room: roomName, roomHue: defaultNewRoomHue, createRoom: true })} onColorChange={(color) => setOneTimeEditDraft({ ...oneTimeEditDraft, color })} onStartChange={(start) => setOneTimeEditDraft({ ...oneTimeEditDraft, start })} onEndChange={(end) => setOneTimeEditDraft({ ...oneTimeEditDraft, end })} />
    {oneTimeEditDraft.createRoom ? <div className="field one-time-new-room-color"><label>New room color</label><RoomHuePicker value={oneTimeEditDraft.roomHue} onChange={(roomHue) => setOneTimeEditDraft({ ...oneTimeEditDraft, roomHue })} ariaLabel={`Choose the room color for ${oneTimeEditDraft.room}`} /><small>The next automatic color is preselected. Pick another before saving this new room.</small></div> : null}
    {editingEvent.daypartType === "dj_artist" && editingEvent.economicsMode === "client_owned" ? <div className={`one-time-session-rate ${editingOneTimeClientRateMissing ? "needs-attention" : ""}`}><div><strong>Session artist rate</strong><small>This default applies to every artist in this one-time session. Payment Status overrides still win.</small></div><div className="field"><label>Hourly rate ($/hr) <span>Required</span></label><input type="number" min="0.01" step="0.01" value={oneTimeEditDraft.clientTalentDefaultRate} onChange={(event) => setOneTimeEditDraft({ ...oneTimeEditDraft, clientTalentDefaultRate: event.target.value })} placeholder="Enter hourly rate" required /></div></div> : null}
    {editingEvent.daypartType === "house_activity" ? <div className="quick-program-fields"><div className="field"><label>Program / activity details <span>optional</span></label><input value={oneTimeEditDraft.programDetails} onChange={(event) => setOneTimeEditDraft({ ...oneTimeEditDraft, programDetails: event.target.value })} /></div><div className="field"><label>Host / guest name <span>optional</span></label><input value={oneTimeEditDraft.manualHostName} onChange={(event) => setOneTimeEditDraft({ ...oneTimeEditDraft, manualHostName: event.target.value })} /></div></div> : null}
    <div className="field quick-booking-notes"><label>Notes <span>optional</span></label><textarea value={oneTimeEditDraft.notes} onChange={(event) => setOneTimeEditDraft({ ...oneTimeEditDraft, notes: event.target.value })} /></div>
    <div className="replacement-actions"><span className="privacy-note">{editingEvent.daypartType === "house_activity" ? "House Activity" : "Talent Activity"} · one-time ownership is locked.</span><button className="button" type="button" disabled={editPending || !oneTimeEditDraft.name.trim() || !editingOneTimeRoomReady || editingOneTimeClientRateMissing} onClick={saveOneTimeRecord}>{editPending ? "Saving…" : "Save session changes"}</button></div>
  </section> : null;

  if (batchSchedule && batchDaypart) {
    return <section className="calendar-batch-screen" role="dialog" aria-modal="true" aria-labelledby="calendar-batch-title" style={{ "--daypart-color": batchDaypart.color } as CSSProperties}>
      <header className="calendar-batch-header">
        <div className="calendar-batch-heading">
          <div className="calendar-batch-context"><span>{batchDaypart.room}</span><span>{batchRangeLabel}</span></div>
          <h1 id="calendar-batch-title">{batchDaypart.name}</h1>
          <p>Schedule each remaining occurrence without returning to the Calendar between dates.</p>
        </div>
        <div className="calendar-batch-header-actions">
          <strong aria-live="polite">{batchSchedule.completedDates.length} of {batchSchedule.dates.length} scheduled</strong>
          <button className="quick-modal-close" type="button" aria-label="Close batch scheduling" onClick={closeBatchSchedule}>×</button>
        </div>
      </header>
      <div className="calendar-batch-body">
        {batchRemainingDates.length ? <div className="calendar-batch-list" aria-label={`Dates that still need ${batchDaypart.name} scheduling`}>
          {batchRemainingDates.map((date) => {
            const expanded = batchSchedule.expandedDate === date;
            return <article className={`calendar-batch-row ${expanded ? "expanded" : ""}`} key={date}>
              <button className="calendar-batch-row-summary" type="button" aria-expanded={expanded} aria-controls={`calendar-batch-form-${date}`} onClick={() => toggleBatchDate(date)}>
                <span>{formatBatchScheduleDate(date)}</span>
                <strong>{weekdayNames[weekdayForDate(date)]}</strong>
                <i aria-hidden="true">{expanded ? "−" : "+"}</i>
              </button>
              {expanded ? <form action={formAction} className="quick-book-form calendar-batch-form" id={`calendar-batch-form-${date}`}>
                <input name="payload" type="hidden" value={payload} />
                {schedulingFields}
                {bookingFeedbackDate === date && state.status === "error" ? <p className="error" aria-live="polite">{state.message}</p> : null}
                {dateActionState.status === "error" ? <p className="error" aria-live="polite">{dateActionState.message}</p> : null}
                <footer className="calendar-batch-form-footer"><span>{activeSuggestion?.type ? "Ready to schedule this date?" : "Loading this date…"}</span><button className="button" type="submit" disabled={bookingSubmitDisabled}>{pending ? "Saving…" : "Save & Next"}</button></footer>
              </form> : null}
            </article>;
          })}
        </div> : <div className="calendar-batch-complete" role="status">
          <span aria-hidden="true">✓</span>
          <h2>All done</h2>
          <p>Every {batchDaypart.name} occurrence in {batchRangeLabel} is scheduled.</p>
          <button className="button" type="button" onClick={closeBatchSchedule}>Back to Calendar</button>
        </div>}
      </div>
    </section>;
  }

  return (
    <>
      <header className="page-header calendar-page-header calendar-command-bar">
        <div className="calendar-command-primary">
          <div className="calendar-title"><p className="eyebrow">{residency.name}</p><h1>Calendar</h1></div>
          <div className="calendar-month-cluster">
            <div className={`calendar-needs-summary ${needsDjCount ? "attention" : "clear"}`}><strong>{needsDjCount}</strong><span>{needsDjCount === 1 ? "slot needs scheduling" : "slots need scheduling"}</span></div>
            <div className="month-navigation"><Link className="calendar-arrow" aria-label={`Previous ${calendarView}`} href={previousHref}>←</Link><h2>{calendarView === "week" ? weekLabel(activeWeekStart) : monthLabel(monthKey)}</h2><Link className="calendar-arrow" aria-label={`Next ${calendarView}`} href={nextHref}>→</Link></div>
          </div>
        </div>
        <div className="calendar-command-secondary">
          {residencyOptions?.length ? <form className="calendar-filter-form calendar-toolbar-context" method="get"><input name="mode" type="hidden" value="hfy" /><input name="month" type="hidden" value={monthKey} />{calendarView === "week" ? <><input name="calendarView" type="hidden" value="week" /><input name="week" type="hidden" value={activeWeekStart} /></> : null}{residencySelectionParam === "residency" ? <input name="view" type="hidden" value="operations" /> : null}<label className="calendar-toolbar-select calendar-toolbar-context-select" htmlFor="calendar-residency-switcher"><span>Residency calendar</span><select id="calendar-residency-switcher" name={residencySelectionParam} defaultValue={residency.id}>{residencyOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className="button secondary calendar-toolbar-button" type="submit">View</button></form> : null}
          <div className="calendar-toolbar" aria-label="Calendar controls">
            <div className="calendar-toolbar-cluster calendar-toolbar-filters">
              <label className="calendar-toolbar-select" htmlFor="calendar-status-filter"><span>Status</span><select id="calendar-status-filter" value={statusFilter} onChange={(event) => changeStatusFilter(event.target.value as StatusFilter)}><option value="all">All slots</option><option value="needs">Needs scheduling</option><option value="filled">Scheduled</option></select></label>
              <label className="calendar-toolbar-select" htmlFor="calendar-daypart-filter"><span>Daypart</span><select id="calendar-daypart-filter" value={daypartFilter} onChange={(event) => changeDaypartFilter(event.target.value)}><option value="all">All Dayparts</option>{dayparts.filter((daypart) => daypart.active).map((daypart) => <option value={daypart.id} key={daypart.id}>{daypart.name}</option>)}</select></label>
              {selectedFilterDaypart && selectedDaypartCanBatch && selectedDaypartPendingDates.length ? <button className="calendar-batch-launcher" style={{ "--daypart-color": selectedFilterDaypart.color } as CSSProperties} type="button" onClick={openBatchSchedule}>Schedule all ({selectedDaypartPendingDates.length})</button> : null}
            </div>
            <div className="calendar-toolbar-cluster calendar-toolbar-view">
              <div className="calendar-view-toggle" role="group" aria-label="Calendar view"><Link className={calendarView === "month" ? "active" : ""} aria-current={calendarView === "month" ? "page" : undefined} href={monthViewHref}>Month</Link><Link className={calendarView === "week" ? "active" : ""} aria-current={calendarView === "week" ? "page" : undefined} href={weekViewHref}>Week</Link></div>
            </div>
            <div className="calendar-toolbar-cluster calendar-toolbar-actions">
              {canManage ? <CalendarShareButton residencyId={residency.id} residencyName={residency.name} linkSettings={residency.calendarLinkSettings} dayparts={dayparts.filter((daypart) => daypart.active).map((daypart) => ({ id: daypart.id, name: daypart.name, room: daypart.room, color: daypart.color }))} /> : null}
              <CalendarStatusLegend internal={!previewMode} />
            </div>
          </div>
        </div>
      </header>
      {calendarView === "week"
        ? <WeekCalendar weekStart={activeWeekStart} events={filteredEvents} selectedDate={modal?.type === "add" ? modal.date : editingEvent?.date} onDateClick={canManage ? openDate : undefined} onEventClick={canManage ? openEvent : undefined} />
        : <MonthCalendar compact monthKey={monthKey} events={filteredEvents} selectedDate={modal?.type === "add" ? modal.date : editingEvent?.date} onDateClick={canManage ? openDate : undefined} onEventClick={canManage ? openEvent : undefined} />}

      {modal ? <div className="quick-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setModal(null); }}>
        <section className={`quick-modal ${modal.type === "edit" ? "quick-modal-edit" : ""} ${modal.type === "add" && addMode === "room" ? "quick-modal-room-picker" : ""}`} role="dialog" aria-modal="true" aria-labelledby="quick-modal-title">
          <header className="quick-modal-header">
            <div><p className="eyebrow">{modal.type === "add" ? `${weekdayNames[weekdayForDate(modal.date)]}, ${modal.date}` : editingEvent?.date}</p><h2 id="quick-modal-title">{modal.type === "add" ? addMode === "room" ? "Where is this happening?" : addMode === "activity" ? "What's happening here?" : addMode === "new-type" ? "Create new" : addMode === "new-repeat" ? "Does this repeat?" : addMode === "one-time" ? activeSuggestion?.createMode === "standing_weekly" ? "Create a recurring Daypart" : activeSuggestion?.createMode === "calendar_only" ? "Create a reusable template" : "Create a one-time activity" : "Schedule Daypart" : `Manage · ${editingEvent?.title ?? "Slot"}`}</h2></div>
            <button className="quick-modal-close" type="button" aria-label="Close popup" onClick={() => setModal(null)}>×</button>
          </header>

          <div className="quick-modal-body">
            {modal.type === "add" ? (
              addMode === "room" ? <div className="quick-room-picker-shell">
                <div className="quick-picker-intro"><strong>Choose a room or space</strong><small>Start typing to find an existing room. A new room is created only when you explicitly choose that option.</small></div>
                <div className="field quick-room-combobox-field"><label>Room / space</label><RoomCombobox rooms={availableRooms} value={newRoomName} selectedRoomId={null} creationConfirmed={newRoomPromptOpen} placeholder="Start typing, for example Amigo" ariaLabel="Choose or create a room" autoFocus onChange={(roomName) => { setNewRoomName(roomName); setNewRoomPromptOpen(false); setRoomCreateState(initialActionState); }} onSelect={chooseRoom} onCreate={openNewRoomPrompt} /></div>
                {newRoomPromptOpen ? <div className="quick-new-room-prompt"><div className="quick-new-room-name-summary"><span>New room or space</span><strong>{newRoomName}</strong></div><div className="field"><label>Room color</label><RoomHuePicker value={newRoomHue} onChange={setNewRoomHue} ariaLabel="Choose the new room color" /><small>The next automatic color is preselected. Pick another if you prefer.</small></div><div className="quick-new-room-actions"><button className="button secondary" type="button" onClick={() => { setNewRoomPromptOpen(false); setRoomCreateState(initialActionState); }}>Back</button><button className="button" type="button" disabled={roomCreating || !newRoomName.trim()} onClick={() => void createNewRoom()}>{roomCreating ? "Adding…" : "Create space"}</button></div>{roomCreateState.status === "error" ? <p className="error" aria-live="polite">{roomCreateState.message}</p> : null}</div> : null}
                <div className="quick-slot-picker-actions"><button className="button secondary" type="button" onClick={() => setModal(null)}>Cancel</button></div>
              </div>
              : addMode === "activity" ? <div className="quick-room-picker-shell"><div className="quick-picker-heading"><button className="button secondary" type="button" onClick={returnToRoomPicker}>← Rooms</button><div><span>Selected room</span><strong>{selectedRoom?.name}</strong></div></div>{roomSuggestions.length ? <div className="quick-funnel-tiles" role="group" aria-label={`Choose an activity in ${selectedRoom?.name ?? "this room"}`}>{roomSuggestions.map((suggestion) => <button className="quick-funnel-tile activity" style={{ "--room-color": suggestion.color, "--room-fill": roomColor(selectedRoom?.hue ?? "blue", "pale"), "--room-text": roomColor(selectedRoom?.hue ?? "blue", "dark") } as CSSProperties} type="button" onClick={() => chooseSuggestion(suggestion)} key={suggestion.daypartId}><strong>{suggestion.name}</strong>{suggestion.existing ? <Status value="scheduled" /> : null}{suggestion.billingMode === "billed_by_hfy" ? <i className="hfy-booking-indicator" aria-label="HFY booked" /> : null}</button>)}</div> : <p className="quick-funnel-empty">Nothing is saved in {selectedRoom?.name} yet.</p>}<div className="quick-funnel-divider" /><button className="quick-funnel-wide-tile" type="button" onClick={chooseCreateNew}><strong>Create new</strong><span aria-hidden="true">+</span></button><div className="quick-slot-picker-actions"><button className="button secondary" type="button" onClick={() => setModal(null)}>Cancel</button></div></div>
              : addMode === "new-type" ? <div className="quick-room-picker-shell"><div className="quick-picker-heading"><button className="button secondary" type="button" onClick={returnToAddPicker}>← Back</button><div><span>Room</span><strong>{selectedRoom?.name}</strong></div></div><div className="field quick-one-time-type"><label>Type</label><div className="daypart-type-options">{!fullProgramming ? <button type="button" onClick={() => chooseOneTimeType("dj_artist")}><strong>Talent Activity</strong><small>Schedule talent with assignments and the appropriate financial tracking.</small></button> : null}<button type="button" onClick={() => chooseOneTimeType("house_activity")}><strong>House Activity</strong><small>Schedule an activity or host without Assignment, Payout, or Invoice records.</small></button></div>{fullProgramming ? <small>HFY creates and staffs all Talent Activities for Full Programming accounts.</small> : null}</div></div>
              : addMode === "new-repeat" ? <div className="quick-room-picker-shell"><div className="quick-picker-heading"><button className="button secondary" type="button" onClick={() => setAddMode("new-type")}>← Back</button><div><span>{activeSuggestion?.type === "house_activity" ? "House Activity" : "Talent Activity"}</span><strong>{selectedRoom?.name}</strong></div></div><div className="quick-repeat-options" role="group" aria-label="Does this repeat?"><button type="button" onClick={() => chooseCreateMode("standing_weekly")}><strong>Same weekday every week</strong><small>Save a recurring Daypart and schedule this date now.</small></button><button type="button" onClick={() => chooseCreateMode("calendar_only")}><strong>Occasionally, might reuse</strong><small>Save a reusable one-off template and schedule this date now.</small></button><button type="button" onClick={() => chooseCreateMode("one_time")}><strong>No, just this once</strong><small>Schedule only this date without saving a reusable item.</small></button></div></div>
              : <form action={formAction} className="quick-book-form">
                <input name="payload" type="hidden" value={payload} />
                {schedulingFields}

                {state.status === "error" ? <p className="error" aria-live="polite">{state.message}</p> : null}
                {dateActionState.status === "error" ? <p className="error" aria-live="polite">{dateActionState.message}</p> : null}
                {activeSuggestion && !activeSuggestion.existing && activeSuggestion.exceptionKind !== "skip" ? clientStandingHfy ? <footer className="quick-modal-footer"><button className="button secondary" type="button" onClick={returnToAddPicker}>Back</button><span>No action needed for this date.</span><button className="button" type="button" onClick={() => setModal(null)}>Done</button></footer> : <footer className="quick-modal-footer"><button className="button secondary" type="button" onClick={activeSuggestion.oneTime ? () => setAddMode("new-repeat") : returnToAddPicker}>Back</button><span>{oneTimeClientRateMissing ? "Enter the session artist rate to continue." : activeSuggestion.type ? "Ready to schedule?" : "Choose an activity type to continue."}</span><button className="button secondary" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button" type="submit" disabled={bookingSubmitDisabled}>{pending ? "Saving…" : activeSuggestion.requestHfy ? "Send Request to HFY" : activeSuggestion.oneTime ? "Mark scheduled" : activeSuggestion.billingMode === "tracking_only" && !activeSuggestion.slots.length ? "Mark scheduled" : `Save ${activeSuggestion.name || "Daypart"}`}</button></footer> : activeSuggestion ? <footer className="quick-modal-footer"><button className="button secondary" type="button" onClick={returnToAddPicker}>Back</button><button className="button secondary" type="button" onClick={() => setModal(null)}>Done</button></footer> : null}
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
