"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlatformBillingActionState } from "@/components/platform-billing-action-form";
import type { SelfServicePreviewState } from "./actions";

type PreviewAction = (input: {
  kind: "downgrade" | "cancel" | "pause";
  talentBucketSize?: number;
  houseBucketSize?: number;
  term?: "month_to_month" | "annual";
  periods?: 1 | 2 | 3;
}) => Promise<SelfServicePreviewState>;

type ConfirmAction = (previous: PlatformBillingActionState, formData: FormData) => Promise<PlatformBillingActionState>;
const initialState: PlatformBillingActionState = { status: "idle", message: "" };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export function PlanManagement({ current, pendingChange, previewAction, confirmAction }: {
  current: { talentBucketSize: number; houseBucketSize: number; term: "month_to_month" | "annual"; effectiveMonthlyAmountCents: number; termChargeAmountCents: number };
  pendingChange: { kind: string; effectiveAt: string | null } | null;
  previewAction: PreviewAction;
  confirmAction: ConfirmAction;
}) {
  const [kind, setKind] = useState<"downgrade" | "pause" | "cancel">("downgrade");
  const [talent, setTalent] = useState(() => [...[10, 20, 30, 40, 50, 60].filter((value) => value < current.talentBucketSize)].at(-1) ?? current.talentBucketSize);
  const [house, setHouse] = useState(() => talent === current.talentBucketSize ? [...[5, 10, 15].filter((value) => value < current.houseBucketSize)].at(-1) ?? current.houseBucketSize : current.houseBucketSize);
  const [term, setTerm] = useState(current.term);
  const [periods, setPeriods] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<Extract<SelfServicePreviewState, { status: "success" }> | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, startPreview] = useTransition();
  const [state, formAction, confirming] = useActionState(confirmAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "success") return;
    router.refresh();
  }, [router, state.status]);

  if (state.status === "success") return <section className="platform-self-service-pending" role="status"><strong>Billing change scheduled</strong><span>{state.message}</span></section>;
  if (pendingChange) return <section className="platform-self-service-pending" role="status">
    <strong>Billing change scheduled</strong>
    <span>{pendingChange.kind === "cancel" ? "Cancellation" : pendingChange.kind === "pause" ? "Pause" : "Your new plan"} takes effect {pendingChange.effectiveAt ? displayDate(pendingChange.effectiveAt) : "at the end of the paid period"}. Your current access and capacity remain unchanged until then.</span>
  </section>;

  function getPreview() {
    setPreviewError("");
    startPreview(async () => {
      const result = await previewAction({ kind, talentBucketSize: talent, houseBucketSize: house, term, periods });
      if (result.status === "error") setPreviewError(result.message);
      else setPreview(result);
    });
  }

  const downgrade = preview?.kind === "downgrade" ? preview.preview : null;
  const pause = preview?.kind === "pause" ? preview.preview : null;
  const cancel = preview?.kind === "cancel" ? preview.preview : null;
  const effectiveAt = downgrade?.effectiveAt ?? pause?.effectiveAt ?? cancel?.effectiveAt ?? null;
  const hasDowngrade = talent < current.talentBucketSize || house < current.houseBucketSize || (current.term === "annual" && term === "month_to_month");

  return <section className="platform-self-service-plan">
    <div className="platform-self-service-heading"><div><p className="eyebrow">Manage subscription</p><h3>Plan options</h3><p>Reductions, pauses, and cancellation begin after your already-paid period. Nothing changes today.</p></div></div>
    <div className="platform-self-service-tabs" role="tablist" aria-label="Subscription change type">
      {([['downgrade', 'Reduce capacity'], ['pause', 'Pause'], ['cancel', 'Cancel']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={kind === value} className={kind === value ? "active" : ""} onClick={() => { setKind(value); setPreview(null); }}>{label}</button>)}
    </div>
    {kind === "downgrade" ? <div className="platform-self-service-fields">
      <label>Talent capacity<select value={talent} onChange={(event) => setTalent(Number(event.target.value))}>{[10,20,30,40,50,60].filter((value) => value <= current.talentBucketSize).map((value) => <option key={value} value={value}>{value} slots</option>)}</select></label>
      <label>House capacity<select value={house} onChange={(event) => setHouse(Number(event.target.value))}>{[5,10,15].filter((value) => value <= current.houseBucketSize).map((value) => <option key={value} value={value}>{value} slots</option>)}</select></label>
      <label>Billing term<select value={term} onChange={(event) => setTerm(event.target.value as typeof term)}>{current.term === "annual" ? <option value="month_to_month">Month-to-month</option> : null}<option value={current.term}>{current.term === "annual" ? "Annual" : "Month-to-month"}</option></select></label>
    </div> : null}
    {kind === "pause" ? <fieldset className="platform-pause-periods"><legend>Pause for</legend>{([1,2,3] as const).map((value) => <label key={value}><input type="radio" checked={periods === value} onChange={() => setPeriods(value)} />{value} billing period{value === 1 ? "" : "s"}</label>)}</fieldset> : null}
    {kind === "cancel" ? <p className="privacy-note">Cancellation keeps all enrolled users and data. Pending invitations are revoked only when cancellation becomes effective.</p> : null}
    {kind === "downgrade" && !hasDowngrade ? <p className="privacy-note">This is already the smallest month-to-month plan.</p> : null}
    <button className={kind === "cancel" ? "button secondary danger" : "button secondary"} type="button" disabled={previewing || (kind === "downgrade" && !hasDowngrade)} onClick={getPreview}>{previewing ? "Getting Stripe preview…" : `Review ${kind === "downgrade" ? "new plan" : kind}`}</button>
    {previewError ? <p className="error" role="alert">{previewError}</p> : null}
    {preview && effectiveAt ? <div className="quick-modal-backdrop"><section className="quick-modal platform-plan-change-confirmation" role="dialog" aria-modal="true" aria-labelledby="plan-change-title">
      <header className="quick-modal-header"><div><p className="eyebrow">Confirm subscription change</p><h2 id="plan-change-title">{preview.kind === "downgrade" ? "Confirm your new plan" : preview.kind === "pause" ? "Confirm subscription pause" : "Confirm cancellation"}</h2><p>No charge is due today. This change starts after the current paid period.</p></div><button className="quick-modal-close" type="button" aria-label="Close without changing subscription" disabled={confirming} onClick={() => setPreview(null)}>×</button></header>
      <form action={formAction}>
        <input type="hidden" name="confirmation" value="confirm" /><input type="hidden" name="kind" value={preview.kind} />
        <input type="hidden" name="talentBucketSize" value={talent} /><input type="hidden" name="houseBucketSize" value={house} /><input type="hidden" name="term" value={term} /><input type="hidden" name="periods" value={periods} />
        <div className="quick-modal-body">
          {downgrade ? <div className="platform-annual-plan-comparison"><article><small>Current plan</small><strong>{current.talentBucketSize} Talent · {current.houseBucketSize} House</strong><span>{money(current.effectiveMonthlyAmountCents)} / month effective · {current.term === "annual" ? `${money(current.termChargeAmountCents)} annual charge` : `${money(current.termChargeAmountCents)} monthly charge`}</span></article><article className="new"><small>New plan</small><strong>{downgrade.next.talentBucketSize} Talent · {downgrade.next.houseBucketSize} House</strong><span>{money(downgrade.next.effectiveMonthlyAmountCents)} / month effective · {money(downgrade.nextStripeInvoiceAmountCents)} next Stripe charge</span></article></div> : null}
          {pause ? <p><strong>Access pauses {displayDate(pause.effectiveAt)}</strong><br />Billing and operational writes resume {displayDate(pause.resumesAt)}. Your users and data remain in place.</p> : null}
          {cancel ? <p><strong>Service ends {displayDate(cancel.effectiveAt)}</strong><br />Your paid access remains unchanged until then. Enrolled users stay on the account; pending invitations revoke when cancellation takes effect.</p> : null}
          <div className="platform-annual-charge-today"><small>Charged today</small><strong>{money(0)}</strong><span>Stripe calculated this change for the end of your current paid period.</span></div>
          {state.status !== "idle" ? <p className={state.status} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        </div>
        <footer className="quick-modal-footer"><button className="button secondary" type="button" disabled={confirming} onClick={() => setPreview(null)}>Keep current plan</button><button className="button" type="submit" disabled={confirming}>{confirming ? "Scheduling…" : "Confirm for period end"}</button></footer>
      </form>
    </section></div> : null}
  </section>;
}

export function InvoicePayNowForm({ invoiceId, action }: { invoiceId: string; action: ConfirmAction }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return <form action={formAction} className="platform-invoice-pay-now"><input type="hidden" name="invoiceId" value={invoiceId} /><button className="button secondary" type="submit" disabled={pending}>{pending ? "Paying…" : "Pay now"}</button>{state.status !== "idle" ? <small className={state.status} role={state.status === "error" ? "alert" : "status"}>{state.message}</small> : null}</form>;
}
