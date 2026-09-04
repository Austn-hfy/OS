"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { deleteResidencyRoomAction, removeDaypartAction, saveDaypartAction, updateResidencyRoomAction, type CreateRoomActionState, type ResidencyActionState } from "@/app/app/actions";
import { DEFAULT_DAYPART_COLOR, clockToMinute, contrastTextColor, formatLocalMinute, minuteToClock, resolveEndMinute, roomColor, roomDaypartColor, roomHueForIndex, weekdayNames, type DaypartBillingMode, type DaypartScheduleMode, type DaypartType, type RoomHue } from "@/domain/dayparts";
import { DaypartColorPicker } from "@/components/daypart-color-picker";
import { RoomHuePicker } from "@/components/room-hue-picker";
import { RoomCombobox, type RoomComboboxOption } from "@/components/room-combobox";
import { SensitiveInput } from "@/components/privacy-mode";
import { TimeSelect } from "@/components/time-select";
import { daypartNeedsDefaultArtistRate } from "@/domain/daypart-rate-attention";
import { useReportDaypartRateAttention } from "@/components/daypart-rate-attention-context";
import type { ResidencyRoom } from "@/services/rooms";

export type DaypartRow = {
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
  clientDefaultRateCents: number | null;
  activeUntil: string | null;
  active: boolean;
  sortOrder: number;
  rules: Array<{ weekday: number; startMinute: number; endMinute: number; defaultDjCount: number | null }>;
};

type RuleDraft = { enabled: boolean; start: string; end: string; defaultDjCount: string };
type EditorDraft = {
  id?: string;
  roomId: string | null;
  roomHue: RoomHue | null;
  createRoom: boolean;
  name: string;
  room: string;
  color: string;
  type: DaypartType | null;
  billingMode: DaypartBillingMode | null;
  scheduleMode: DaypartScheduleMode | null;
  suggestedStart: string;
  suggestedEnd: string;
  defaultTalentRate: string;
  clientDefaultRate: string;
  activeUntil: string;
  active: boolean;
  sortOrder: number;
  rules: RuleDraft[];
};

type TemplatePopoverState = {
  roomId: string;
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const initialActionState: ResidencyActionState = { status: "idle", message: "" };

function optionalDjCount(value: string): number | null {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : null;
}

function centsFromOptionalDollars(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid Daypart rate.");
  return Math.round(amount * 100);
}

function blankDraft(options: { room?: string; roomId?: string | null; roomHue?: RoomHue | null; roomItemCount?: number; weekday?: number; startMinute?: number; endMinute?: number; color?: string } = {}): EditorDraft {
  const startMinute = options.startMinute ?? 1080;
  const endMinute = options.endMinute ?? startMinute + 180;
  return {
    name: "",
    roomId: options.roomId ?? null,
    roomHue: options.roomHue ?? null,
    createRoom: false,
    room: options.room ?? "",
    color: options.color ?? (options.roomHue ? roomDaypartColor(options.roomHue, options.roomItemCount ?? 0) : DEFAULT_DAYPART_COLOR),
    type: null,
    billingMode: null,
    scheduleMode: null,
    suggestedStart: "18:00",
    suggestedEnd: "21:00",
    defaultTalentRate: "",
    clientDefaultRate: "",
    activeUntil: "",
    active: true,
    sortOrder: 0,
    rules: weekdayNames.map((_, weekday) => weekday === options.weekday
      ? { enabled: true, start: minuteToClock(startMinute), end: minuteToClock(endMinute), defaultDjCount: "0" }
      : { enabled: false, start: "", end: "", defaultDjCount: "0" }),
  };
}

function draftFromDaypart(daypart: DaypartRow): EditorDraft {
  return {
    id: daypart.id,
    roomId: daypart.roomId,
    roomHue: daypart.roomHue,
    createRoom: false,
    name: daypart.name,
    room: daypart.room,
    color: daypart.color,
    type: daypart.type,
    billingMode: daypart.type === "house_activity" ? null : daypart.billingMode ?? "billed_by_hfy",
    scheduleMode: daypart.scheduleMode,
    suggestedStart: minuteToClock(daypart.suggestedStartMinute ?? daypart.rules[0]?.startMinute ?? 1080),
    suggestedEnd: minuteToClock(daypart.suggestedEndMinute ?? daypart.rules[0]?.endMinute ?? 1260),
    defaultTalentRate: daypart.defaultTalentRateCents === null ? "" : (daypart.defaultTalentRateCents / 100).toFixed(2),
    clientDefaultRate: daypart.clientDefaultRateCents === null ? "" : (daypart.clientDefaultRateCents / 100).toFixed(2),
    activeUntil: daypart.activeUntil ?? "",
    active: daypart.active,
    sortOrder: daypart.sortOrder,
    rules: weekdayNames.map((_, weekday) => {
      const rule = daypart.rules.find((item) => item.weekday === weekday);
      return rule
        ? { enabled: true, start: minuteToClock(rule.startMinute), end: minuteToClock(rule.endMinute), defaultDjCount: String(rule.defaultDjCount ?? 0) }
        : { enabled: false, start: "", end: "", defaultDjCount: "0" };
    }),
  };
}

function displayRange(dayparts: DaypartRow[]) {
  const rules = dayparts.flatMap((daypart) => daypart.rules);
  if (!rules.length) return { start: 600, end: 1440 };
  const earliest = Math.min(...rules.map((rule) => rule.startMinute));
  const latest = Math.max(...rules.map((rule) => rule.endMinute));
  return {
    start: Math.max(0, Math.floor((earliest - 60) / 60) * 60),
    end: Math.min(2879, Math.ceil((latest + 60) / 60) * 60),
  };
}

export function DaypartManager({ residencyId, dayparts, residencyRooms, onSaved, onClose, readOnly = false, hideFinancials = false, initialCreate = false, fullProgrammingClient = false }: { residencyId: string; dayparts: DaypartRow[]; residencyRooms: ResidencyRoom[]; onSaved?: () => void; onClose?: () => void; readOnly?: boolean; hideFinancials?: boolean; initialCreate?: boolean; fullProgrammingClient?: boolean }) {
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [roomDraft, setRoomDraft] = useState<{ roomId: string; name: string; hue: RoomHue } | null>(null);
  const [templatePopover, setTemplatePopover] = useState<TemplatePopoverState | null>(null);
  const templateTriggerRef = useRef<HTMLButtonElement>(null);
  const templatePopoverRef = useRef<HTMLDivElement>(null);
  const [roomPending, setRoomPending] = useState(false);
  const [roomDeletePending, setRoomDeletePending] = useState(false);
  const [roomState, setRoomState] = useState<CreateRoomActionState>(initialActionState);
  const openedInitialDraft = useRef(false);
  const dateSectionRef = useRef<HTMLDivElement>(null);
  const draftOpenRef = useRef(false);
  const [dateValidationRequested, setDateValidationRequested] = useState(false);
  const [removePending, setRemovePending] = useState(false);
  const [removeState, setRemoveState] = useState<ResidencyActionState>(initialActionState);
  const submitDaypart = async (previous: ResidencyActionState, formData: FormData) => {
    const result = await saveDaypartAction(previous, formData);
    if (result.status === "success") {
      setDraft(null);
      onSaved?.();
    }
    return result;
  };
  const [state, formAction, pending] = useActionState(submitDaypart, initialActionState);
  const rateAttentionAudience = hideFinancials ? "residency" as const : "hfy" as const;
  const missingRateDayparts = useMemo(() => fullProgrammingClient ? [] : dayparts.filter((daypart) => daypartNeedsDefaultArtistRate(daypart, rateAttentionAudience)), [dayparts, fullProgrammingClient, rateAttentionAudience]);
  useReportDaypartRateAttention({ residencyId, audience: rateAttentionAudience, needsAttention: missingRateDayparts.length > 0 });
  const standingDayparts = useMemo(() => dayparts.filter((daypart) => daypart.scheduleMode === "standing_weekly"), [dayparts]);
  const calendarOnlyDayparts = useMemo(() => dayparts.filter((daypart) => daypart.scheduleMode === "calendar_only"), [dayparts]);
  const defaultNewRoomHue = roomHueForIndex(Math.max(-1, ...residencyRooms.map((room) => room.sortOrder)) + 1);
  const range = useMemo(() => displayRange(standingDayparts), [standingDayparts]);
  const rangeMinutes = range.end - range.start;
  const hasSelectedDay = draft?.scheduleMode === "calendar_only" || (draft?.rules.some((rule) => rule.enabled && rule.start && rule.end) ?? false);
  const hasSelectedRoom = Boolean(draft?.roomId || draft?.createRoom);
  const missingDateServerError = state.status === "error" && state.message === "Select at least one operating day.";
  const showDateValidation = Boolean(draft) && !hasSelectedDay && (dateValidationRequested || missingDateServerError);
  const draftNeedsRate = Boolean(draft?.active && draft.type === "dj_artist" && (
    (draft.billingMode === "billed_by_hfy" && rateAttentionAudience !== "residency" && (!Number.isFinite(Number(draft.defaultTalentRate)) || Number(draft.defaultTalentRate) <= 0))
    || (draft.billingMode === "tracking_only" && (!Number.isFinite(Number(draft.clientDefaultRate)) || Number(draft.clientDefaultRate) <= 0))
  ));

  useEffect(() => {
    if (!initialCreate || readOnly || openedInitialDraft.current) return;
    openedInitialDraft.current = true;
    const initial = blankDraft();
    setDraft(fullProgrammingClient ? { ...initial, type: "house_activity" } : initial);
  }, [dayparts.length, fullProgrammingClient, initialCreate, readOnly]);

  useEffect(() => {
    if (!draft) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDraft(null); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [draft]);

  useEffect(() => {
    if (!roomDraft) return;
    const priorOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setRoomDraft(null); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [roomDraft]);

  useEffect(() => {
    if (!templatePopover) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!templatePopoverRef.current?.contains(target) && !templateTriggerRef.current?.contains(target)) setTemplatePopover(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTemplatePopover(null);
      templateTriggerRef.current?.focus();
    };
    const closeOnViewportChange = () => setTemplatePopover(null);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [templatePopover]);

  useEffect(() => {
    const draftIsOpen = Boolean(draft);
    if (draftIsOpen !== draftOpenRef.current) {
      setDateValidationRequested(false);
      draftOpenRef.current = draftIsOpen;
    }
  }, [draft]);

  useEffect(() => {
    if (!showDateValidation) return;
    dateSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    dateSectionRef.current?.querySelector<HTMLButtonElement>(".week-toggle")?.focus({ preventScroll: true });
  }, [showDateValidation]);

  const payload = useMemo(() => {
    if (!draft) return "";
    if (!draft.type || (draft.type === "dj_artist" && !draft.billingMode)) return "";
    if (!draft.scheduleMode) return "";
    const suggestedStartMinute = draft.scheduleMode === "calendar_only" ? clockToMinute(draft.suggestedStart) : null;
    const suggestedEndMinute = draft.scheduleMode === "calendar_only" ? resolveEndMinute(suggestedStartMinute!, draft.suggestedEnd) : null;
    return JSON.stringify({
      id: draft.id,
      residencyId,
      roomId: draft.roomId,
      roomHue: draft.roomHue,
      createRoom: draft.createRoom,
      name: draft.name,
      room: draft.room,
      color: draft.color,
      type: draft.type,
      billingMode: draft.type === "house_activity" ? null : draft.billingMode,
      scheduleMode: draft.scheduleMode,
      suggestedStartMinute,
      suggestedEndMinute,
      defaultTalentRateCents: draft.type === "dj_artist" && draft.billingMode === "billed_by_hfy" ? centsFromOptionalDollars(draft.defaultTalentRate) : null,
      clientDefaultRateCents: draft.type === "dj_artist" && draft.billingMode === "tracking_only" ? centsFromOptionalDollars(draft.clientDefaultRate) : null,
      activeUntil: draft.activeUntil || null,
      active: draft.active,
      sortOrder: draft.sortOrder,
      rules: draft.scheduleMode === "calendar_only" ? [] : draft.rules.flatMap((rule, weekday) => {
        if (!rule.enabled || !rule.start || !rule.end) return [];
        const startMinute = clockToMinute(rule.start);
        return [{ weekday, startMinute, endMinute: resolveEndMinute(startMinute, rule.end), defaultDjCount: draft.type === "dj_artist" ? optionalDjCount(rule.defaultDjCount) : null }];
      }),
    });
  }, [draft, residencyId]);

  function updateDraftRoom(roomName: string) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        room: roomName,
        roomId: null,
        createRoom: false,
      };
    });
  }

  function selectDraftRoom(room: RoomComboboxOption) {
    const matched = residencyRooms.find((item) => item.id === room.id);
    setDraft((current) => current ? {
      ...current,
      room: room.name,
      roomId: room.id,
      roomHue: room.hue,
      createRoom: false,
      color: roomDaypartColor(room.hue, matched?.daypartCount ?? 0),
    } : current);
  }

  function selectNewDraftRoom(roomName: string) {
    setDraft((current) => current ? {
      ...current,
      room: roomName,
      roomId: null,
      roomHue: defaultNewRoomHue,
      createRoom: true,
      color: roomDaypartColor(defaultNewRoomHue, 0),
    } : current);
  }

  async function saveRoom() {
    if (!roomDraft) return;
    const formData = new FormData();
    formData.set("residencyId", residencyId);
    formData.set("roomId", roomDraft.roomId);
    formData.set("name", roomDraft.name);
    formData.set("hue", roomDraft.hue);
    setRoomPending(true);
    const result = await updateResidencyRoomAction(formData);
    setRoomPending(false);
    setRoomState(result);
    if (result.status === "success") {
      setRoomDraft(null);
      onSaved?.();
    }
  }

  async function deleteRoom() {
    if (!roomDraft) return;
    if (!window.confirm(`Delete ${roomDraft.name}? This works only after its Dayparts, templates, and dated Calendar activities have been moved or deleted.`)) return;
    const formData = new FormData();
    formData.set("residencyId", residencyId);
    formData.set("roomId", roomDraft.roomId);
    setRoomDeletePending(true);
    const result = await deleteResidencyRoomAction(formData);
    setRoomDeletePending(false);
    setRoomState(result);
    if (result.status === "success") {
      setRoomDraft(null);
      onSaved?.();
    }
  }

  function updateRule(weekday: number, next: Partial<RuleDraft>) {
    setDraft((current) => current ? {
      ...current,
      rules: current.rules.map((rule, index) => index === weekday ? { ...rule, ...next } : rule),
    } : current);
  }

  function toggleRule(weekday: number) {
    if (draft && !draft.rules[weekday].enabled) setDateValidationRequested(false);
    setDraft((current) => {
      if (!current) return current;
      const rule = current.rules[weekday];
      const source = current.rules.find((item) => item.enabled && item.start && item.end);
      const next = rule.enabled
        ? { ...rule, enabled: false, start: "", end: "" }
        : { ...rule, enabled: true, start: source?.start ?? "18:00", end: source?.end ?? "21:00" };
      return { ...current, rules: current.rules.map((item, index) => index === weekday ? next : item) };
    });
  }

  function applyToAllSelected() {
    setDraft((current) => {
      if (!current) return current;
      const source = current.rules.find((rule) => rule.enabled && rule.start && rule.end);
      if (!source) return current;
      return {
        ...current,
        rules: current.rules.map((rule) => rule.enabled
          ? { ...rule, start: source.start, end: source.end }
          : rule),
      };
    });
  }

  function addFromGrid(room: ResidencyRoom, weekday: number) {
    const roomRule = dayparts
      .filter((daypart) => daypart.scheduleMode === "standing_weekly" && daypart.roomId === room.id)
      .flatMap((daypart) => daypart.rules)
      .find((rule) => rule.weekday === weekday)
      ?? standingDayparts.find((daypart) => daypart.roomId === room.id)?.rules[0];
    const next = blankDraft({
      room: room.name,
      roomId: room.id,
      roomHue: room.hue,
      roomItemCount: room.daypartCount,
      weekday,
      startMinute: roomRule?.startMinute,
      endMinute: roomRule?.endMinute,
    });
    setDraft(fullProgrammingClient ? { ...next, type: "house_activity" } : next);
  }

  function toggleTemplatePopover(roomId: string, templateCount: number, trigger: HTMLButtonElement) {
    if (templatePopover?.roomId === roomId) {
      setTemplatePopover(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 8;
    const width = Math.min(360, window.innerWidth - viewportPadding * 2);
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
    const desiredHeight = Math.min(420, 82 + templateCount * 68);
    const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const spaceAbove = rect.top - gap - viewportPadding;
    const openAbove = spaceBelow < Math.min(desiredHeight, 240) && spaceAbove > spaceBelow;
    templateTriggerRef.current = trigger;
    setTemplatePopover({
      roomId,
      left,
      width,
      maxHeight: Math.max(120, openAbove ? spaceAbove : spaceBelow),
      ...(openAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
  }

  async function removeCurrentDaypart() {
    if (!draft?.id) return;
    const itemLabel = draft.scheduleMode === "calendar_only" ? "template" : "Daypart";
    const confirmed = window.confirm(`Remove this ${itemLabel}? If it has any scheduled or historical records, HFY OS will archive it and preserve that history. Otherwise it will be permanently deleted.`);
    if (!confirmed) return;
    const formData = new FormData();
    formData.set("residencyId", residencyId);
    formData.set("daypartId", draft.id);
    setRemovePending(true);
    const result = await removeDaypartAction(formData);
    setRemovePending(false);
    setRemoveState(result);
    if (result.status === "success") {
      setDraft(null);
      onSaved?.();
    }
  }

  return (
    <section className="daypart-manager">
      <div className="section-heading daypart-workspace-heading"><div><p className="eyebrow">Schedule setup</p><h2>Weekly Daypart grid</h2><p className="subhead">Weekly Dayparts project onto the Calendar until scheduled.</p></div><div className="daypart-workspace-actions">{readOnly ? null : <button className="button" type="button" onClick={() => { const next = blankDraft(); setDraft(fullProgrammingClient ? { ...next, type: "house_activity" } : next); }}>{fullProgrammingClient ? "+ Add House Activity" : "+ Add Daypart"}</button>}{onClose ? <button className="quick-modal-close" type="button" aria-label="Close Day Parts" onClick={onClose}>×</button> : null}</div></div>

      {fullProgrammingClient ? <div className="full-programming-notice"><strong>HFY manages all Talent Activities</strong><span>You can create and edit House Activities here. Talent Activities and artist scheduling are handled by HFY; single-date skips and custom hours remain available from Calendar.</span></div> : null}

      {missingRateDayparts.length ? <div className="daypart-rate-attention-banner" role="status"><span aria-hidden="true">!</span><div><strong>{missingRateDayparts.length} default artist {missingRateDayparts.length === 1 ? "rate needs" : "rates need"} attention</strong><p>Open every highlighted Talent Activity and enter a rate above $0. You can keep building the schedule, but HFY OS cannot calculate what the artist is owed until these rates are saved.</p></div></div> : null}

      {residencyRooms.length ? <div className="daypart-week-board" style={{ "--daypart-grid-start": range.start, "--daypart-grid-end": range.end } as CSSProperties}>
        <div className="daypart-week-corner"><strong>Room</strong><span>{formatLocalMinute(range.start)}–{formatLocalMinute(range.end)}</span></div>
        {weekdayNames.map((weekday) => <div className="daypart-week-heading" key={weekday}>{weekday.slice(0, 3)}</div>)}
        {residencyRooms.map((room) => {
          const roomTemplates = calendarOnlyDayparts.filter((daypart) => daypart.roomId === room.id);
          return <div className="daypart-week-row" key={room.id}>
          <div className="daypart-room-label">
            {readOnly ? <span className="daypart-room-color-bar" style={{ "--room-color": roomColor(room.hue), "--room-tint": roomColor(room.hue, "pale") } as CSSProperties} aria-hidden="true" /> : <button className="daypart-room-color-bar" style={{ "--room-color": roomColor(room.hue), "--room-tint": roomColor(room.hue, "pale") } as CSSProperties} type="button" aria-label={`Edit ${room.name}`} title={`Edit ${room.name}`} onClick={() => { setRoomState(initialActionState); setRoomDraft({ roomId: room.id, name: room.name, hue: room.hue }); }}><span aria-hidden="true">✎</span></button>}
            <div className="daypart-room-label-copy"><strong>{room.name}</strong>{roomTemplates.length ? <button className="room-template-trigger" type="button" aria-haspopup="dialog" aria-expanded={templatePopover?.roomId === room.id} aria-controls={`room-${room.id}-templates`} onClick={(event) => toggleTemplatePopover(room.id, roomTemplates.length, event.currentTarget)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4.75c0-.97.78-1.75 1.75-1.75h6.5C16.22 3 17 3.78 17 4.75V21l-5-3.15L7 21V4.75Z" /></svg><span>{roomTemplates.length} saved {roomTemplates.length === 1 ? "template" : "templates"}</span></button> : null}</div>
          </div>
          {weekdayNames.map((weekdayName, weekday) => {
            const blocks = standingDayparts.flatMap((daypart) => {
              if (daypart.roomId !== room.id) return [];
              const rule = daypart.rules.find((item) => item.weekday === weekday);
              return rule ? [{ daypart, rule }] : [];
            });
            return <div className="daypart-week-cell" key={`${room.id}-${weekdayName}`}>
              {readOnly ? null : <button className="daypart-week-add" type="button" aria-label={`Add a Daypart in ${room.name} on ${weekdayName}`} onClick={() => addFromGrid(room, weekday)}><span>+</span></button>}
              {blocks.map(({ daypart, rule }) => {
                const top = Math.max(0, ((rule.startMinute - range.start) / rangeMinutes) * 100);
                const bottom = Math.min(100, ((rule.endMinute - range.start) / rangeMinutes) * 100);
                const overlapping = blocks.filter((block) => block.rule.startMinute < rule.endMinute && block.rule.endMinute > rule.startMinute).sort((left, right) => left.rule.startMinute - right.rule.startMinute || left.daypart.name.localeCompare(right.daypart.name));
                const lane = Math.max(0, overlapping.findIndex((block) => block.daypart.id === daypart.id));
                const laneWidth = 100 / overlapping.length;
                return <button
                  className={`daypart-week-block ${daypart.active ? "" : "inactive"} ${daypartNeedsDefaultArtistRate(daypart, rateAttentionAudience) ? "needs-rate" : ""}`}
                  type="button"
                  title={`Edit ${daypart.name}${daypartNeedsDefaultArtistRate(daypart, rateAttentionAudience) ? " — default artist rate needed" : ""}`}
                  disabled={readOnly || (fullProgrammingClient && daypart.type === "dj_artist")}
                  onClick={readOnly || (fullProgrammingClient && daypart.type === "dj_artist") ? undefined : () => setDraft(draftFromDaypart(daypart))}
                  style={{
                    "--daypart-color": daypart.color,
                    "--daypart-text-color": contrastTextColor(daypart.color),
                    top: `${top}%`,
                    height: `${Math.max(9, bottom - top)}%`,
                    left: `calc(${lane * laneWidth}% + 4px)`,
                    width: `calc(${laneWidth}% - 7px)`,
                  } as CSSProperties}
                  key={daypart.id}
                >
                  <strong>{daypart.name}</strong>
                  <span>{formatLocalMinute(rule.startMinute)}–{formatLocalMinute(rule.endMinute)} · {daypart.type === "house_activity" ? "House activity" : daypart.billingMode === "tracking_only" ? "Client Managed" : rule.defaultDjCount ? `${rule.defaultDjCount} talent target · Standing HFY` : "Standing HFY Booking"}</span>
                  {daypartNeedsDefaultArtistRate(daypart, rateAttentionAudience) ? <i className="daypart-rate-needed-mark" aria-label="Default artist rate needed">!</i> : null}
                  {daypart.billingMode === "billed_by_hfy" ? <i className="hfy-booking-indicator" aria-label="HFY booked" /> : null}
                </button>;
              })}
            </div>;
          })}
        </div>;
        })}
      </div> : readOnly ? <div className="card empty daypart-empty-grid">No weekly Dayparts are configured for this Residency.</div> : <button className="card empty daypart-empty-grid" type="button" onClick={() => setDraft(blankDraft())}>No weekly Dayparts yet. Click to create one.</button>}

      {templatePopover && typeof document !== "undefined" ? (() => {
        const room = residencyRooms.find((item) => item.id === templatePopover.roomId);
        const roomTemplates = calendarOnlyDayparts.filter((daypart) => daypart.roomId === templatePopover.roomId);
        if (!room || !roomTemplates.length) return null;
        return createPortal(<div
          className="room-template-popover"
          id={`room-${room.id}-templates`}
          ref={templatePopoverRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`room-${room.id}-templates-title`}
          style={{ left: templatePopover.left, width: templatePopover.width, maxHeight: templatePopover.maxHeight, top: templatePopover.top, bottom: templatePopover.bottom }}
        >
          <div className="room-template-popover-heading"><div><span>Saved templates</span><strong id={`room-${room.id}-templates-title`}>{room.name}</strong></div><button type="button" aria-label={`Close ${room.name} saved templates`} onClick={() => { setTemplatePopover(null); templateTriggerRef.current?.focus(); }}>×</button></div>
          <div className="room-template-list">{roomTemplates.map((daypart) => {
            const needsRate = !fullProgrammingClient && daypartNeedsDefaultArtistRate(daypart, rateAttentionAudience);
            const disabled = readOnly || (fullProgrammingClient && daypart.type === "dj_artist");
            const typeLabel = daypart.type === "house_activity" ? "House Activity" : "Talent Activity";
            const hoursLabel = `${formatLocalMinute(daypart.suggestedStartMinute ?? 1080)}–${formatLocalMinute(daypart.suggestedEndMinute ?? 1260)}`;
            return <button className={`calendar-only-daypart-card ${needsRate ? "needs-rate" : ""} room-template-card`} type="button" disabled={disabled} aria-label={`${disabled ? "Saved template" : "Edit saved template"} ${daypart.name}: ${typeLabel}, default hours ${hoursLabel}`} onClick={disabled ? undefined : () => { setTemplatePopover(null); setDraft(draftFromDaypart(daypart)); }} key={daypart.id} style={{ "--daypart-color": daypart.color, "--daypart-text-color": contrastTextColor(daypart.color) } as CSSProperties}><span aria-hidden="true" /><div><strong>{daypart.name}</strong><small>{typeLabel}</small></div><div className="calendar-only-daypart-meta"><em>Default hours</em><span>{hoursLabel}</span>{needsRate ? <b>! Rate needed</b> : null}</div></button>;
          })}</div>
        </div>, document.body);
      })() : null}

      {roomDraft ? <div className="room-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setRoomDraft(null); }}><aside className="room-editor-panel" role="dialog" aria-modal="true" aria-labelledby="room-editor-title"><div className="room-editor-heading"><div><p className="eyebrow">Room &amp; space</p><h2 id="room-editor-title">Edit room</h2></div><button className="quick-modal-close" type="button" aria-label="Close room editor" onClick={() => setRoomDraft(null)}>×</button></div><div className="room-editor-body"><div className="field"><label htmlFor="room-editor-name">Room name</label><input id="room-editor-name" value={roomDraft.name} onChange={(event) => setRoomDraft({ ...roomDraft, name: event.target.value })} maxLength={160} autoFocus required /></div><div className="field"><label>Room color</label><RoomHuePicker value={roomDraft.hue} onChange={(hue) => setRoomDraft({ ...roomDraft, hue })} ariaLabel={`Choose the room color for ${roomDraft.name}`} /><small>Saving updates the room name everywhere and recolors its Dayparts and reusable templates across four high-contrast shades.</small></div><div className="daypart-danger-zone"><div><strong>Delete room</strong><small>Only an empty room can be deleted. Existing Dayparts, templates, and dated Calendar activities are always preserved.</small></div><button className="remove-dj-button" type="button" disabled={roomPending || roomDeletePending} onClick={() => void deleteRoom()}>{roomDeletePending ? "Deleting…" : "Delete room"}</button></div>{roomState.status === "error" ? <p className="error" aria-live="polite">{roomState.message}</p> : null}</div><div className="room-editor-actions"><button className="button secondary" type="button" disabled={roomPending || roomDeletePending} onClick={() => setRoomDraft(null)}>Cancel</button><button className="button" type="button" disabled={roomPending || roomDeletePending || !roomDraft.name.trim()} onClick={() => void saveRoom()}>{roomPending ? "Saving…" : "Save room"}</button></div></aside></div> : roomState.status === "success" ? <p className="success" aria-live="polite">{roomState.message}</p> : null}

      {draft ? (
        <div className="daypart-drawer-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDraft(null); }}>
          <aside className="daypart-drawer" role="dialog" aria-modal="true" aria-labelledby="daypart-editor-title">
            <form className="daypart-editor" action={formAction} onSubmit={(event) => {
              if (draft.scheduleMode === "calendar_only" || draft.rules.some((rule) => rule.enabled && rule.start && rule.end)) return;
              event.preventDefault();
              setDateValidationRequested(true);
            }}>
              <input name="payload" type="hidden" value={payload} />
              <div className="daypart-editor-heading"><div><p className="eyebrow">{draft.id ? draft.scheduleMode === "calendar_only" ? "Edit reusable template" : "Edit Daypart" : "New Daypart"}</p><h2 id="daypart-editor-title">{draft.id ? draft.name : draft.scheduleMode === "calendar_only" ? "Create reusable template" : "Add standing hours"}</h2></div><button className="quick-modal-close" type="button" aria-label="Close Daypart editor" onClick={() => setDraft(null)}>×</button></div>
              <div className="daypart-editor-scroll">
                <div className="field"><label>Type</label><div className="daypart-type-options">{fullProgrammingClient ? null : <button className={draft.type === "dj_artist" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, type: "dj_artist", billingMode: draft.type === "dj_artist" ? draft.billingMode : null })}><strong>Talent Activity</strong><small>Schedule programming with talent. Assignments and financial tracking follow the billing choice you select next.</small></button>}<button className={draft.type === "house_activity" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, type: "house_activity", billingMode: null, defaultTalentRate: "", clientDefaultRate: "", rules: draft.rules.map((rule) => ({ ...rule, defaultDjCount: "0" })) })}><strong>House Activity</strong><small>Schedule an activity or optional host without creating talent financial records.</small></button></div></div>
                {draft.type === "dj_artist" && !fullProgrammingClient ? <div className="field daypart-billing-step"><label>Billing</label><div className="daypart-type-options"><button className={draft.billingMode === "billed_by_hfy" ? "active standing-hfy" : "standing-hfy"} type="button" onClick={() => setDraft({ ...draft, billingMode: "billed_by_hfy", clientDefaultRate: "" })}><strong>Standing HFY Booking</strong><small>HFY handles talent and billing for every occurrence of this Daypart automatically — no per-date request needed.</small></button><button className={draft.billingMode === "tracking_only" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, billingMode: "tracking_only", defaultTalentRate: "" })}><strong>Client Managed</strong><small>You handle talent and billing yourself. You can still request HFY for individual dates from the Calendar.</small></button></div></div> : null}
                {draft.type ? <div className="field daypart-schedule-step"><label>Choose the schedule type up front</label><div className="daypart-type-options"><button className={draft.scheduleMode === "standing_weekly" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, scheduleMode: "standing_weekly" })}><strong>Recurring Daypart</strong><small>Automatically appears on the weekdays you select.</small></button><button className={draft.scheduleMode === "calendar_only" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, scheduleMode: "calendar_only" })}><strong>Reusable One-off Template</strong><small>Save this as a reusable one-off template you can schedule onto any date later.</small></button></div></div> : null}
                {draft.type && (draft.type === "house_activity" || draft.billingMode) && draft.scheduleMode ? <>
                {draft.scheduleMode === "calendar_only" ? <div className="template-defaults-note" role="note"><strong>Template defaults only</strong><span>Name, type, billing, and recommended hours prefill the next date you schedule. Saving changes here never updates dates already scheduled, and you can override the time or details for any individual date.</span></div> : null}
                <div className="row"><div className="field"><label>Name</label><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Vinyl Night" required /></div><div className="field"><label>Room / space</label><RoomCombobox rooms={residencyRooms} value={draft.room} selectedRoomId={draft.roomId} creationConfirmed={draft.createRoom} placeholder="Start typing, for example Amigo" ariaLabel="Daypart room or space" onChange={updateDraftRoom} onSelect={selectDraftRoom} onCreate={selectNewDraftRoom} /></div></div>
                <div className="daypart-definition-row">
                  <div className="field daypart-color-field"><label>{draft.roomId ? "Room color shade" : draft.createRoom ? "New room color" : "Room color"}</label>{draft.roomId && draft.roomHue ? <><DaypartColorPicker ariaLabel={`${draft.room} color shades`} hue={draft.roomHue} value={draft.color} onChange={(color) => setDraft({ ...draft, color })} /><small>Choose from four high-contrast shades. The room’s hue stays fixed.{draft.billingMode === "billed_by_hfy" ? " HFY status appears as a pink corner marker." : ""}</small></> : draft.createRoom && draft.roomHue ? <><RoomHuePicker value={draft.roomHue} onChange={(roomHue) => setDraft({ ...draft, roomHue, color: roomDaypartColor(roomHue, 0) })} ariaLabel={`Choose the room color for ${draft.room}`} /><small>The next automatic color is preselected. This first Daypart uses its dark shade.</small></> : <><div className="daypart-color-control"><span style={{ background: draft.color }} aria-hidden="true" /><strong>Choose a room</strong></div><small>Select an existing room or explicitly create a new space above.</small></>}</div>
                  {!hideFinancials && draft.type === "dj_artist" && draft.billingMode === "billed_by_hfy" ? <div className={`field daypart-rate-field ${draftNeedsRate ? "needs-attention" : ""}`}><label>Default talent rate ($/hr) {draftNeedsRate ? <span className="daypart-rate-needed-label">Needed</span> : null}</label><SensitiveInput type="number" min="0" step="0.01" value={draft.defaultTalentRate} onChange={(event) => setDraft({ ...draft, defaultTalentRate: event.target.value })} placeholder="Enter the hourly rate" /><small>Required before HFY OS can calculate artist pay for this Daypart. You can save now and finish it later.</small></div> : null}
                  {draft.type === "dj_artist" && draft.billingMode === "tracking_only" ? <div className={`field daypart-rate-field ${draftNeedsRate ? "needs-attention" : ""}`}><label>Default artist rate ($/hr) {draftNeedsRate ? <span className="daypart-rate-needed-label">Needed</span> : null}</label><input name="clientDefaultRate" type="number" min="0" step="0.01" value={draft.clientDefaultRate} onChange={(event) => setDraft({ ...draft, clientDefaultRate: event.target.value })} placeholder="Enter the hourly rate" /><small>Required before HFY OS can calculate what the artist is owed. You can override a specific date in Payouts.</small></div> : null}
                  <div className="field"><label>Active until <span>optional</span></label><input type="date" value={draft.activeUntil} onChange={(event) => setDraft({ ...draft, activeUntil: event.target.value })} /><small>Blank means this Daypart continues indefinitely.</small></div>
                </div>
                <label className="checkbox-row"><input checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} type="checkbox" /> Active Daypart</label>
                {draft.scheduleMode === "calendar_only" ? <div className="week-rule-selection calendar-only-hours"><div className="week-rule-intro"><div><strong>Recommended default hours</strong><small>These hours prefill only the next date you schedule. You can adjust them for that date without changing the template.</small></div></div><div className="quick-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel="Reusable template default start time" value={draft.suggestedStart} onChange={(suggestedStart) => setDraft({ ...draft, suggestedStart })} stepMinutes={15} required /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel="Reusable template default end time" value={draft.suggestedEnd} onChange={(suggestedEnd) => setDraft({ ...draft, suggestedEnd })} stepMinutes={15} required /></div></div></div> : <>
                <div className={`week-rule-selection ${showDateValidation ? "invalid" : ""}`} ref={dateSectionRef} role="group" aria-labelledby="daypart-weekly-hours-label" aria-describedby={showDateValidation ? "daypart-date-validation" : undefined}>
                <div className="week-rule-intro"><div><strong id="daypart-weekly-hours-label">Weekly hours</strong><small>Select every day this Daypart runs. Each day can keep different hours.</small></div><button className="button secondary" type="button" title="Copy the first selected day’s start and end times to the other selected days" onClick={applyToAllSelected}>Sync times to selected days</button></div>
                {showDateValidation ? <p className="week-rule-validation" id="daypart-date-validation" role="alert">Please pick a date.</p> : null}
                <div className="week-rule-grid">
                  {draft.rules.map((rule, weekday) => (
                    <div className={`week-rule ${rule.enabled ? "enabled" : ""}`} key={weekdayNames[weekday]}>
                      <button className="week-toggle" type="button" aria-pressed={rule.enabled} onClick={() => toggleRule(weekday)}>{weekdayNames[weekday].slice(0, 3)}</button>
                      {rule.enabled ? <div className="week-rule-fields"><div className="field"><label>Start</label><TimeSelect ariaLabel={`${weekdayNames[weekday]} start time`} value={rule.start} onChange={(start) => updateRule(weekday, { start })} required /></div><div className="field"><label>End</label><TimeSelect ariaLabel={`${weekdayNames[weekday]} end time`} value={rule.end} onChange={(end) => updateRule(weekday, { end })} required /></div>{draft.type === "dj_artist" ? <div className="field"><label>Talent count <span>optional</span></label><input type="number" min="0" max="20" value={rule.defaultDjCount} onChange={(event) => updateRule(weekday, { defaultDjCount: event.target.value })} /></div> : null}</div> : <p>Off</p>}
                    </div>
                  ))}
                </div>
                </div>
                </>}
                {draft.type === "dj_artist" ? <p className="privacy-note">{draft.scheduleMode === "calendar_only" ? "Reusable one-off templates never appear until someone schedules a specific date. Each scheduled date keeps its own saved details." : "Talent count is optional. Leave it at 0 when the number of registered artists changes by date."}</p> : <p className="privacy-note">House Activities never create Artist, Assignment, Payout, or Invoice records.</p>}
                {draft.id ? <div className="daypart-danger-zone"><div><strong>{draft.scheduleMode === "calendar_only" ? "Remove template" : "Remove Daypart"}</strong><small>Unused {draft.scheduleMode === "calendar_only" ? "templates" : "Dayparts"} are deleted. Anything with scheduled or historical records is archived so its history stays intact.</small></div><button className="remove-dj-button" type="button" disabled={removePending} onClick={removeCurrentDaypart}>{removePending ? "Removing…" : draft.scheduleMode === "calendar_only" ? "Delete / archive template" : "Delete / archive Daypart"}</button></div> : null}
                </> : <div className="card empty daypart-type-gate">{!draft.type ? "Choose Talent Activity or House Activity to continue." : draft.type === "dj_artist" && !draft.billingMode ? "Choose Standing HFY Booking or Client Managed to continue." : "Choose Recurring Daypart or Reusable One-off Template to continue."}</div>}
                {state.status === "error" && !missingDateServerError ? <p className="error" aria-live="polite">{state.message}</p> : null}
                {removeState.status === "error" ? <p className="error" aria-live="polite">{removeState.message}</p> : null}
              </div>
              <div className="daypart-editor-actions"><button className="button secondary" type="button" onClick={() => setDraft(null)}>Cancel</button>{draft.type && (draft.type === "house_activity" || draft.billingMode) && draft.scheduleMode ? <button className="button" disabled={pending || !hasSelectedRoom} type="submit">{pending ? "Saving…" : draft.scheduleMode === "calendar_only" ? "Save template" : "Save Daypart"}</button> : null}</div>
            </form>
          </aside>
        </div>
      ) : state.message ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    </section>
  );
}
