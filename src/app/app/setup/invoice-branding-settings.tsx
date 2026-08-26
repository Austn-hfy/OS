"use client";

import { useActionState } from "react";
import Image from "next/image";
import { updateInvoiceBrandingAction, type ResidencyActionState } from "../actions";

const initialState: ResidencyActionState = { status: "idle", message: "" };

export function InvoiceBrandingSettings({
  companyName,
  billingEmail,
  billingAddress,
  hasLogo,
}: {
  companyName: string;
  billingEmail: string;
  billingAddress: string;
  hasLogo: boolean;
}) {
  const [state, action, pending] = useActionState(updateInvoiceBrandingAction, initialState);
  return <form action={action} className="card selection-form invoice-branding-settings">
    <div><p className="eyebrow">Company invoices</p><h2>Invoice branding</h2><p className="subhead">Controls the company identity shown at the top of every new client Invoice PDF.</p></div>
    <div className="invoice-logo-setting">
      {hasLogo ? <Image src="/app/settings/invoice-logo" alt="Current company Invoice logo" width={160} height={72} unoptimized /> : <div className="invoice-logo-placeholder">HFY</div>}
      <div><strong>{hasLogo ? "Current logo" : "No logo uploaded"}</strong><p className="privacy-note">Use a transparent PNG, JPEG, or WebP. Maximum 2 MB.</p></div>
    </div>
    <div className="field"><label htmlFor="invoice-company-name">Company name</label><input id="invoice-company-name" name="companyName" defaultValue={companyName} required /></div>
    <div className="field"><label htmlFor="invoice-billing-email">Billing email</label><input id="invoice-billing-email" name="billingEmail" type="email" defaultValue={billingEmail} required /></div>
    <div className="field"><label htmlFor="invoice-billing-address">Company address</label><textarea id="invoice-billing-address" name="billingAddress" rows={3} defaultValue={billingAddress} placeholder="Optional address shown on the Invoice" /></div>
    <div className="field"><label htmlFor="invoice-logo-file">{hasLogo ? "Replace company logo" : "Upload company logo"}</label><input id="invoice-logo-file" name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></div>
    {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    <button className="button" type="submit" disabled={pending}>{pending ? "Saving branding…" : "Save Invoice branding"}</button>
  </form>;
}
