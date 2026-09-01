"use client";

import { useActionState } from "react";
import { updateClientOwnedRateAction, type ClientSettingsActionState } from "@/app/residency/actions";

const initialState: ClientSettingsActionState = { status: "idle", message: "" };

export function ClientRateForm({ assignmentId, rateCents }: { assignmentId: string; rateCents: number | null }) {
  const [state, action, pending] = useActionState(updateClientOwnedRateAction, initialState);
  return <form action={action} className="client-rate-form">
    <input type="hidden" name="assignmentId" value={assignmentId} />
    <label className="sr-only" htmlFor={`client-rate-${assignmentId}`}>Hourly rate</label>
    <span>$</span><input id={`client-rate-${assignmentId}`} name="rate" type="number" min="0" step="0.01" defaultValue={rateCents === null ? "" : (rateCents / 100).toFixed(2)} placeholder="Optional" />
    <button className="button secondary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    {state.status !== "idle" ? <small className={state.status === "error" ? "error" : "success"}>{state.message}</small> : null}
  </form>;
}
