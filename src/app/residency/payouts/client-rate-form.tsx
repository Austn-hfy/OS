"use client";

import { useActionState, useState } from "react";
import { updateClientOwnedRateAction, type ClientSettingsActionState } from "@/app/residency/actions";

const initialState: ClientSettingsActionState = { status: "idle", message: "" };

function moneyPerHour(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function ClientRateForm({ assignmentId, defaultRateCents, overrideRateCents }: { assignmentId: string; defaultRateCents: number | null; overrideRateCents: number | null }) {
  const [state, action, pending] = useActionState(updateClientOwnedRateAction, initialState);
  const [rate, setRate] = useState(overrideRateCents === null ? "" : (overrideRateCents / 100).toFixed(2));
  const sourceLabel = overrideRateCents !== null
    ? `Override active: ${moneyPerHour(overrideRateCents)}/hr`
    : defaultRateCents !== null
      ? `Daypart rate: ${moneyPerHour(defaultRateCents)}/hr`
      : "No Daypart rate set";
  return <form action={action} className="client-rate-form">
    <input type="hidden" name="assignmentId" value={assignmentId} />
    <span className={`client-rate-source ${overrideRateCents !== null ? "override" : ""}`}>{sourceLabel}</span>
    <label htmlFor={`client-rate-${assignmentId}`}>Override for this date</label>
    <div className="client-rate-control"><span aria-hidden="true">$</span><input id={`client-rate-${assignmentId}`} name="rate" type="number" min="0" step="0.01" inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder={defaultRateCents === null ? "Enter hourly rate" : `Use ${(defaultRateCents / 100).toFixed(2)}`} /><button className="button secondary" type="submit" disabled={pending}>{pending ? "Saving…" : overrideRateCents !== null && !rate ? "Use Daypart rate" : "Save override"}</button></div>
    {overrideRateCents !== null ? <small>Clear the override and save to return to the Daypart rate.</small> : null}
    {state.status !== "idle" ? <small className={state.status === "error" ? "error" : "success"}>{state.message}</small> : null}
  </form>;
}
