"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PlatformBillingActionState } from "@/components/platform-billing-action-form";
import type { AnnualSwitchPaymentPath } from "@/domain/platform-annual-switch";

type AnnualSwitchAction = (
  previous: PlatformBillingActionState,
  formData: FormData,
) => Promise<PlatformBillingActionState>;

type AnnualSwitchComparison = {
  currentMonthlyAmountCents: number;
  annualEffectiveMonthlyAmountCents: number;
  annualUpfrontAmountCents: number;
  annualSavingsAmountCents: number;
  annualSavingsPercent: number;
};

const initialState: PlatformBillingActionState = { status: "idle", message: "" };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

export function AnnualSwitchConfirmation({
  action,
  comparison,
  paymentPath,
  effectiveDate,
  cardLabel,
  isLiveBilling,
}: {
  action: AnnualSwitchAction;
  comparison: AnnualSwitchComparison;
  paymentPath: AnnualSwitchPaymentPath;
  effectiveDate: string;
  cardLabel: string | null;
  isLiveBilling: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const startsImmediately = paymentPath === "collect_card_and_start_annual";

  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.hidden);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleDialogKeys);
    cancelRef.current?.focus();
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", handleDialogKeys);
      trigger?.focus();
    };
  }, [open, pending]);

  const paymentMessage = startsImmediately
    ? `Stripe Checkout will collect your card and charge ${money(comparison.annualUpfrontAmountCents)}. Annual service begins only after that payment succeeds.`
    : paymentPath === "collect_card_then_schedule"
      ? `Stripe Checkout will collect a card now. That card will be charged ${money(comparison.annualUpfrontAmountCents)} on ${date(effectiveDate)}, when the annual term begins.`
      : `${money(comparison.annualUpfrontAmountCents)} will be charged to ${cardLabel ?? "your card on file"} on ${date(effectiveDate)}, when the annual term begins.`;

  return <>
    <button className="button" type="button" ref={triggerRef} onClick={() => setOpen(true)}>Switch to annual</button>
    {open ? createPortal(<div className="quick-modal-backdrop" onMouseDown={(event) => { if (!pending && event.currentTarget === event.target) setOpen(false); }}>
      <section className="quick-modal platform-annual-confirmation" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="annual-switch-title" aria-describedby="annual-switch-description">
        <header className="quick-modal-header">
          <div><p className="eyebrow">Confirm plan change</p><h2 id="annual-switch-title">Switch to annual billing?</h2><p id="annual-switch-description">Review the full cost and payment timing before changing your Committed Plan.</p></div>
          <button className="quick-modal-close" type="button" aria-label="Keep month-to-month and close" disabled={pending} onClick={() => setOpen(false)}>×</button>
        </header>
        <form action={formAction}>
          <input type="hidden" name="confirmation" value="switch_to_annual" />
          <div className="quick-modal-body platform-annual-confirmation-body">
            <div className="platform-annual-plan-comparison" aria-label="Current and annual plan comparison">
              <article><small>Current plan</small><strong>{money(comparison.currentMonthlyAmountCents)} / month</strong><span>Month-to-month</span></article>
              <article className="new"><small>New plan</small><strong>{money(comparison.annualEffectiveMonthlyAmountCents)} / month</strong><span>{money(comparison.annualUpfrontAmountCents)} paid upfront each year</span></article>
            </div>
            <div className="platform-annual-savings"><strong>Save {money(comparison.annualSavingsAmountCents)} each year</strong><span>{comparison.annualSavingsPercent}% less than paying month-to-month for 12 months.</span></div>
            <div className="platform-annual-effective-date"><strong>{startsImmediately ? "Effective after payment" : `Effective ${date(effectiveDate)}`}</strong><span>{startsImmediately ? "Your month-to-month plan stays unchanged if Checkout is cancelled or payment does not succeed." : "Your current month-to-month plan remains active until this renewal date."}</span></div>
            <div className="platform-annual-payment-step"><p className="eyebrow">Payment step</p><strong>{paymentPath === "charge_card_at_renewal" ? "Use card on file" : `Add a${isLiveBilling ? "" : " test"} card in Stripe Checkout`}</strong><span>{paymentMessage}</span></div>
            {state.status !== "idle" ? <p className={state.status} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
          </div>
          <footer className="quick-modal-footer platform-annual-confirmation-actions">
            <button className="button secondary" type="button" ref={cancelRef} disabled={pending} onClick={() => setOpen(false)}>Keep month-to-month</button>
            <button className="button" type="submit" disabled={pending}>{pending ? "Confirming…" : paymentPath === "charge_card_at_renewal" ? "Confirm annual switch" : `Add ${isLiveBilling ? "" : "test "}card & complete switch`}</button>
          </footer>
        </form>
      </section>
    </div>, document.body) : null}
  </>;
}
