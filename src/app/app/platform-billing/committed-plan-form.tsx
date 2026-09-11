"use client";

import { useActionState } from "react";
import { saveCommittedPlanAction, type PlatformPlanActionState } from "./actions";

const initialState: PlatformPlanActionState = { status: "idle", message: "" };

export type CommittedPlanFormValue = {
  cadence: "monthly" | "quarterly" | "annual";
  commitmentTier: "month_to_month" | "three_month" | "six_month" | "twelve_month" | null;
  talentProgramSessions: number;
  talentSessionUnitAmountCents: number;
  housePrograms: number;
  houseProgramUnitAmountCents: number;
  oneOffAllowance: number;
  startsOn: string;
  renewsOn: string;
};

export function CommittedPlanForm({
  residencyId,
  residencyName,
  value,
  foundingClientActive = false,
  commitmentTierEligible = false,
}: {
  residencyId: string;
  residencyName: string;
  value: CommittedPlanFormValue;
  foundingClientActive?: boolean;
  commitmentTierEligible?: boolean;
}) {
  const [state, action, pending] = useActionState(saveCommittedPlanAction, initialState);
  return <form action={action} className="platform-plan-form">
    <input type="hidden" name="residencyId" value={residencyId} />
    <div className="platform-plan-form-grid">
      <div className="field"><label htmlFor={`${residencyId}-talent`}>Talent sessions</label><input id={`${residencyId}-talent`} name="talentProgramSessions" type="number" min="0" step="1" defaultValue={value.talentProgramSessions} required /></div>
      {!foundingClientActive && !commitmentTierEligible ? <div className="field"><label htmlFor={`${residencyId}-talent-rate`}>Talent Program session rate ($/month)</label><input id={`${residencyId}-talent-rate`} name="talentSessionUnitAmount" type="number" min="0" step="0.01" defaultValue={(value.talentSessionUnitAmountCents / 100).toFixed(2)} required /></div> : null}
      <div className="field"><label htmlFor={`${residencyId}-house`}>House programs</label><input id={`${residencyId}-house`} name="housePrograms" type="number" min="0" step="1" defaultValue={value.housePrograms} required /></div>
      {!foundingClientActive && !commitmentTierEligible ? <div className="field"><label htmlFor={`${residencyId}-house-rate`}>House Program Daypart rate ($/month)</label><input id={`${residencyId}-house-rate`} name="houseProgramUnitAmount" type="number" min="0" step="0.01" defaultValue={(value.houseProgramUnitAmountCents / 100).toFixed(2)} required /></div> : null}
      <div className="field"><label htmlFor={`${residencyId}-oneoffs`}>Monthly one-offs included</label><input id={`${residencyId}-oneoffs`} name="oneOffAllowance" type="number" min="0" step="1" defaultValue={value.oneOffAllowance} required /></div>
      {commitmentTierEligible ? <div className="field platform-commitment-tier-field"><label htmlFor={`${residencyId}-commitment-tier`}>Commitment tier</label><select id={`${residencyId}-commitment-tier`} name="commitmentTier" defaultValue={value.commitmentTier ?? ""} required><option value="" disabled>Select a tier</option><option value="month_to_month">Month-to-month · $90 Talent</option><option value="three_month">3-month · $80 Talent</option><option value="six_month">6-month · $70 Talent</option><option value="twelve_month">12-month · $60 Talent</option></select><small>House stays $60 at every tier. Billing remains monthly.</small></div> : null}
      {!foundingClientActive && !commitmentTierEligible ? <div className="field"><label htmlFor={`${residencyId}-cadence`}>Billing cadence</label><select id={`${residencyId}-cadence`} name="cadence" defaultValue={value.cadence}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></div> : null}
      {foundingClientActive ? <div className="platform-founding-rate-summary"><span>Founding Client pricing</span><strong>$60 Talent · $60 House</strong><small>Monthly billing · no term selection</small></div> : commitmentTierEligible ? <div className="platform-founding-rate-summary commitment"><span>Standard commitment pricing</span><strong>Talent follows tier · House $60</strong><small>No prepayment · billed monthly</small></div> : null}
      <div className="field"><label htmlFor={`${residencyId}-starts`}>Plan starts</label><input id={`${residencyId}-starts`} name="startsOn" type="date" defaultValue={value.startsOn} required /></div>
      <div className="field"><label htmlFor={`${residencyId}-renews`}>Next renewal</label><input id={`${residencyId}-renews`} name="renewsOn" type="date" defaultValue={value.renewsOn} required /></div>
      <div className="field platform-plan-reason"><label htmlFor={`${residencyId}-reason`}>Reason for manual change</label><input id={`${residencyId}-reason`} name="changeReason" type="text" minLength={3} maxLength={500} placeholder={`Confirmed plan for ${residencyName}`} required /></div>
    </div>
    <p className="privacy-note">Saving changes only the Committed Plan. Live Usage never edits quantities, creates overage charges, or restricts access.</p>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save Committed Plan"}</button>
  </form>;
}
