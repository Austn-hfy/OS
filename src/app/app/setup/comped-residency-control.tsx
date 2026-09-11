"use client";

import { useActionState } from "react";
import { updateResidencyCompedAction, type ResidencyActionState } from "@/app/app/actions";
import { compedResidencyConfirmationPhrase } from "@/domain/comped-residency";

const initialState: ResidencyActionState = { status: "idle", message: "" };

export function CompedResidencyControl({ residency }: {
  residency: { id: string; name: string; comped: boolean };
}) {
  const [state, action, pending] = useActionState(updateResidencyCompedAction, initialState);
  const nextComped = !residency.comped;
  const confirmationPhrase = compedResidencyConfirmationPhrase(residency.name, nextComped);

  return <form action={action} className="card live-billing-safety-control">
    <input name="residencyId" type="hidden" value={residency.id} />
    <input name="comped" type="hidden" value={nextComped ? "true" : "false"} />
    <header>
      <div><p className="eyebrow">Owner only · permanent pricing</p><h2>Comped Residency</h2></div>
      <span className={`status ${residency.comped ? "active" : "paused"}`}>{residency.comped ? "Comped" : "Standard"}</span>
    </header>
    <p className="subhead">Comped Residencies are charged $0 while their underlying Committed Plan rates, tier, and term remain preserved.</p>
    {residency.comped ? <p className="warning">Permanent comp status is active. Removing it immediately restores the exact preserved Committed Plan pricing and term.</p> : null}
    <div className="field">
      <label htmlFor={`comped-confirmation-${residency.id}`}>Type this phrase to {residency.comped ? "remove" : "enable"} permanent comp status</label>
      <code>{confirmationPhrase}</code>
      <input id={`comped-confirmation-${residency.id}`} name="confirmation" autoComplete="off" required />
    </div>
    <button className={`button ${residency.comped ? "secondary danger-button" : ""}`} type="submit" disabled={pending}>
      {pending ? "Saving…" : residency.comped ? "Remove permanent comp" : "Set as permanently comped"}
    </button>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
  </form>;
}
