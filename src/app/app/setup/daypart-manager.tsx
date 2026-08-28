"use client";

import { useActionState, useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { removeDaypartAction, saveDaypartAction, type ResidencyActionState } from "@/app/app/actions";
import { clockToMinute, formatLocalMinute, minuteToClock, resolveEndMinute, weekdayNames, type DaypartBillingMode, type DaypartType } from "@/domain/dayparts";
import { SensitiveInput } from "@/components/privacy-mode";
import { TimeSelect } from "@/components/time-select";

export type DaypartRow = {
  id: string;
  name: string;
  room: string;
  color: string;
  type: DaypartType;
  billingMode: DaypartBillingMode | null;
  defaultTalentRateCents: number | null;
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
  billingMode: DaypartBillingMode;
  defaultTalentRate: string;
  activeUntil: string;
  active: boolean;
  sortOrder: number;
  rules: RuleDraft[];
};

const initialActionState: ResidencyActionState = { status: "idle", message: "" };
const colorPresets = ["#2783DC", "#E98332", "#7A65D1", "#2E9E79", "#D04F75", "#D6A11D", "#244C76"];

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

function blankDraft(options: { room?: string; weekday?: number; startMinute?: number; color?: string } = {}): EditorDraft {
  const startMinute = options.startMinute ?? 1080;
  const endMinute = startMinute + 180;
  return {
    name: "",
    room: options.room ?? "",
    color: options.color ?? colorPresets[0],
    billingMode: "billed_by_hfy",
    defaultTalentRate: "",
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
    color: daypart.color,
    billingMode: daypart.type === "house_activity" ? "tracking_only" : daypart.billingMode ?? "billed_by_hfy",
    defaultTalentRate: daypart.defaultTalentRateCents === null ? "" : (daypart.defaultTalentRateCents / 100).toFixed(2),
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

export function DaypartManager({ residencyId, dayparts, onSaved, readOnly = false }: { residencyId: string; dayparts: DaypartRow[]; onSaved?: () => void; readOnly?: boolean }) {
  const [draft, setDraft] = useState<EditorDraft | null>(null);
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
  const rooms = useMemo(() => [...new Set(dayparts.map((daypart) => daypart.room))].sort(), [dayparts]);
  const range = useMemo(() => displayRange(dayparts), [dayparts]);
  const rangeMinutes = range.end - range.start;

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

  const payload = useMemo(() => {
    if (!draft) return "";
    return JSON.stringify({
      id: draft.id,
      residencyId,
      name: draft.name,
      room: draft.room,
      color: draft.color,
      billingMode: draft.billingMode,
      defaultTalentRateCents: draft.billingMode === "billed_by_hfy" ? centsFromOptionalDollars(draft.defaultTalentRate) : null,
      activeUntil: draft.activeUntil || null,
      active: draft.active,
      sortOrder: draft.sortOrder,
      rules: draft.rules.flatMap((rule, weekday) => {
        if (!rule.enabled || !rule.start || !rule.end) return [];
        const startMinute = clockToMinute(rule.start);
        return [{ weekday, startMinute, endMinute: resolveEndMinute(startMinute, rule.end), defaultDjCount: optionalDjCount(rule.defaultDjCount) }];
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

  function addFromGrid(room: string, weekday: number, event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const clickedMinute = Math.round((range.start + ratio * rangeMinutes) / 30) * 30;
    const startMinute = Math.min(clickedMinute, range.end - 60);
    const nextColor = colorPresets[dayparts.length % colorPresets.length];
    setDraft(blankDraft({ room, weekday, startMinute, color: nextColor }));
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
      <div className="section-heading"><div><p className="eyebrow">Standing schedule</p><h2>Weekly Daypart grid</h2><p className="subhead">Every colored block projects onto the calendar until it is scheduled.</p></div>{readOnly ? null : <button className="button" type="button" onClick={() => setDraft(blankDraft({ color: colorPresets[dayparts.length % colorPresets.length] }))}>+ Add Daypart</button>}</div>

      {rooms.length ? <div className="daypart-week-board" style={{ "--daypart-grid-start": range.start, "--daypart-grid-end": range.end } as CSSProperties}>
        <div className="daypart-week-corner"><strong>Room</strong><span>{formatLocalMinute(range.start)}–{formatLocalMinute(range.end)}</span></div>
        {weekdayNames.map((weekday) => <div className="daypart-week-heading" key={weekday}>{weekday.slice(0, 3)}</div>)}
        {rooms.map((room) => <div className="daypart-week-row" key={room}>
          <div className="daypart-room-label"><strong>{room}</strong><span>Click open space to add</span></div>
          {weekdayNames.map((weekdayName, weekday) => {
            const blocks = dayparts.flatMap((daypart) => {
              if (daypart.room !== room) return [];
              const rule = daypart.rules.find((item) => item.weekday === weekday);
              return rule ? [{ daypart, rule }] : [];
            });
            return <div className="daypart-week-cell" key={`${room}-${weekdayName}`}>
              {readOnly ? null : <button className="daypart-week-add" type="button" aria-label={`Add a Daypart in ${room} on ${weekdayName}`} onClick={(event) => addFromGrid(room, weekday, event)}><span>+</span></button>}
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
                    "--daypart-color": daypart.color,
                    top: `${top}%`,
                    height: `${Math.max(9, bottom - top)}%`,
                    left: `calc(${lane * laneWidth}% + 4px)`,
                    width: `calc(${laneWidth}% - 7px)`,
                  } as CSSProperties}
                  key={daypart.id}
                >
                  <strong>{daypart.name}</strong>
                  <span>{formatLocalMinute(rule.startMinute)}–{formatLocalMinute(rule.endMinute)} · {daypart.billingMode === "tracking_only" || daypart.type === "house_activity" ? "Tracking only" : rule.defaultDjCount ? `${rule.defaultDjCount} talent target` : "Billed by HFY"}</span>
                </button>;
              })}
            </div>;
          })}
        </div>)}
      </div> : readOnly ? <div className="card empty daypart-empty-grid">No Dayparts are configured for this Residency.</div> : <button className="card empty daypart-empty-grid" type="button" onClick={() => setDraft(blankDraft())}>No Dayparts yet. Click to create the first room schedule.</button>}

      {draft ? (
        <div className="daypart-drawer-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDraft(null); }}>
          <aside className="daypart-drawer" role="dialog" aria-modal="true" aria-labelledby="daypart-editor-title">
            <form className="daypart-editor" action={formAction}>
              <input name="payload" type="hidden" value={payload} />
              <div className="daypart-editor-heading"><div><p className="eyebrow">{draft.id ? "Edit Daypart" : "New Daypart"}</p><h2 id="daypart-editor-title">{draft.id ? draft.name : "Add standing hours"}</h2></div><button className="quick-modal-close" type="button" aria-label="Close Daypart editor" onClick={() => setDraft(null)}>×</button></div>
              <div className="daypart-editor-scroll">
                <div className="field"><label>How is this Daypart handled?</label><div className="daypart-type-options"><button className={draft.billingMode === "billed_by_hfy" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, billingMode: "billed_by_hfy" })}><strong>Billed by HFY</strong><small>Creates the client billing record. Registered talent also receives an Assignment and Payout.</small></button><button className={draft.billingMode === "tracking_only" ? "active" : ""} type="button" onClick={() => setDraft({ ...draft, billingMode: "tracking_only", defaultTalentRate: "" })}><strong>Tracking only</strong><small>Calendar only. Program details and optional talent or a host can still be added.</small></button></div></div>
                <div className="row"><div className="field"><label>Name</label><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Vinyl Night" required /></div><div className="field"><label>Room / space</label><input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} placeholder="Amigo Room" required /></div></div>
                <div className="daypart-definition-row">
                  <div className="field daypart-color-field"><label>Calendar color</label><div className="daypart-color-control"><input aria-label="Daypart color" type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value.toUpperCase() })} /><strong>{draft.color}</strong></div><div className="daypart-color-presets">{colorPresets.map((color) => <button aria-label={`Use ${color}`} className={draft.color === color ? "active" : ""} type="button" style={{ background: color }} onClick={() => setDraft({ ...draft, color })} key={color} />)}</div></div>
                  {draft.billingMode === "billed_by_hfy" ? <div className="field"><label>Default talent rate ($/hr) <span>optional</span></label><SensitiveInput type="number" min="0" step="0.01" value={draft.defaultTalentRate} onChange={(event) => setDraft({ ...draft, defaultTalentRate: event.target.value })} placeholder="Uses Residency default" /></div> : null}
                  <div className="field"><label>Active until <span>optional</span></label><input type="date" value={draft.activeUntil} onChange={(event) => setDraft({ ...draft, activeUntil: event.target.value })} /><small>Blank means this Daypart continues indefinitely.</small></div>
                </div>
                <label className="checkbox-row"><input checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} type="checkbox" /> Active Daypart</label>
                <div className="week-rule-intro"><div><strong>Weekly hours</strong><small>Select every day this Daypart runs. Each day can keep different hours.</small></div><button className="button secondary" type="button" title="Copy the first selected day’s start and end times to the other selected days" onClick={applyToAllSelected}>Sync times to selected days</button></div>
                <div className="week-rule-grid">
                  {draft.rules.map((rule, weekday) => (
                    <div className={`week-rule ${rule.enabled ? "enabled" : ""}`} key={weekdayNames[weekday]}>
                      <button className="week-toggle" type="button" aria-pressed={rule.enabled} onClick={() => toggleRule(weekday)}>{weekdayNames[weekday].slice(0, 3)}</button>
                      {rule.enabled ? <div className="week-rule-fields"><div className="field"><label>Start</label><TimeSelect ariaLabel={`${weekdayNames[weekday]} start time`} value={rule.start} onChange={(start) => updateRule(weekday, { start })} required /></div><div className="field"><label>End</label><TimeSelect ariaLabel={`${weekdayNames[weekday]} end time`} value={rule.end} onChange={(end) => updateRule(weekday, { end })} required /></div><div className="field"><label>Talent count <span>optional</span></label><input type="number" min="0" max="20" value={rule.defaultDjCount} onChange={(event) => updateRule(weekday, { defaultDjCount: event.target.value })} /></div></div> : <p>Off</p>}
                    </div>
                  ))}
                </div>
                <p className="privacy-note">Talent count is optional. Leave it at 0 when the Daypart may have no talent, a typed-in host, or a changing number of registered artists.</p>
                {draft.id ? <div className="daypart-danger-zone"><div><strong>Remove Daypart</strong><small>Unused Dayparts are deleted. Anything with scheduled or historical records is archived so its history stays intact.</small></div><button className="remove-dj-button" type="button" disabled={removePending} onClick={removeCurrentDaypart}>{removePending ? "Removing…" : "Delete / archive Daypart"}</button></div> : null}
                {state.status === "error" ? <p className="error" aria-live="polite">{state.message}</p> : null}
                {removeState.status === "error" ? <p className="error" aria-live="polite">{removeState.message}</p> : null}
              </div>
              <div className="daypart-editor-actions"><button className="button secondary" type="button" onClick={() => setDraft(null)}>Cancel</button><button className="button" disabled={pending} type="submit">{pending ? "Saving…" : "Save Daypart"}</button></div>
            </form>
          </aside>
        </div>
      ) : state.message ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    </section>
  );
}
