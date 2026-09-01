"use client";

import { useActionState } from "react";
import { updateClientPaymentStatusVisibilityAction, type ResidencyActionState } from "@/app/app/actions";

const initialState: ResidencyActionState = { status: "idle", message: "" };

export function ClientVisibilitySettings({ residencyId, paymentStatusVisible }: { residencyId: string; paymentStatusVisible: boolean }) {
  const [state, action, pending] = useActionState(updateClientPaymentStatusVisibilityAction, initialState);
  return <section className="card setup-card client-visibility-settings">
    <div><p className="eyebrow">Client visibility</p><h2>Payment Status</h2><p>Show or hide the Payment Status section for this Residency. This never exposes HFY rates or payout amounts.</p></div>
    <form action={action}>
      <input type="hidden" name="residencyId" value={residencyId} />
      <label className="toggle-control"><input name="visible" type="checkbox" defaultChecked={paymentStatusVisible} /><span><strong>Visible in client workspace</strong><small>Clients can manage their own artist rates and see status-only HFY rows.</small></span></label>
      <button className="button secondary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save visibility"}</button>
      {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"}>{state.message}</p> : null}
    </form>
  </section>;
}
