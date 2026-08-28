"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SensitiveInput } from "@/components/privacy-mode";
import { createResidencyAction, type ResidencyActionState } from "./actions";

const initialState: ResidencyActionState = { status: "idle", message: "" };

export function ResidencyCreateFields() {
  return <>
    <div className="field"><label htmlFor="residency-client-name">Client account</label><input id="residency-client-name" name="clientName" placeholder="Hotel group or owner" required /></div>
    <div className="field"><label htmlFor="residency-name">Residency name</label><input id="residency-name" name="residencyName" placeholder="Hotel + program" required /></div>
    <div className="form-grid two"><div className="field"><label htmlFor="residency-location">City / State</label><input id="residency-location" name="cityState" placeholder="Palm Springs, CA" /></div><div className="field"><label htmlFor="residency-timezone">Timezone</label><input id="residency-timezone" name="timezone" defaultValue="America/Los_Angeles" required /></div></div>
    <div className="form-grid two"><div className="field"><label htmlFor="residency-tier">Tier</label><select id="residency-tier" name="tier"><option value="operations_only">Operations Only</option><option value="complete">Complete</option></select></div><div className="field"><label htmlFor="residency-invoice-prefix">Invoice prefix</label><input id="residency-invoice-prefix" name="invoicePrefix" placeholder="HOTEL" maxLength={12} required /></div></div>
    <div className="form-grid two"><div className="field"><label htmlFor="residency-talent-rate">Talent rate ($/hr)</label><SensitiveInput id="residency-talent-rate" name="defaultTalentRate" type="number" min="0" step="0.01" required /></div><div className="field"><label htmlFor="residency-client-rate">Client rate ($/hr)</label><SensitiveInput id="residency-client-rate" name="clientHourlyRate" type="number" min="0" step="0.01" required /></div></div>
    <div className="form-grid two"><div className="field"><label htmlFor="residency-billing-name">Billing contact name</label><input id="residency-billing-name" name="billingContactName" required /></div><div className="field"><label htmlFor="residency-billing-email">Billing contact email</label><input id="residency-billing-email" name="billingContactEmail" type="email" required /></div></div>
    <div className="field"><label htmlFor="residency-payment-terms">Payment terms (days)</label><input id="residency-payment-terms" name="paymentTermsDays" type="number" defaultValue="7" min="0" max="365" required /></div>
    <label className="invoice-toggle"><input name="autoSendInvoices" type="checkbox" /><span><strong>Automatically send approved Invoices</strong><small>Leave this off for Residencies that require manual delivery.</small></span></label>
  </>;
}

export function ResidencyCreateForm({ onCreated, onCancel }: { onCreated?: () => void; onCancel?: () => void }) {
  const [state, action, pending] = useActionState(createResidencyAction, initialState);
  const router = useRouter();
  const completed = useRef(false);

  useEffect(() => {
    if (state.status !== "success" || completed.current) return;
    completed.current = true;
    router.refresh();
    onCreated?.();
  }, [onCreated, router, state.status]);

  return <form action={action} className="residency-create-form">
    <div className="residency-create-scroll">
      <ResidencyCreateFields />
      {state.message ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    </div>
    <div className="residency-create-actions">{onCancel ? <button className="button secondary" type="button" onClick={onCancel}>Cancel</button> : null}<button className="button" disabled={pending} type="submit">{pending ? "Creating…" : "Create Residency"}</button></div>
  </form>;
}
