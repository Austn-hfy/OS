"use client";

import { useActionState, useState } from "react";
import { rotatePublicCalendarLinkAction, type PublicCalendarLinkActionState } from "@/app/app/actions";
import type { PublicCalendarLinkSettings } from "@/data/internal";

const initialState: PublicCalendarLinkActionState = { status: "idle", message: "" };
type ShareableDaypart = { id: string; name: string; room: string; color: string };

export function PublicCalendarLinkManager({ residencyId, linkSettings, dayparts, compact = false }: { residencyId: string; linkSettings: PublicCalendarLinkSettings; dayparts: ShareableDaypart[]; compact?: boolean }) {
  const [state, action, pending] = useActionState(rotatePublicCalendarLinkAction, initialState);
  const [copied, setCopied] = useState(false);
  const [scope, setScope] = useState<"all" | "selected">(linkSettings.scope);
  const [selectedDaypartIds, setSelectedDaypartIds] = useState<string[]>(linkSettings.daypartIds);
  const hasActiveLink = linkSettings.hasLink || state.status === "success";
  const displayedScope = state.status === "success" ? scope : linkSettings.scope;
  const displayedDaypartCount = state.status === "success" ? selectedDaypartIds.length : linkSettings.daypartIds.length;

  function toggleDaypart(daypartId: string) {
    setSelectedDaypartIds((current) => current.includes(daypartId) ? current.filter((id) => id !== daypartId) : [...current, daypartId]);
  }

  async function copy() {
    if (!state.url) return;
    await navigator.clipboard.writeText(state.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <article className={compact ? "public-calendar-link-card public-calendar-link-compact" : "card residency-setup-card public-calendar-link-card"}>
    {!compact ? <div><p className="eyebrow">Calendar sharing</p><h2>Public calendar link</h2><p className="subhead">A read-only link for trusted partners. It exposes only Instagram handles and scheduled date/time.</p></div> : null}
    <div className="public-calendar-boundary"><strong>{hasActiveLink ? `Active link · ${displayedScope === "all" ? "All Dayparts" : `${displayedDaypartCount} selected Daypart${displayedDaypartCount === 1 ? "" : "s"}`}` : "No public link yet"}</strong><span>The token never expires. Regenerating it immediately revokes the previous link.</span></div>
    {state.url ? <div className="public-calendar-copy"><label htmlFor="public-calendar-url">New link</label><div><input id="public-calendar-url" readOnly value={state.url} /><button className="button secondary" type="button" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button></div><small>Copy this now. HFY OS stores only a one-way hash and cannot reveal this exact token again.</small></div> : null}
    {state.message ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <form className="public-calendar-scope-form" action={action}>
      <input name="residencyId" type="hidden" value={residencyId} />
      <fieldset>
        <legend>What should this link include?</legend>
        <label className={scope === "all" ? "selected" : ""}><input type="radio" name="scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} /><span><strong>Include all Dayparts</strong><small>Show every scheduled Daypart in this Residency.</small></span></label>
        <label className={scope === "selected" ? "selected" : ""}><input type="radio" name="scope" value="selected" checked={scope === "selected"} disabled={!dayparts.length} onChange={() => setScope("selected")} /><span><strong>Select Dayparts</strong><small>Share only the rooms or programs checked below.</small></span></label>
      </fieldset>
      {scope === "selected" ? <div className="public-calendar-dayparts" aria-label="Dayparts included in shared calendar">{dayparts.map((daypart) => <label className={selectedDaypartIds.includes(daypart.id) ? "selected" : ""} key={daypart.id}><input type="checkbox" name="daypartIds" value={daypart.id} checked={selectedDaypartIds.includes(daypart.id)} onChange={() => toggleDaypart(daypart.id)} /><span className="public-calendar-daypart-color" style={{ backgroundColor: daypart.color }} aria-hidden="true" /><span><strong>{daypart.name}</strong><small>{daypart.room}</small></span></label>)}</div> : null}
      {scope === "selected" && !selectedDaypartIds.length ? <p className="draft-notice">Select at least one Daypart.</p> : null}
      <button className={hasActiveLink ? "button secondary" : "button"} disabled={pending || (scope === "selected" && !selectedDaypartIds.length)} type="submit">{pending ? "Creating…" : hasActiveLink ? "Regenerate link" : "Create public link"}</button>
    </form>
  </article>;
}
