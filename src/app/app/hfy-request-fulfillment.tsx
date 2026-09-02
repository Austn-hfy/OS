"use client";

import { useActionState, useMemo, useState } from "react";
import { fulfillHfyTalentRequestAction, type ResidencyActionState } from "@/app/app/actions";
import { TimeSelect } from "@/components/time-select";
import {
  formatLocalMinute,
  hasOverlappingAssignmentMinutes,
  minuteToClock,
  resolveAssignmentMinutes,
} from "@/domain/dayparts";

export type HfyRequestArtist = {
  id: string;
  stageName: string;
  homeMarket: string;
};

type AssignmentDraft = {
  id: string;
  talentId: string;
  start: string;
  end: string;
};

const initialState: ResidencyActionState = { status: "idle", message: "" };

function initialDraft(startMinute: number, endMinute: number): AssignmentDraft[] {
  return [{ id: "artist-segment-1", talentId: "", start: minuteToClock(startMinute), end: minuteToClock(endMinute) }];
}

export function HfyRequestFulfillment({
  requestId,
  shiftName,
  shiftStartMinute,
  shiftEndMinute,
  artists,
  ratesConfigured,
  onSuccess,
}: {
  requestId: string;
  shiftName: string;
  shiftStartMinute: number;
  shiftEndMinute: number;
  artists: HfyRequestArtist[];
  ratesConfigured: boolean;
  onSuccess?: () => void;
}) {
  const [drafts, setDrafts] = useState<AssignmentDraft[]>(() => initialDraft(shiftStartMinute, shiftEndMinute));
  const submit = async (previous: ResidencyActionState, formData: FormData) => {
    const result = await fulfillHfyTalentRequestAction(previous, formData);
    if (result.status === "success") onSuccess?.();
    return result;
  };
  const [state, action, pending] = useActionState(submit, initialState);

  const validation = useMemo(() => {
    if (!drafts.length) return "Add at least one artist.";
    if (drafts.some((draft) => !draft.talentId)) return "Choose an artist for every part of the shift.";
    if (new Set(drafts.map((draft) => draft.talentId)).size !== drafts.length) return "Choose each artist only once.";
    try {
      const windows = drafts.map((draft) => resolveAssignmentMinutes(
        shiftStartMinute,
        shiftEndMinute,
        draft.start,
        draft.end,
      ));
      if (windows.some((window) => !window.withinShift)) return `Keep every artist inside ${formatLocalMinute(shiftStartMinute)}–${formatLocalMinute(shiftEndMinute)}.`;
      if (hasOverlappingAssignmentMinutes(windows)) return "Artist times cannot overlap within the same shift.";
      const ordered = [...windows].sort((left, right) => left.startMinute - right.startMinute);
      if (ordered[0].startMinute !== shiftStartMinute
        || ordered[ordered.length - 1].endMinute !== shiftEndMinute
        || ordered.some((window, index) => index > 0 && window.startMinute !== ordered[index - 1].endMinute)) {
        return "Cover the full client request without leaving a gap between artists.";
      }
      return "";
    } catch {
      return "Choose valid start and end times for every artist.";
    }
  }, [drafts, shiftEndMinute, shiftStartMinute]);

  const payload = useMemo(() => {
    if (validation) return "";
    return JSON.stringify({
      requestId,
      assignments: drafts.map((draft) => {
        const window = resolveAssignmentMinutes(shiftStartMinute, shiftEndMinute, draft.start, draft.end);
        return { talentId: draft.talentId, startsAtMinute: window.startMinute, endsAtMinute: window.endMinute };
      }),
    });
  }, [drafts, requestId, shiftEndMinute, shiftStartMinute, validation]);

  function updateDraft(id: string, next: Partial<AssignmentDraft>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...next } : draft));
  }

  function addArtistSegment() {
    setDrafts((current) => {
      if (!current.length) return initialDraft(shiftStartMinute, shiftEndMinute);
      let windows: Array<{ draft: AssignmentDraft; window: ReturnType<typeof resolveAssignmentMinutes> }>;
      try {
        windows = current.map((draft) => ({
          draft,
          window: resolveAssignmentMinutes(shiftStartMinute, shiftEndMinute, draft.start, draft.end),
        })).sort((left, right) => left.window.startMinute - right.window.startMinute);
      } catch {
        return current;
      }
      const last = windows[windows.length - 1];
      if (last.window.endMinute < shiftEndMinute) {
        return [...current, {
          id: crypto.randomUUID(),
          talentId: "",
          start: minuteToClock(last.window.endMinute),
          end: minuteToClock(shiftEndMinute),
        }];
      }
      const midpoint = Math.round(((last.window.startMinute + last.window.endMinute) / 2) / 15) * 15;
      if (midpoint <= last.window.startMinute || midpoint >= last.window.endMinute) return current;
      return [...current.map((draft) => draft.id === last.draft.id ? { ...draft, end: minuteToClock(midpoint) } : draft), {
        id: crypto.randomUUID(),
        talentId: "",
        start: minuteToClock(midpoint),
        end: minuteToClock(last.window.endMinute),
      }];
    });
  }

  return <form action={action} className="hfy-request-fulfillment-form">
    <input type="hidden" name="payload" value={payload} />
    <div className="hfy-request-assignment-heading"><div><strong>Schedule talent</strong><span>Use one artist or split the full shift.</span></div><small>Rates come from Residency Setup</small></div>
    <div className="hfy-request-assignment-list">{drafts.map((draft, index) => {
      const unavailableIds = new Set(drafts.filter((item) => item.id !== draft.id).map((item) => item.talentId));
      return <div className="hfy-request-assignment-row" key={draft.id}>
        <span className="hfy-request-assignment-number">{String(index + 1).padStart(2, "0")}</span>
        <div className="field"><label htmlFor={`${requestId}-${draft.id}-artist`}>Artist</label><select id={`${requestId}-${draft.id}-artist`} value={draft.talentId} onChange={(event) => updateDraft(draft.id, { talentId: event.target.value })} required><option value="">Choose artist</option>{artists.filter((artist) => !unavailableIds.has(artist.id)).map((artist) => <option value={artist.id} key={artist.id}>{artist.stageName}{artist.homeMarket ? ` · ${artist.homeMarket}` : ""}</option>)}</select></div>
        <div className="field"><label>Starts</label><TimeSelect ariaLabel={`${shiftName} artist ${index + 1} start time`} value={draft.start} onChange={(value) => updateDraft(draft.id, { start: value })} stepMinutes={15} required /></div>
        <div className="field"><label>Ends</label><TimeSelect ariaLabel={`${shiftName} artist ${index + 1} end time`} value={draft.end} onChange={(value) => updateDraft(draft.id, { end: value })} stepMinutes={15} required /></div>
        {drafts.length > 1 ? <button className="hfy-request-remove-artist" type="button" onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}>Remove</button> : null}
      </div>;
    })}</div>
    <div className="hfy-request-assignment-actions"><button className="button secondary" type="button" disabled={drafts.length >= 20} onClick={addArtistSegment}>+ Split with another artist</button><button className="button" type="submit" disabled={pending || !ratesConfigured || !artists.length || Boolean(validation) || !payload}>{pending ? "Scheduling…" : drafts.length === 1 ? "Assign artist" : `Assign ${drafts.length} artists`}</button></div>
    {!ratesConfigured ? <p className="error" aria-live="polite">Set both default hourly rates in Residency Setup before fulfilling this request.</p> : validation ? <p className="draft-notice" aria-live="polite">{validation}</p> : null}
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
  </form>;
}
