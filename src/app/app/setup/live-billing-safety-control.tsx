"use client";

import { useActionState } from "react";
import { updateResidencyLiveBillingApprovalAction, type ResidencyActionState } from "@/app/app/actions";
import { liveBillingApprovalPhrase } from "@/domain/live-billing";

const initialState: ResidencyActionState = { status: "idle", message: "" };

export function LiveBillingSafetyControl({ residency }: {
  residency: { id: string; name: string; liveBillingApproved: boolean };
}) {
  const [state, action, pending] = useActionState(updateResidencyLiveBillingApprovalAction, initialState);
  const confirmationPhrase = liveBillingApprovalPhrase(residency.name);

  return <form action={action} className="card live-billing-safety-control">
    <input name="residencyId" type="hidden" value={residency.id} />
    <input name="approved" type="hidden" value={residency.liveBillingApproved ? "false" : "true"} />
    <header>
      <div><p className="eyebrow">Owner only · billing safety</p><h2>Live-billing approval</h2></div>
      <span className={`status ${residency.liveBillingApproved ? "active" : "paused"}`}>{residency.liveBillingApproved ? "Approved" : "On hold"}</span>
    </header>
    <p className="subhead">When this is off, Platform billing emails are rerouted to the owner billing inbox and Stripe checkout, subscription creation, and subscription updates are blocked.</p>
    {residency.liveBillingApproved ? <>
      <p className="warning">Live billing is approved for this Residency. The separate staging/production safety gate still applies.</p>
      <button className="button secondary danger-button" type="submit" disabled={pending}>{pending ? "Turning off…" : "Turn off live billing"}</button>
    </> : <>
      <div className="field"><label htmlFor={`live-billing-confirmation-${residency.id}`}>Type this phrase to approve</label><code>{confirmationPhrase}</code><input id={`live-billing-confirmation-${residency.id}`} name="confirmation" autoComplete="off" required aria-describedby={`live-billing-help-${residency.id}`} /></div>
      <small id={`live-billing-help-${residency.id}`}>Approval removes only the per-Residency hold. It does not enable live Stripe keys or relax the environment gate.</small>
      <button className="button" type="submit" disabled={pending}>{pending ? "Approving…" : "Approve live billing"}</button>
    </>}
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
  </form>;
}
