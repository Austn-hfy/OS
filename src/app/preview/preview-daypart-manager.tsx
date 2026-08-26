"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { clockToMinute, formatLocalMinute, minuteToClock, resolveEndMinute, weekdayNames, type DaypartRuleInput } from "@/domain/dayparts";

export type PreviewDaypart = {
  id: string;
  name: string;
  room: string;
  color: string;
  defaultTalentRateCents: number | null;
  activeUntil: string | null;
  active: boolean;
  sortOrder: number;
  rules: DaypartRuleInput[];
};

type RuleDraft = { enabled: boolean; start: string; end: string; defaultDjCount: number };
type Draft = Omit<PreviewDaypart, "id" | "defaultTalentRateCents" | "activeUntil" | "rules"> & {
  id?: string;
  defaultTalentRate: string;
  activeUntil: string;
  rules: RuleDraft[];
};

const colors = ["#2783DC", "#E98332", "#7A65D1", "#2E9E79", "#D04F75", "#D6A11D"];

function blankDraft(room = "", weekday?: number, startMinute = 1080, color = colors[0]): Draft {
  return {
    name: "",
    room,
    color,
    defaultTalentRate: "",
    activeUntil: "",
    active: true,
    sortOrder: 0,
    rules: weekdayNames.map((_, index) => index === weekday
      ? { enabled: true, start: minuteToClock(startMinute), end: minuteToClock(startMinute + 180), defaultDjCount: 1 }
      : { enabled: false, start: "", end: "", defaultDjCount: 1 }),
  };
}

function fromDaypart(daypart: PreviewDaypart): Draft {
  return {
    ...daypart,
    defaultTalentRate: daypart.defaultTalentRateCents === null ? "" : (daypart.defaultTalentRateCents / 100).toFixed(2),
    activeUntil: daypart.activeUntil ?? "",
    rules: weekdayNames.map((_, weekday) => {
      const rule = daypart.rules.find((item) => item.weekday === weekday);
      return rule
        ? { enabled: true, start: minuteToClock(rule.startMinute), end: minuteToClock(rule.endMinute), defaultDjCount: rule.defaultDjCount }
        : { enabled: false, start: "", end: "", defaultDjCount: 1 };
    }),
  };
}

function visibleRange(dayparts: PreviewDaypart[]) {
  const rules = dayparts.flatMap((daypart) => daypart.rules);
  if (!rules.length) return { start: 600, end: 1440 };
  return {
    start: Math.max(0, Math.floor((Math.min(...rules.map((rule) => rule.startMinute)) - 60) / 60) * 60),
    end: Math.min(2879, Math.ceil((Math.max(...rules.map((rule) => rule.endMinute)) + 60) / 60) * 60),
  };
}

export function PreviewDaypartManager({ dayparts, onChange }: { dayparts: PreviewDaypart[]; onChange: (dayparts: PreviewDaypart[]) => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const range = useMemo(() => visibleRange(dayparts), [dayparts]);
  const rangeMinutes = range.end - range.start;
  const rooms = useMemo(() => [...new Set(dayparts.map((daypart) => daypart.room))].sort(), [dayparts]);

  useEffect(() => {
    if (!draft) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [draft]);

  function updateRule(weekday: number, next: Partial<RuleDraft>) {
    setDraft((current) => current ? { ...current, rules: current.rules.map((rule, index) => index === weekday ? { ...rule, ...next } : rule) } : current);
  }

  function openGridDraft(room: string, weekday: number, event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const startMinute = Math.min(Math.round((range.start + ratio * rangeMinutes) / 30) * 30, range.end - 60);
    setDraft(blankDraft(room, weekday, startMinute, colors[dayparts.length % colors.length]));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.name.trim() || !draft.room.trim()) return;
    const rules = draft.rules.flatMap((rule, weekday) => {
      if (!rule.enabled || !rule.start || !rule.end) return [];
      const startMinute = clockToMinute(rule.start);
      return [{ weekday, startMinute, endMinute: resolveEndMinute(startMinute, rule.end), defaultDjCount: rule.defaultDjCount }];
    });
    if (!rules.length) return;
    const rate = draft.defaultTalentRate.trim() ? Math.round(Number(draft.defaultTalentRate) * 100) : null;
    const next: PreviewDaypart = {
      id: draft.id ?? `preview-daypart-${Date.now()}`,
      name: draft.name.trim(),
      room: draft.room.trim(),
      color: draft.color,
      defaultTalentRateCents: Number.isFinite(rate) ? rate : null,
      activeUntil: draft.activeUntil || null,
      active: draft.active,
      sortOrder: draft.sortOrder,
      rules,
    };
    onChange([...dayparts.filter((daypart) => daypart.id !== next.id), next].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)));
    setDraft(null);
  }

  return <section className="daypart-manager">
    <div className="section-heading"><div><p className="eyebrow">Standing schedule</p><h2>Weekly Daypart grid</h2><p className="subhead">Every colored block projects onto the calendar until it is filled with real DJs.</p></div><button className="button" type="button" onClick={() => setDraft(blankDraft("", undefined, 1080, colors[dayparts.length % colors.length]))}>+ Add Daypart</button></div>
    <div className="daypart-week-board">
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
            <button className="daypart-week-add" type="button" aria-label={`Add a Daypart in ${room} on ${weekdayName}`} onClick={(event) => openGridDraft(room, weekday, event)}><span>+</span></button>
            {blocks.map(({ daypart, rule }) => {
              const top = Math.max(0, ((rule.startMinute - range.start) / rangeMinutes) * 100);
              const bottom = Math.min(100, ((rule.endMinute - range.start) / rangeMinutes) * 100);
              const overlapping = blocks.filter((block) => block.rule.startMinute < rule.endMinute && block.rule.endMinute > rule.startMinute).sort((left, right) => left.rule.startMinute - right.rule.startMinute || left.daypart.name.localeCompare(right.daypart.name));
              const lane = Math.max(0, overlapping.findIndex((block) => block.daypart.id === daypart.id));
              const laneWidth = 100 / overlapping.length;
              return <button className={`daypart-week-block ${daypart.active ? "" : "inactive"}`} type="button" onClick={() => setDraft(fromDaypart(daypart))} style={{ "--daypart-color": daypart.color, top: `${top}%`, height: `${Math.max(9, bottom - top)}%`, left: `calc(${lane * laneWidth}% + 4px)`, width: `calc(${laneWidth}% - 7px)` } as CSSProperties} key={daypart.id}><strong>{daypart.name}</strong><span>{formatLocalMinute(rule.startMinute)}–{formatLocalMinute(rule.endMinute)}</span></button>;
            })}
          </div>;
        })}
      </div>)}
    </div>
    {draft ? <div className="daypart-drawer-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDraft(null); }}>
      <aside className="daypart-drawer" role="dialog" aria-modal="true" aria-labelledby="preview-daypart-editor-title">
        <form className="daypart-editor" onSubmit={save}>
          <div className="daypart-editor-heading"><div><p className="eyebrow">{draft.id ? "Edit Daypart" : "New Daypart"}</p><h2 id="preview-daypart-editor-title">{draft.id ? draft.name : "Add standing hours"}</h2></div><button className="quick-modal-close" type="button" aria-label="Close Daypart editor" onClick={() => setDraft(null)}>×</button></div>
          <div className="daypart-editor-scroll">
            <div className="row"><div className="field"><label>Name</label><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Vinyl Night" required /></div><div className="field"><label>Room / space</label><input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} placeholder="Amigo Room" required /></div></div>
            <div className="daypart-definition-row">
              <div className="field"><label>Calendar color</label><div className="daypart-color-control"><input aria-label="Daypart color" type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value.toUpperCase() })} /><strong>{draft.color}</strong></div><div className="daypart-color-presets">{colors.map((color) => <button aria-label={`Use ${color}`} className={draft.color === color ? "active" : ""} type="button" style={{ background: color }} onClick={() => setDraft({ ...draft, color })} key={color} />)}</div></div>
              <div className="field"><label>Default talent rate ($/hr) <span>optional</span></label><input type="number" min="0" step="0.01" value={draft.defaultTalentRate} onChange={(event) => setDraft({ ...draft, defaultTalentRate: event.target.value })} placeholder="Uses Residency default" /></div>
              <div className="field"><label>Active until <span>optional</span></label><input type="date" value={draft.activeUntil} onChange={(event) => setDraft({ ...draft, activeUntil: event.target.value })} /><small>Blank means this continues indefinitely.</small></div>
            </div>
            <label className="checkbox-row"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Active Daypart</label>
            <div className="week-rule-grid">{draft.rules.map((rule, weekday) => <div className={`week-rule ${rule.enabled ? "enabled" : ""}`} key={weekdayNames[weekday]}><button className="week-toggle" type="button" aria-pressed={rule.enabled} onClick={() => updateRule(weekday, { enabled: !rule.enabled, start: "", end: "" })}>{weekdayNames[weekday].slice(0, 3)}</button>{rule.enabled ? <div className="week-rule-fields"><div className="field"><label>Start</label><input type="time" value={rule.start} onChange={(event) => updateRule(weekday, { start: event.target.value })} required /></div><div className="field"><label>End</label><input type="time" value={rule.end} onChange={(event) => updateRule(weekday, { end: event.target.value })} required /></div><div className="field"><label>DJs</label><input type="number" min="1" max="20" value={rule.defaultDjCount} onChange={(event) => updateRule(weekday, { defaultDjCount: Number(event.target.value) })} required /></div></div> : <p>Off</p>}</div>)}</div>
          </div>
          <div className="daypart-editor-actions"><button className="button secondary" type="button" onClick={() => setDraft(null)}>Cancel</button><button className="button" type="submit">Save Daypart</button></div>
        </form>
      </aside>
    </div> : null}
  </section>;
}
