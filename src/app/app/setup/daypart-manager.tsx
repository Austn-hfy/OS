"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { removeDaypartAction, saveDaypartAction, type ResidencyActionState } from "@/app/app/actions";
import { DAYPART_COLOR_PRESETS, DEFAULT_DAYPART_COLOR, HFY_BOOKED_COLOR, clockToMinute, formatLocalMinute, minuteToClock, resolveEndMinute, weekdayNames, type DaypartBillingMode, type DaypartScheduleMode, type DaypartType } from "@/domain/dayparts";
import { DaypartColorPicker } from "@/components/daypart-color-picker";
import { SensitiveInput } from "@/components/privacy-mode";
import { TimeSelect } from "@/components/time-select";

export type DaypartRow = {
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
  clientDefaultRateCents: number | null;
  activeUntil: string | null;
  active: boolean;
  sortOrder: number;
  rules: Array<{ weekday: number; startMinute: number; endMinute: number; defaultDjCount: number | null }>;
};

type RuleDraft = { enabled: boolean; start: string; end: string; defaultDjCount: string };
type EditorDraft = {
  id?: string;
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

const initialActionState: ResidencyActionState = { status: "idle", message: "" };

function rotatingPresetColor(index: number): string {
  return DAYPART_COLOR_PRESETS[index % DAYPART_COLOR_PRESETS.length].value;
}

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

function blankDraft(options: { room?: string; weekday?: number; startMinute?: number; endMinute?: number; color?: string } = {}): EditorDraft {
  const startMinute = options.startMinute ?? 1080;
  const endMinute = options.endMinute ?? startMinute + 180;
  return {
    name: "",
    room: options.room ?? "",
    color: options.color ?? DAYPART_COLOR_PRESETS[0].value,
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
    name: daypart.name,
    room: daypart.room,
    color: daypart.billingMode === "billed_by_hfy" ? HFY_BOOKED_COLOR : daypart.color,
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

export function DaypartManager({ residencyId, dayparts, onSaved, readOnly = false, hideFinancials = false, initialCreate = false }: { residencyId: string; dayparts: DaypartRow[]; onSaved?: () => void; readOnly?: boolean; hideFinancials?: boolean; initialCreate?: boolean }) {
  const [draft, setDraft] = useState<EditorDraft | null>(null);
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
  const standingDayparts = useMemo(() => dayparts.filter((daypart) => daypart.scheduleMode === "standing_weekly"), [dayparts]);
  const calendarOnlyDayparts = useMemo(() => dayparts.filter((daypart) => daypart.scheduleMode === "calendar_only"), [dayparts]);
  const rooms = useMemo(() => [...new Set(standingDayparts.map((daypart) => daypart.room))].sort(), [standingDayparts]);
  const range = useMemo(() => displayRange(standingDayparts), [standingDayparts]);
  const rangeMinutes = range.end - range.start;
  const hasSelectedDay = draft?.scheduleMode === "calendar_only" || (draft?.rules.some((rule) => rule.enabled && rule.start && rule.end) ?? false);
  const missingDateServerError = state.status === "error" && state.message === "Select at least one operating day.";
  const showDateValidation = Boolean(draft) && !hasSelectedDay && (dateValidationRequested || missingDateServerError);

  useEffect(() => {
    if (!initialCreate || readOnly || openedInitialDraft.current) return;
    openedInitialDraft.current = true;
    setDraft(blankDraft({ color: rotatingPresetColor(dayparts.length) }));
  }, [dayparts.length, initialCreate, readOnly]);

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

  function addFromGrid(room: string, weekday: number) {
    const roomRule = dayparts
      .filter((daypart) => daypart.scheduleMode === "standing_weekly" && daypart.room === room)
      .flatMap((daypart) => daypart.rules)
      .find((rule) => rule.weekday === weekday)
      ?? standingDayparts.find((daypart) => daypart.room === room)?.rules[0];
    const nextColor = rotatingPresetColor(dayparts.length);
    setDraft(blankDraft({
      room,
      weekday,
      startMinute: roomRule?.startMinute,
      endMinute: roomRule?.endMinute,
      color: nextColor,
    }));
  }

  async function removeCurrentDaypart() {
    if (!draft?.id) return;
    const confirmed = window.confirm("Remove this Daypart? If it has any scheduled or historical records, HFY OS will archive it and preserve that history. Otherwise it will be permanently deleted.");
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
      <div className="section-heading daypart-workspace-heading"><div><p className="eyebrow">Standing schedule</p><h2>Weekly Daypart grid</h2><p className="subhead">Every colored block projects onto the calendar until it is scheduled.</p></div>{readOnly ? null : <button className="button" type="button" onClick={() => setDraft(blankDraft({ color: rotatingPresetColor(dayparts.length) }))}>+ Add Daypart</button>}</div>

      {rooms.length ? <div className="daypart-week-board" style={{ "--daypart-grid-start": range.start, "--daypart-grid-end": range.end } as CSSProperties}>
        <div className="daypart-week-corner"><strong>Room</strong><span>{formatLocalMinute(range.start)}–{formatLocalMinute(range.end)}</span></div>
        {weekdayNames.map((weekday) => <div className="daypart-week-heading" key={weekday}>{weekday.slice(0, 3)}</div>)}
        {rooms.map((room) => <div className="daypart-week-row" key={room}>
          <div className="daypart-room-label"><strong>{room}</strong><span>Click open space to add</span></div>
          {weekdayNames.map((weekdayName, weekday) => {
            const blocks = standingDayparts.flatMap((daypart) => {
              if (daypart.room !== room) return [];
              const rule = daypart.rules.find((item) => item.weekday === weekday);
              return rule ? [{ daypart, rule }] : [];
            });
            return <div className="daypart-week-cell" key={`${room}-${weekdayName}`}>
              {readOnly ? null : <button className="daypart-week-add" type="button" aria-label={`Add a Daypart in ${room} on ${weekdayName}`} onClick={() => addFromGrid(room, weekday)}><span>+</span></button>}
              {blocks.map(({ daypart, rule }) => {
                const top = Math.max(0, ((rule.startMinute - range.start) / rangeMinutes) * 100);
                const bottom = Math.min(100, ((rule.endMinute - range.start) / rangeMinutes) * 100);
                const overlapping = blocks.filter((block) => block.rule.startMinute < rule.endMinute && block.rule.endMinute > rule.startMinute).sort((left, right) => left.rule.startMinute - right.rule.startMinute || left.daypart.name.localeCompare(right.daypart.name));
                const lane = Math.max(0, overlapping.findIndex((block) => block.daypart.id === daypart.id));
                const laneWidth = 100 / overlapping.length;
                return <button
                  className={`daypart-week-block ${daypart.active ? "" : "inactive"}`}
                  type="button"
                  title={`Edit ${daypart.name}`}
                  onClick={readOnly ? undefined : () => setDraft(draftFromDaypart(daypart))}
                  style={{
                    "--daypart-color": daypart.billingMode === "billed_by_hfy" ? HFY_BOOKED_COLOR : daypart.color,
                    top: `${top}%`,
                    height: `${Math.max(9, bottom - top)}%`,
                    left: `calc(${lane * laneWidth}% + 4px)`,
                    width: `calc(${laneWidth}% - 7px)`,
                  } as CSSProperties}
                  key={daypart.id}
                >
                  <strong>{daypart.name}</strong>
                  <span>{formatLocalMinute(rule.startMinute)}–{formatLocalMinute(rule.endMinute)} · {daypart.type === "house_activity" ? "House activity" : daypart.billingMode === "tracking_only" ? "Client Managed" : rule.defaultDjCount ? `${rule.defaultDjCount} talent target · Standing HFY` : "Standing HFY Booking"}</span>
                </button>;
              })}
            </div>;
          })}
        </div>)}
      </div> : readOnly ? <div className="card empty daypart-empty-grid">No standing weekly Dayparts are configured for this Residency.</div> : <button className="card empty daypart-empty-grid" type="button" onClick={() => setDraft(blankDraft())}>No standing weekly Dayparts yet. Click to create one, or manage Calendar Only choices below.</button>}

      {calendarOnlyDayparts.length ? <section className="calendar-only-dayparts"><div className="section-heading"><div><p className="eyebrow">Calendar only</p><h3>On-demand Dayparts</h3><p className="subhead">Saved choices that appear when scheduling a date but never project onto the weekly calendar.</p></div></div><div className="calendar-only-daypart-list">{calendarOnlyDayparts.map((daypart) => <button className="calendar-only-daypart-card" type="button" disabled={readOnly} onClick={readOnly ? undefined : () => setDraft(draftFromDaypart(daypart))} key={daypart.id} style={{ "--daypart-color": daypart.billingMode === "billed_by_hfy" ? HFY_BOOKED_COLOR : daypart.color } as CSSProperties}><span aria-hidden="true" /><div><strong>{daypart.name}</strong><small>{daypart.room} · {formatLocalMinute(daypart.suggestedStartMinute ?? 1080)}–{formatLocalMinute(daypart.suggestedEndMinute ?? 1260)}</small></div><em>{daypart.type === "house_activity" ? "House Activity" : daypart.billingMode === "tracking_only" ? "Client Managed" : "HFY Booking"}</em></button>)}</div></section> : null}

      {draft ? (
        <div className="daypart-drawer-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDraft(null); }}>
          <aside className="daypart-drawer" role="dialog" aria-modal="true" aria-labelledby="daypart-editor-title">
            <form className="daypart-editor" action={formAction} onSubmit={(event) => {
              if (draft.scheduleMode === "calendar_only" || draft.rules.some((rule) => rule.enabled && rule.start && rule.end)) return;
              event.preventDefault();
              setDateValidationRequested(true);
            }}>
              <input name="payload" type="hidden" value={payload} />
              <div className="daypart-editor-heading"><div><p className="eyebrow">{draft.id ? "Edit Daypart" : "New Daypart"}</p><h2 id="daypart-editor-title">{draft.id ? draft.name : "Add standing hours"}</h2></div><button className="quick-modal-close" type="button" aria-label="Close Daypart editor" onClick={() => setDraft(null)}>×</button></div>
              <div className="daypart-editor-scroll">
                <div className="field"><label>Type</label><div className="daypart-type-options"><button className={draft.type === "dj_artist" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, type: "dj_artist", billingMode: draft.type === "dj_artist" ? draft.billingMode : null })}><strong>Talent Activity</strong><small>Schedule programming with talent. Assignments and financial tracking follow the billing choice you select next.</small></button><button className={draft.type === "house_activity" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, type: "house_activity", billingMode: null, color: draft.color === HFY_BOOKED_COLOR ? DEFAULT_DAYPART_COLOR : draft.color, defaultTalentRate: "", clientDefaultRate: "", rules: draft.rules.map((rule) => ({ ...rule, defaultDjCount: "0" })) })}><strong>House Activity</strong><small>Schedule an activity, optional host, or registered talent without financial records.</small></button></div></div>
                {draft.type === "dj_artist" ? <div className="field daypart-billing-step"><label>Billing</label><div className="daypart-type-options"><button className={draft.billingMode === "billed_by_hfy" ? "active standing-hfy" : "standing-hfy"} type="button" onClick={() => setDraft({ ...draft, billingMode: "billed_by_hfy", color: HFY_BOOKED_COLOR, clientDefaultRate: "" })}><strong>Standing HFY Booking</strong><small>HFY handles talent and billing for every occurrence of this Daypart automatically — no per-date request needed.</small></button><button className={draft.billingMode === "tracking_only" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, billingMode: "tracking_only", color: draft.color === HFY_BOOKED_COLOR ? DEFAULT_DAYPART_COLOR : draft.color, defaultTalentRate: "" })}><strong>Client Managed</strong><small>You handle talent and billing yourself. You can still request HFY for individual dates from the Calendar.</small></button></div></div> : null}
                {draft.type && (draft.type === "house_activity" || draft.billingMode) ? <div className="field daypart-schedule-step"><label>When does this run?</label><div className="daypart-type-options"><button className={draft.scheduleMode === "standing_weekly" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, scheduleMode: "standing_weekly" })}><strong>Standing weekly</strong><small>Choose one or more weekdays. These dates project onto the Calendar automatically.</small></button><button className={draft.scheduleMode === "calendar_only" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, scheduleMode: "calendar_only" })}><strong>Calendar Only</strong><small>Save this Daypart for occasional use. It appears in the date picker and never repeats automatically.</small></button></div></div> : null}
                {draft.type && (draft.type === "house_activity" || draft.billingMode) && draft.scheduleMode ? <>
                <div className="row"><div className="field"><label>Name</label><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Vinyl Night" required /></div><div className="field"><label>Room / space</label><input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} placeholder="Amigo Room" required /></div></div>
                <div className="daypart-definition-row">
                  {draft.billingMode === "billed_by_hfy" ? <div className="field daypart-color-field"><label>Calendar color</label><div className="daypart-color-control hfy-reserved-color"><span style={{ background: HFY_BOOKED_COLOR }} aria-hidden="true" /><strong>HFY booked</strong></div><small>Reserved pink is applied automatically and cannot be used by Client Managed Dayparts.</small></div> : <div className="field daypart-color-field"><label>Calendar color</label><DaypartColorPicker ariaLabel="Calendar color presets" value={draft.color} onChange={(color) => setDraft({ ...draft, color })} /><small>Colors run left to right by hue, with dark, medium, and light rows. HFY pink remains reserved.</small></div>}
                  {!hideFinancials && draft.type === "dj_artist" && draft.billingMode === "billed_by_hfy" ? <div className="field"><label>Default talent rate ($/hr) <span>optional</span></label><SensitiveInput type="number" min="0" step="0.01" value={draft.defaultTalentRate} onChange={(event) => setDraft({ ...draft, defaultTalentRate: event.target.value })} placeholder="Uses Residency default" /></div> : null}
                  {draft.type === "dj_artist" && draft.billingMode === "tracking_only" ? <div className="field"><label>Default artist rate ($/hr) <span>optional</span></label><input name="clientDefaultRate" type="number" min="0" step="0.01" value={draft.clientDefaultRate} onChange={(event) => setDraft({ ...draft, clientDefaultRate: event.target.value })} placeholder="Set a standard rate" /><small>Applied to each client-managed booking for this Daypart. You can override a specific date in Payment Status.</small></div> : null}
                  <div className="field"><label>Active until <span>optional</span></label><input type="date" value={draft.activeUntil} onChange={(event) => setDraft({ ...draft, activeUntil: event.target.value })} /><small>Blank means this Daypart continues indefinitely.</small></div>
                </div>
                <label className="checkbox-row"><input checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} type="checkbox" /> Active Daypart</label>
                {draft.scheduleMode === "calendar_only" ? <div className="week-rule-selection calendar-only-hours"><div className="week-rule-intro"><div><strong>Suggested hours</strong><small>These prefill each date and can be adjusted when the Daypart is scheduled.</small></div></div><div className="quick-time-fields"><div className="field"><label>Starts</label><TimeSelect ariaLabel="Calendar Only suggested start time" value={draft.suggestedStart} onChange={(suggestedStart) => setDraft({ ...draft, suggestedStart })} stepMinutes={15} required /></div><div className="field"><label>Ends</label><TimeSelect ariaLabel="Calendar Only suggested end time" value={draft.suggestedEnd} onChange={(suggestedEnd) => setDraft({ ...draft, suggestedEnd })} stepMinutes={15} required /></div></div></div> : <>
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
                {draft.type === "dj_artist" ? <p className="privacy-note">{draft.scheduleMode === "calendar_only" ? "Calendar Only Dayparts never appear until someone schedules a specific date." : "Talent count is optional. Leave it at 0 when the number of registered artists changes by date."}</p> : <p className="privacy-note">House Activities never create Artist, Assignment, Payout, or Invoice records.</p>}
                {draft.id ? <div className="daypart-danger-zone"><div><strong>Remove Daypart</strong><small>Unused Dayparts are deleted. Anything with scheduled or historical records is archived so its history stays intact.</small></div><button className="remove-dj-button" type="button" disabled={removePending} onClick={removeCurrentDaypart}>{removePending ? "Removing…" : "Delete / archive Daypart"}</button></div> : null}
                </> : <div className="card empty daypart-type-gate">{!draft.type ? "Choose Talent Activity or House Activity to continue." : draft.type === "dj_artist" && !draft.billingMode ? "Choose Standing HFY Booking or Client Managed to continue." : "Choose Standing weekly or Calendar Only to continue."}</div>}
                {state.status === "error" && !missingDateServerError ? <p className="error" aria-live="polite">{state.message}</p> : null}
                {removeState.status === "error" ? <p className="error" aria-live="polite">{removeState.message}</p> : null}
              </div>
              <div className="daypart-editor-actions"><button className="button secondary" type="button" onClick={() => setDraft(null)}>Cancel</button>{draft.type && (draft.type === "house_activity" || draft.billingMode) && draft.scheduleMode ? <button className="button" disabled={pending} type="submit">{pending ? "Saving…" : "Save Daypart"}</button> : null}</div>
            </form>
          </aside>
        </div>
      ) : state.message ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    </section>
  );
}
