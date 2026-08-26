"use client";

import { useActionState } from "react";
import { approveInvoiceAction, type ResidencyActionState } from "../actions";

const initialState: ResidencyActionState = { status: "idle", message: "" };

export function InvoiceApprovalButton({ invoiceId, autoSend }: { invoiceId: string; autoSend: boolean }) {
  const [state, action, pending] = useActionState(approveInvoiceAction, initialState);
  return (
    <form action={action} className="invoice-approval-form">
      <input name="invoiceId" type="hidden" value={invoiceId} />
      <button className="button" disabled={pending} type="submit">
        {pending ? "Generating PDF…" : autoSend ? "Approve, generate & send" : "Approve & generate PDF"}
      </button>
      <p className="privacy-note">PDF is created and locked as part of approval.</p>
      {state.message ? <p aria-live="polite" className={state.status === "error" ? "error" : "success"}>{state.message}</p> : null}
    </form>
  );
}
