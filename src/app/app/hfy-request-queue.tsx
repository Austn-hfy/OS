"use client";

import { useActionState } from "react";
import { fulfillHfyTalentRequestAction, type ResidencyActionState } from "@/app/app/actions";
import { SensitiveInput } from "@/components/privacy-mode";

type RequestRow = {
  id: string;
  residencyId: string;
  residencyName: string;
  residencyTimezone: string;
  shiftName: string;
  room: string;
  serviceDate: string;
  startsAt: string;
  endsAt: string;
};

type Artist = { id: string; stageName: string; homeMarket: string; exclusiveResidencyId: string | null };
const initialState: ResidencyActionState = { status: "idle", message: "" };

function time(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
}

function RequestFulfillmentForm({ request, artists }: { request: RequestRow; artists: Artist[] }) {
  const [state, action, pending] = useActionState(fulfillHfyTalentRequestAction, initialState);
  const available = artists.filter((artist) => !artist.exclusiveResidencyId || artist.exclusiveResidencyId === request.residencyId);
  return <form action={action} className="hfy-request-fulfillment-form">
    <input type="hidden" name="requestId" value={request.id} />
    <div className="field"><label>HFY artist</label><select name="talentId" required defaultValue=""><option value="" disabled>Choose artist</option>{available.map((artist) => <option value={artist.id} key={artist.id}>{artist.stageName}{artist.homeMarket ? ` · ${artist.homeMarket}` : ""}</option>)}</select></div>
    <div className="field"><label>Client-billed rate / hr</label><SensitiveInput name="clientRate" type="number" min="0" step="0.01" required placeholder="0.00" /></div>
    <div className="field"><label>Artist-paid rate / hr</label><SensitiveInput name="artistRate" type="number" min="0" step="0.01" required placeholder="0.00" /></div>
    <button className="button" type="submit" disabled={pending || !available.length}>{pending ? "Fulfilling…" : "Assign & bill"}</button>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
  </form>;
}

export function HfyRequestQueue({ requests, artists }: { requests: RequestRow[]; artists: Artist[] }) {
  return <section className="hfy-request-queue-section">
    <div className="section-heading"><div><p className="eyebrow">Client requests</p><h2>Pending Request HFY</h2><p className="subhead">Assign an HFY artist and set both HFY-controlled rates. Clients never see either rate here.</p></div><span className="status pending_hfy_confirmation">{requests.length} pending</span></div>
    {requests.length ? <div className="hfy-request-list">{requests.map((request) => <article className="card hfy-request-card" key={request.id}>
      <div className="hfy-request-details"><p className="eyebrow">{request.residencyName}</p><h3>{request.shiftName}</h3><dl><div><dt>Date</dt><dd>{request.serviceDate}</dd></div><div><dt>Room</dt><dd>{request.room}</dd></div><div><dt>Hours</dt><dd>{time(request.startsAt, request.residencyTimezone)}–{time(request.endsAt, request.residencyTimezone)}</dd></div></dl></div>
      <RequestFulfillmentForm request={request} artists={artists} />
    </article>)}</div> : <div className="card empty">No pending Request HFY items.</div>}
  </section>;
}
