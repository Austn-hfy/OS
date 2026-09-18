"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { PlatformBillingActionState } from "@/components/platform-billing-action-form";
import type { AnnualSwitchPaymentPath } from "@/domain/platform-annual-switch";
import type { AnnualSwitchPreviewState } from "./actions";

type AnnualSwitchAction = (
  previous: PlatformBillingActionState,
  formData: FormData,
) => Promise<PlatformBillingActionState>;

type AnnualSwitchPreviewAction = () => Promise<AnnualSwitchPreviewState>;

type AnnualSwitchComparison = {
  currentMonthlyAmountCents: number;
  annualEffectiveMonthlyAmountCents: number;
  annualUpfrontAmountCents: number;
  annualSavingsAmountCents: number;
  annualSavingsPercent: number;
};

const initialState: PlatformBillingActionState = { status: "idle", message: "" };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function AnnualSwitchConfirmation({
  action,
  previewAction,
  comparison,
  cardLabel,
  isLiveBilling,
}: {
  action: AnnualSwitchAction;
  previewAction: AnnualSwitchPreviewAction;
  comparison: AnnualSwitchComparison;
  cardLabel: string | null;
  isLiveBilling: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [preview, setPreview] = useState<Extract<AnnualSwitchPreviewState, { status: "success" }> | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewPending, startPreviewTransition] = useTransition();
  const [state, formAction, pending] = useActionState(action, initialState);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const paymentPath: AnnualSwitchPaymentPath | null = preview?.paymentPath ?? null;
  const startsAfterSubscriptionCheckout = paymentPath === "collect_card_and_start_annual";

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

  useEffect(() => {
    if (state.status === "success") router.replace("/residency/settings/billing?annualSwitch=complete");
  }, [router, state.status]);

  function openWithStripePreview() {
    setPreviewError("");
    startPreviewTransition(async () => {
      const result = await previewAction();
      if (result.status === "success") {
        setPreview(result);
        setOpen(true);
        return;
      }
      setPreviewError(result.message);
    });
  }

  const paymentMessage = startsAfterSubscriptionCheckout
    ? `Stripe Checkout will collect your card and charge ${money(comparison.annualUpfrontAmountCents)}. Annual service begins only after that payment succeeds.`
    : paymentPath === "collect_card_then_charge_immediately"
      ? `Stripe Checkout will collect a card first. As soon as it succeeds, Stripe will charge the previewed ${money(preview?.amountDueCents ?? 0)} and start the annual term immediately.`
      : `Stripe will charge the actual prorated amount of ${money(preview?.amountDueCents ?? 0)} to ${cardLabel ?? "your card on file"} today.`;
  const effectiveTitle = startsAfterSubscriptionCheckout ? "Starts after successful payment" : "Annual billing starts today";
  const effectiveMessage = startsAfterSubscriptionCheckout
    ? "Your month-to-month plan stays unchanged if Checkout is cancelled or payment does not succeed."
    : "Stripe resets the billing cycle now. Your local Committed Plan changes only after Stripe confirms the payment and annual Price.";
  const paymentTitle = paymentPath === "charge_card_immediately"
    ? `Charge ${cardLabel ?? "card on file"} today`
    : `Add a${isLiveBilling ? "" : " test"} card in Stripe Checkout`;

  return <>
    <div className="platform-annual-switch-trigger">
      <button className="button" type="button" ref={triggerRef} disabled={previewPending} onClick={openWithStripePreview}>{previewPending ? "Getting exact Stripe charge…" : "Switch to annual"}</button>
      {previewError ? <span className="error" role="alert">{previewError}</span> : null}
    </div>
    {open && preview && paymentPath ? createPortal(<div className="quick-modal-backdrop" onMouseDown={(event) => { if (!pending && event.currentTarget === event.target) setOpen(false); }}>
      <section className="quick-modal platform-annual-confirmation" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="annual-switch-title" aria-describedby="annual-switch-description">
        <header className="quick-modal-header">
          <div><p className="eyebrow">Confirm plan change</p><h2 id="annual-switch-title">Switch to annual billing?</h2><p id="annual-switch-description">Review the full cost and payment timing before changing your Committed Plan.</p></div>
          <button className="quick-modal-close" type="button" aria-label="Keep month-to-month and close" disabled={pending} onClick={() => setOpen(false)}>×</button>
        </header>
        <form action={formAction}>
          <input type="hidden" name="confirmation" value="switch_to_annual" />
          <input type="hidden" name="prorationDate" value={preview.prorationDate ?? ""} />
          <div className="quick-modal-body platform-annual-confirmation-body">
            <div className="platform-annual-plan-comparison" aria-label="Current and annual plan comparison">
              <article><small>Current plan</small><strong>{money(comparison.currentMonthlyAmountCents)} / month</strong><span>Month-to-month</span></article>
              <article className="new"><small>New plan</small><strong>{money(comparison.annualEffectiveMonthlyAmountCents)} / month</strong><span>{money(comparison.annualUpfrontAmountCents)} paid upfront each year</span></article>
            </div>
            <div className="platform-annual-savings"><strong>Save {money(comparison.annualSavingsAmountCents)} each year</strong><span>{comparison.annualSavingsPercent}% less than paying month-to-month for 12 months.</span></div>
            <div className="platform-annual-charge-today"><small>{startsAfterSubscriptionCheckout ? "Charged after Checkout" : "Actual Stripe charge today"}</small><strong>{money(preview.amountDueCents)}</strong><span>{startsAfterSubscriptionCheckout ? "This is the full first annual payment because no Stripe subscription exists to prorate." : "Calculated by Stripe for this subscription at the moment you opened this confirmation."}</span></div>
            <ol className="platform-annual-timeline" aria-label="What happens after confirming">
              <li><span className="platform-annual-step-number" aria-hidden="true">1</span><div><strong>Review savings</strong><span>Switch to {money(comparison.annualEffectiveMonthlyAmountCents)} per month effective and save {money(comparison.annualSavingsAmountCents)} each year.</span></div></li>
              <li><span className="platform-annual-step-number" aria-hidden="true">2</span><div><strong>{effectiveTitle}</strong><span>{effectiveMessage}</span></div></li>
              <li><span className="platform-annual-step-number" aria-hidden="true">3</span><div><strong>{paymentTitle}</strong><span>{paymentMessage}</span></div></li>
            </ol>
            {state.status !== "idle" ? <p className={state.status} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
          </div>
          <footer className="quick-modal-footer platform-annual-confirmation-actions">
            <button className="button secondary" type="button" ref={cancelRef} disabled={pending} onClick={() => setOpen(false)}>Keep month-to-month</button>
            <button className="button" type="submit" disabled={pending}>{pending ? "Confirming…" : paymentPath === "charge_card_immediately" ? `Pay ${money(preview.amountDueCents)} & switch now` : `Add ${isLiveBilling ? "" : "test "}card & complete switch`}</button>
          </footer>
        </form>
      </section>
    </div>, document.body) : null}
  </>;
}
