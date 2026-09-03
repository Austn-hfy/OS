"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addCalendarAssignmentAction, bookResidencyDateAction, rescheduleAssignmentAction, updateCalendarShiftDetailsAction, type ResidencyActionState } from "@/app/app/actions";
import type { ResidencyEvent } from "@/app/app/calendar/residency-calendar";
import { ArtistSearchPicker, type CreateArtistResult } from "@/components/artist-search-picker";
import { SensitiveInput } from "@/components/privacy-mode";
import { TimeSelect } from "@/components/time-select";
import { formatLocalMinute, resolveAssignmentMinutes } from "@/domain/dayparts";

type BatchDaypart = {
  id: string;
  name: string;
  room: string;
  type: "dj_artist" | "house_activity";
  billingMode: "billed_by_hfy" | "tracking_only" | null;
  defaultTalentRateCents: number | null;
  active: boolean;
  activeUntil: string | null;
};

type BatchDraft = {
  talentId: string;
  start: string;
  end: string;
  requestHfy: boolean;
  compensationType: "hourly" | "fixed" | "na";
  rateOverride: string;
  fixedFee: string;
  clientRateOverride: string;
  notes: string;
};

type CalendarBatchEditorProps = {
  residency: { id: string; name: string; defaultTalentRateCents: number; clientHourlyRateCents: number };
  rangeLabel: string;
  rangeKind: "month" | "week";
  events: ResidencyEvent[];
  dayparts: BatchDaypart[];
  artists: Array<{ id: string; name: string; meta: string }>;
  canCreateArtist?: (name: string) => Promise<CreateArtistResult>;
  previewMode: boolean;
  fullProgramming: boolean;
  canManage: boolean;
  initialDaypartId?: string;
  onRefresh: () => void;
};

const initialActionState: ResidencyActionState = { status: "idle", message: "" };

function centsToDollars(value: number | null | undefined) {
  return value === null || value === undefined ? "" : (value / 100).toFixed(2);
}

function dollarsToCents(value: string): number | null {
  if (!value.trim()) return null;
  const dollars = Number(value);
  return Number.isFinite(dollars) && dollars >= 0 ? Math.round(dollars * 100) : null;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

function occurrenceSummary(event: ResidencyEvent) {
  if (event.schedulingStatus === "empty" || event.schedulingStatus === "partial") return "";
  if (event.economicsMode === "hfy_request") return "Request HFY";
  const artists = event.assignments.map((assignment) => assignment.talentName || assignment.guestName).filter(Boolean);
  return artists.join(" + ") || event.manualHostName || event.programDetails || "Scheduled";
}

function draftFromEvent(event: ResidencyEvent, previewMode: boolean): BatchDraft {
  const assignment = event.assignments[0];
  return {
    talentId: assignment?.talentId ?? "",
    start: assignment?.startClock ?? String(Math.floor(event.shiftStartMinute / 60)).padStart(2, "0") + ":" + String(event.shiftStartMinute % 60).padStart(2, "0"),
    end: assignment?.endClock ?? String(Math.floor((event.shiftEndMinute % 1440) / 60)).padStart(2, "0") + ":" + String(event.shiftEndMinute % 60).padStart(2, "0"),
    requestHfy: event.economicsMode === "hfy_request",
    compensationType: previewMode ? "na" : assignment?.compensationType ?? "hourly",
    rateOverride: centsToDollars(assignment?.talentRateOverrideCents),
    fixedFee: centsToDollars(assignment?.fixedFeeCents),
    clientRateOverride: centsToDollars(event.clientRateOverrideCents),
    notes: event.notes ?? "",
  };
}

export function CalendarBatchEditor({ residency, rangeLabel, rangeKind, events, dayparts, artists, canCreateArtist, previewMode, fullProgramming, canManage, initialDaypartId, onRefresh }: CalendarBatchEditorProps) {
  const launcherRef = useRef<HTMLDetailsElement>(null);
  const [selectedDaypartId, setSelectedDaypartId] = useState(() => initialDaypartId && dayparts.some((daypart) => daypart.id === initialDaypartId) ? initialDaypartId : "");
  const [expandedEventId, setExpandedEventId] = useState("");
  const [draft, setDraft] = useState<BatchDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [state, setState] = useState<ResidencyActionState>(initialActionState);
  const [savedSummaries, setSavedSummaries] = useState<Record<string, string>>({});

  const needsCount = events.filter((event) => event.schedulingStatus === "empty" || event.schedulingStatus === "partial").length;
  const activeDayparts = useMemo(() => dayparts.filter((daypart) => daypart.active), [dayparts]);
  const selectedDaypart = dayparts.find((daypart) => daypart.id === selectedDaypartId);
  const selectedEvents = events.filter((event) => event.daypartId === selectedDaypartId);
  const selectedEvent = selectedEvents.find((event) => event.id === expandedEventId);
  const selectedEventReadOnly = Boolean(previewMode && selectedEvent && (fullProgramming || (!selectedEvent.projected && selectedEvent.economicsMode !== "client_owned")));

  function openBatch(daypartId: string) {
    setSelectedDaypartId(daypartId);
    setExpandedEventId("");
    setDraft(null);
    setDone(false);
    setState(initialActionState);
    launcherRef.current?.removeAttribute("open");
  }

  function closeBatch() {
    setSelectedDaypartId("");
    setExpandedEventId("");
    setDraft(null);
    setDone(false);
    setState(initialActionState);
    const url = new URL(window.location.href);
    if (url.searchParams.has("batchDaypart")) {
      url.searchParams.delete("batchDaypart");
      window.history.replaceState(window.history.state, "", url);
    }
  }

  function expandEvent(event: ResidencyEvent) {
    setExpandedEventId(event.id);
    setDraft(draftFromEvent(event, previewMode));
    setDone(false);
    setState(initialActionState);
  }

  useEffect(() => {
    if (!selectedDaypartId) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBatch();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedDaypartId]);

  const warning = (() => {
    if (!selectedEvent || !draft || selectedEventReadOnly || draft.requestHfy || selectedDaypart?.type !== "dj_artist") return "";
    if (!draft.talentId) return "Choose an artist before saving.";
    try {
      const window = resolveAssignmentMinutes(selectedEvent.shiftStartMinute, selectedEvent.shiftEndMinute, draft.start, draft.end);
      if (!window.withinShift) return `Artist time must stay inside ${formatLocalMinute(selectedEvent.shiftStartMinute)}–${formatLocalMinute(selectedEvent.shiftEndMinute)}.`;
      return "";
    } catch {
      return "Choose valid artist start and end times.";
    }
  })();

  async function saveAndNext() {
    if (!selectedEvent || !selectedDaypart || !draft || warning || !canManage) return;
    setPending(true);
    setState(initialActionState);
    let result: ResidencyActionState = initialActionState;
    try {
      if (selectedEventReadOnly) {
        result = { status: "success", message: "Occurrence reviewed." };
      } else if (selectedEvent.projected) {
        const formData = new FormData();
        const assignmentWindow = selectedDaypart.type === "dj_artist" && !draft.requestHfy
          ? resolveAssignmentMinutes(selectedEvent.shiftStartMinute, selectedEvent.shiftEndMinute, draft.start, draft.end)
          : null;
        formData.set("payload", JSON.stringify({
          residencyId: residency.id,
          serviceDate: selectedEvent.date,
          dayparts: [{
            daypartId: selectedDaypart.id,
            startMinute: selectedEvent.shiftStartMinute,
            endMinute: selectedEvent.shiftEndMinute,
            clientRateOverrideCents: previewMode ? null : dollarsToCents(draft.clientRateOverride),
            notes: draft.notes,
            requestHfy: previewMode && !fullProgramming && draft.requestHfy,
            assignments: assignmentWindow && draft.talentId ? [{
              talentId: draft.talentId,
              startsAtMinute: assignmentWindow.startMinute,
              endsAtMinute: assignmentWindow.endMinute,
              compensationType: draft.compensationType,
              talentRateOverrideCents: dollarsToCents(draft.rateOverride),
              fixedFeeCents: dollarsToCents(draft.fixedFee),
            }] : [],
          }],
        }));
        result = await bookResidencyDateAction(initialActionState, formData);
      } else if (selectedEvent.recordType === "financial_shift" && selectedEvent.economicsMode !== "hfy_request") {
        const details = new FormData();
        details.set("shiftId", selectedEvent.id);
        details.set("notes", draft.notes);
        details.set("clientRateOverride", previewMode ? "" : draft.clientRateOverride);
        result = await updateCalendarShiftDetailsAction(details);
        if (result.status === "success" && selectedDaypart.type === "dj_artist" && draft.talentId) {
          const assignmentWindow = resolveAssignmentMinutes(selectedEvent.shiftStartMinute, selectedEvent.shiftEndMinute, draft.start, draft.end);
          const assignment = selectedEvent.assignments[0];
          const formData = new FormData();
          formData.set(assignment ? "assignmentId" : "shiftId", assignment?.id ?? selectedEvent.id);
          formData.set("talentId", draft.talentId);
          formData.set("startsAtMinute", String(assignmentWindow.startMinute));
          formData.set("endsAtMinute", String(assignmentWindow.endMinute));
          formData.set("compensationType", draft.compensationType);
          formData.set("talentRateOverride", draft.rateOverride);
          formData.set("fixedFee", draft.fixedFee);
          result = assignment ? await rescheduleAssignmentAction(formData) : await addCalendarAssignmentAction(formData);
        }
      } else {
        result = { status: "success", message: "Occurrence reviewed." };
      }
    } catch (error) {
      result = { status: "error", message: error instanceof Error ? error.message : "Unable to save this occurrence." };
    }
    setPending(false);
    setState(result);
    if (result.status !== "success") return;

    const artistName = artists.find((artist) => artist.id === draft.talentId)?.name;
    setSavedSummaries((current) => ({ ...current, [selectedEvent.id]: draft.requestHfy ? "Request HFY" : artistName || occurrenceSummary(selectedEvent) || "Scheduled" }));
    const currentIndex = selectedEvents.findIndex((event) => event.id === selectedEvent.id);
    const next = selectedEvents[currentIndex + 1];
    onRefresh();
    if (next) {
      setExpandedEventId(next.id);
      setDraft(draftFromEvent(next, previewMode));
      setState(initialActionState);
    } else {
      setExpandedEventId("");
      setDraft(null);
      setDone(true);
    }
  }

  return <>
    <details className="calendar-batch-launcher" ref={launcherRef}>
      <summary className={`calendar-needs-summary calendar-batch-summary ${needsCount ? "attention" : "clear"}`} aria-label={`${needsCount ? `${needsCount} need scheduling` : "All scheduled"}. Open batch edit.`}>
        <span className="calendar-batch-status">{needsCount ? <strong>{needsCount}</strong> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>}<span>{needsCount ? "need scheduling" : "all scheduled"}</span></span>
        <span className="calendar-batch-divider" aria-hidden="true" />
        <span className="calendar-batch-label">batch edit</span>
      </summary>
      <div className="calendar-batch-menu" aria-label="Choose a Daypart to batch edit">
        <div className="calendar-batch-menu-heading"><strong>Batch edit a Daypart</strong><small>{rangeLabel}</small></div>
        {activeDayparts.map((daypart) => {
          const occurrences = events.filter((event) => event.daypartId === daypart.id);
          const needs = occurrences.filter((event) => event.schedulingStatus === "empty" || event.schedulingStatus === "partial").length;
          return <button type="button" className="calendar-batch-menu-row" onClick={() => openBatch(daypart.id)} key={daypart.id}><span><strong>{daypart.name}</strong><small>{daypart.room}</small></span><em>{needs} need scheduling</em></button>;
        })}
        {!activeDayparts.length ? <div className="calendar-batch-menu-empty">No active Dayparts in this range.</div> : null}
      </div>
    </details>

    {selectedDaypart ? <div className="calendar-batch-takeover">
      <section className="calendar-batch-screen" role="dialog" aria-modal="true" aria-labelledby="calendar-batch-title">
        <header className="calendar-batch-header">
          <div><p className="eyebrow">{residency.name} · {selectedDaypart.room}</p><h2 id="calendar-batch-title">{selectedDaypart.name}</h2><p>{rangeLabel} · {selectedEvents.length} occurrence{selectedEvents.length === 1 ? "" : "s"} this {rangeKind}</p></div>
          <button className="quick-modal-close" type="button" aria-label="Close batch edit" onClick={closeBatch}>×</button>
        </header>
        {done ? <div className="calendar-batch-done"><span aria-hidden="true">✓</span><h3>Done</h3><p>You reached the end of this Daypart’s {rangeKind}.</p><button className="button" type="button" onClick={closeBatch}>Back to Calendar</button></div> : <div className="calendar-batch-list">
          {selectedEvents.map((event) => {
            const expanded = event.id === expandedEventId;
            const summary = savedSummaries[event.id] ?? occurrenceSummary(event);
            return <article className={`calendar-batch-row ${expanded ? "expanded" : ""}`} key={event.id}>
              <button className="calendar-batch-row-summary" type="button" aria-expanded={expanded} onClick={() => expandEvent(event)}>
                <span className="calendar-batch-row-date"><strong>{dateLabel(event.date)}</strong><small>{formatLocalMinute(event.shiftStartMinute)}–{formatLocalMinute(event.shiftEndMinute)}</small></span>
                {summary ? <span className="calendar-batch-row-assignment">{summary}</span> : <span className="calendar-batch-row-needs">Needs scheduling</span>}
                <span className="calendar-batch-row-chevron" aria-hidden="true">⌄</span>
              </button>
              {expanded && draft ? <div className="calendar-batch-form">
                {previewMode && !fullProgramming && event.projected && selectedDaypart.type === "dj_artist" ? <div className="calendar-batch-mode" role="group" aria-label="Scheduling method"><button type="button" className={!draft.requestHfy ? "active" : ""} onClick={() => setDraft({ ...draft, requestHfy: false })}><strong>Client Managed</strong><small>Choose an artist now</small></button><button type="button" className={draft.requestHfy ? "active" : ""} onClick={() => setDraft({ ...draft, requestHfy: true, talentId: "" })}><strong>Request HFY</strong><small>Send staffing to HFY</small></button></div> : null}
                {event.economicsMode === "hfy_request" ? <div className="request-hfy-selection"><div><span>Request HFY</span><strong>HFY staffing is pending</strong><small>This occurrence remains in the list for review.</small></div></div> : selectedEventReadOnly ? <div className="request-hfy-selection"><div><span>HFY managed</span><strong>{occurrenceSummary(event) || "HFY controls staffing"}</strong><small>This occurrence is available for review here; HFY-owned staffing remains unchanged.</small></div></div> : null}
                {selectedDaypart.type === "dj_artist" && !selectedEventReadOnly && !draft.requestHfy && event.economicsMode !== "hfy_request" ? <>
                  {draft.talentId ? <div className="replacement-selected"><div><span>Selected artist</span><strong>{artists.find((artist) => artist.id === draft.talentId)?.name ?? event.assignments[0]?.talentName}</strong></div><button type="button" onClick={() => setDraft({ ...draft, talentId: "" })}>Choose someone else</button></div> : <ArtistSearchPicker label="Choose artist" artists={artists} excludedIds={event.assignments.slice(1).map((assignment) => assignment.talentId).filter((id): id is string => Boolean(id))} onCreateArtist={canCreateArtist} onSelect={(talentId) => setDraft({ ...draft, talentId })} />}
                  <div className="calendar-batch-time-fields"><div className="field"><label>Artist starts</label><TimeSelect ariaLabel={`${dateLabel(event.date)} artist start time`} value={draft.start} onChange={(start) => setDraft({ ...draft, start })} stepMinutes={15} /></div><div className="field"><label>Artist ends</label><TimeSelect ariaLabel={`${dateLabel(event.date)} artist end time`} value={draft.end} onChange={(end) => setDraft({ ...draft, end })} stepMinutes={15} /></div></div>
                  {!previewMode ? <details className="quick-more"><summary>Pay and billing options</summary><div className="quick-more-fields"><div className="field"><label>Client rate override</label><SensitiveInput type="number" min="0" step="0.01" value={draft.clientRateOverride} onChange={(event) => setDraft({ ...draft, clientRateOverride: event.target.value })} placeholder={`Default $${(residency.clientHourlyRateCents / 100).toFixed(0)}/hr`} /></div><div className="field"><label>Compensation</label><select value={draft.compensationType} onChange={(event) => setDraft({ ...draft, compensationType: event.target.value as BatchDraft["compensationType"] })}><option value="hourly">Hourly</option><option value="fixed">Fixed fee</option><option value="na">N/A</option></select></div><div className="field"><label>{draft.compensationType === "fixed" ? "Fixed fee" : "Talent rate override"}</label><SensitiveInput type="number" min="0" step="0.01" value={draft.compensationType === "fixed" ? draft.fixedFee : draft.rateOverride} onChange={(event) => setDraft({ ...draft, ...(draft.compensationType === "fixed" ? { fixedFee: event.target.value } : { rateOverride: event.target.value }) })} placeholder={draft.compensationType === "hourly" ? `Default $${((selectedDaypart.defaultTalentRateCents ?? residency.defaultTalentRateCents) / 100).toFixed(0)}/hr` : undefined} /></div></div></details> : null}
                  {event.assignments.length > 1 ? <p className="draft-notice">This form edits the primary artist. {event.assignments.length - 1} additional assignment{event.assignments.length === 2 ? "" : "s"} remain unchanged.</p> : null}
                </> : null}
                {!selectedEventReadOnly && event.economicsMode !== "hfy_request" ? <div className="field quick-booking-notes"><label>Notes <span>optional</span></label><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Anything the team should know about this booking" /></div> : null}
                {warning ? <p className="error" aria-live="polite">{warning}</p> : null}
                {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
                <div className="calendar-batch-actions"><button className="button secondary" type="button" onClick={() => { setExpandedEventId(""); setDraft(null); setState(initialActionState); }}>Cancel</button><button className="button" type="button" disabled={pending || Boolean(warning) || !canManage} onClick={saveAndNext}>{pending ? "Saving…" : "Save & Next"}</button></div>
              </div> : null}
            </article>;
          })}
          {!selectedEvents.length ? <div className="calendar-batch-empty"><p>No occurrences of this Daypart fall in {rangeLabel}.</p><button className="button" type="button" onClick={closeBatch}>Back to Calendar</button></div> : null}
        </div>}
      </section>
    </div> : null}
  </>;
}
