"use client";

import { useActionState } from "react";
import { saveCommittedPlanAction, type PlatformPlanActionState } from "./actions";

const initialState: PlatformPlanActionState = { status: "idle", message: "" };

export type CommittedPlanFormValue = {
  cadence: "monthly" | "quarterly" | "annual";
  talentProgramSessions: number;
  housePrograms: number;
  oneOffAllowance: number;
  unitAmountCents: number;
  startsOn: string;
  renewsOn: string;
};

export function CommittedPlanForm({
  residencyId,
  residencyName,
  value,
}: {
  residencyId: string;
  residencyName: string;
  value: CommittedPlanFormValue;
}) {
  const [state, action, pending] = useActionState(saveCommittedPlanAction, initialState);
  return <form action={action} className="platform-plan-form">
    <input type="hidden" name="residencyId" value={residencyId} />
    <div className="platform-plan-form-grid">
      <div className="field"><label htmlFor={`${residencyId}-talent`}>Talent sessions</label><input id={`${residencyId}-talent`} name="talentProgramSessions" type="number" min="0" step="1" defaultValue={value.talentProgramSessions} required /></div>
      <div className="field"><label htmlFor={`${residencyId}-house`}>House programs</label><input id={`${residencyId}-house`} name="housePrograms" type="number" min="0" step="1" defaultValue={value.housePrograms} required /></div>
      <div className="field"><label htmlFor={`${residencyId}-oneoffs`}>Monthly one-offs included</label><input id={`${residencyId}-oneoffs`} name="oneOffAllowance" type="number" min="0" step="1" defaultValue={value.oneOffAllowance} required /></div>
      <div className="field"><label htmlFor={`${residencyId}-rate`}>Per-unit rate ($/month)</label><input id={`${residencyId}-rate`} name="unitAmount" type="number" min="0" step="0.01" defaultValue={(value.unitAmountCents / 100).toFixed(2)} required /></div>
      <div className="field"><label htmlFor={`${residencyId}-cadence`}>Billing cadence</label><select id={`${residencyId}-cadence`} name="cadence" defaultValue={value.cadence}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></div>
      <div className="field"><label htmlFor={`${residencyId}-starts`}>Plan starts</label><input id={`${residencyId}-starts`} name="startsOn" type="date" defaultValue={value.startsOn} required /></div>
      <div className="field"><label htmlFor={`${residencyId}-renews`}>Next renewal</label><input id={`${residencyId}-renews`} name="renewsOn" type="date" defaultValue={value.renewsOn} required /></div>
      <div className="field platform-plan-reason"><label htmlFor={`${residencyId}-reason`}>Reason for manual change</label><input id={`${residencyId}-reason`} name="changeReason" type="text" minLength={3} maxLength={500} placeholder={`Confirmed plan for ${residencyName}`} required /></div>
    </div>
    <p className="privacy-note">Saving changes only the Committed Plan. Live Usage never edits quantities, creates overage charges, or restricts access.</p>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save Committed Plan"}</button>
  </form>;
}
