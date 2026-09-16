import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { PlatformBillingActionForm } from "@/components/platform-billing-action-form";
import { getResidencyPlatformBilling } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { LIVE_BILLING_HOLD_MESSAGE } from "@/domain/live-billing";
import { annualSwitchPaymentPath, calculateAnnualSwitchComparison } from "@/domain/platform-annual-switch";
import { isResidencyLiveStripeMode } from "@/domain/stripe-test-mode";
import { requireResidencyActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import { startResidencyPlatformCheckoutAction, switchResidencyPlatformPlanToAnnualAction, updateResidencyPlatformCardAction } from "./actions";
import { AnnualSwitchConfirmation } from "./annual-switch-confirmation";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}

function safeHostedInvoiceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function ResidencyPlatformBillingPage({ searchParams }: { searchParams: Promise<{ stripe?: string; card?: string; liveBilling?: string; annualSwitch?: string }> }) {
  if (!isCurrentPlatformBillingAvailable()) notFound();
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "settings")) redirect("/residency/calendar");
  const [billing, query] = await Promise.all([getResidencyPlatformBilling(actor.residencyId), searchParams]);
  const subscription = billing.subscription;
  const isLiveBilling = isResidencyLiveStripeMode(Boolean(subscription?.liveBillingApproved), {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  });
  const cardActionLabel = subscription?.stripeSubscriptionId
    ? `${isLiveBilling ? "Update" : "Update test"} card`
    : `Add ${isLiveBilling ? "" : "test "}card & start subscription`;
  const annualComparison = subscription ? calculateAnnualSwitchComparison(subscription) : null;
  const annualPaymentPath = subscription ? annualSwitchPaymentPath(subscription) : null;
  return <WorkspaceSurface className="residency-workspace-surface workspace-surface-settings workspace-surface-platform-billing">
    <ResidencyPageHeader eyebrow="Settings · Billing" title="Platform subscription">{isLiveBilling ? null : <span className="platform-test-mode-badge">Stripe test mode only</span>}</ResidencyPageHeader>
    <nav className="settings-tabs" aria-label="Settings sections"><Link href="/residency/settings">Account</Link><Link className="active" href="/residency/settings/billing">Billing</Link></nav>
    {query.liveBilling === "blocked" ? <p className="error" role="alert">{LIVE_BILLING_HOLD_MESSAGE}</p> : null}
    {query.stripe === "success" ? <p className="success">{isLiveBilling ? "Checkout" : "Test Checkout"} completed. Subscription details will update when Stripe confirms the event.</p> : null}
    {query.stripe === "cancelled" || query.card === "cancelled" ? <p className="muted">Stripe Checkout was cancelled. Nothing changed.</p> : null}
    {query.card === "updated" ? <p className="success">Your {isLiveBilling ? "card" : "test card"} update was submitted. Stripe confirmation may take a moment.</p> : null}
    {query.annualSwitch === "cancelled" ? <p className="muted" role="status">Annual Checkout was cancelled. Your month-to-month plan is unchanged.</p> : null}
    {query.annualSwitch === "checkout-complete" ? <p className="success" role="status">Annual Checkout completed. Your annual plan will appear here as soon as Stripe confirms the payment.</p> : null}
    {query.annualSwitch === "card-added" ? <p className="success" role="status">Your card was added. Annual billing is being scheduled for your next renewal.</p> : null}
    {subscription ? <>
      {subscription.comped ? <section className="platform-comped-state active" role="status"><div><strong>Complimentary Platform plan</strong><span>Your Residency is permanently comped at $0. Its selected capacities still determine usage capacity.</span></div><span className="status active">COMPED</span></section> : null}
      {subscription.paymentFailedAt ? <section className="platform-payment-failed-inline" role="alert"><strong>Payment failed</strong><span>{subscription.paymentFailureMessage || "Stripe could not collect the latest payment."} Your portal remains fully available.</span>{subscription.comped ? null : <PlatformBillingActionForm action={updateResidencyPlatformCardAction} label={cardActionLabel} pendingLabel="Opening card update…" />}</section> : null}
      <section className="platform-billing-summary">
        <article className="card"><small>Current plan</small><strong>{money(subscription.effectiveMonthlyAmountCents)} / month</strong><span>{subscription.term === "annual" ? `Annual · ${money(subscription.termChargeAmountCents)} paid upfront` : `Month-to-month · ${money(subscription.termChargeAmountCents)} per charge`}</span></article>
        {subscription.comped ? <article className="card"><small>Payment method</small><strong>Not required</strong><span>Permanent complimentary status</span></article> : <article className="card platform-payment-method-card"><small>Card on file</small><strong>{subscription.cardLast4 ? `${subscription.cardBrand} •••• ${subscription.cardLast4}` : "No card on file"}</strong><span>Managed securely through Stripe</span><PlatformBillingActionForm action={subscription.stripeSubscriptionId ? updateResidencyPlatformCardAction : startResidencyPlatformCheckoutAction} label={cardActionLabel} pendingLabel={subscription.stripeSubscriptionId ? "Opening card update…" : "Starting Checkout…"} buttonClassName="button secondary" /></article>}
        {subscription.comped ? <article className="card"><small>Billing term</small><strong>{subscription.term === "annual" ? "Annual" : "Month-to-month"}</strong><span>No payment method required</span></article> : <article className="card"><small>Next charge</small><strong>{date(subscription.nextChargeAt ?? subscription.renewsOn)}</strong><span className={`status ${subscription.status}`}>{subscription.status.replaceAll("_", " ")}</span></article>}
      </section>
      <section className="card platform-plan-breakdown"><div><p className="eyebrow">Committed Plan</p><h2>Subscription details</h2><p>Live Usage is tracked separately and never changes this bill automatically.</p>{subscription.pendingAnnualChange ? <div className="platform-annual-switch scheduled" role="status"><strong>Annual billing scheduled</strong><span>Your month-to-month plan remains active until {date(subscription.pendingAnnualChange.startsOn)}. Then {money(subscription.pendingAnnualChange.termChargeAmountCents)} will be charged upfront and your effective monthly rate becomes {money(subscription.pendingAnnualChange.effectiveMonthlyAmountCents)}.</span></div> : subscription.term === "month_to_month" && !subscription.comped && annualComparison && annualPaymentPath ? <div className="platform-annual-switch"><strong>Save {money(annualComparison.annualSavingsAmountCents)} per year by paying annually</strong><span>Review the exact annual charge and when it takes effect before confirming.</span><AnnualSwitchConfirmation action={switchResidencyPlatformPlanToAnnualAction} comparison={annualComparison} paymentPath={annualPaymentPath} effectiveDate={subscription.renewsOn} cardLabel={subscription.cardLast4 ? `${subscription.cardBrand} •••• ${subscription.cardLast4}` : null} isLiveBilling={isLiveBilling} /></div> : subscription.term === "annual" ? <div className="platform-annual-switch active" role="status"><strong>Annual plan active</strong><span>{money(subscription.termChargeAmountCents)} is paid upfront each year, saving {money(subscription.annualDiscountCents)} versus 12 monthly payments.</span></div> : null}</div><dl><div><dt>Talent capacity</dt><dd>{subscription.talentBucketSize} slots × {money(subscription.slotUnitAmountCents)}</dd></div><div><dt>House capacity</dt><dd>{subscription.houseBucketSize} slots × {money(subscription.slotUnitAmountCents)}</dd></div><div><dt>Billing term</dt><dd>{subscription.term === "annual" ? "Annual · 25% off" : subscription.pendingAnnualChange ? `Month-to-month · Annual starts ${date(subscription.pendingAnnualChange.startsOn)}` : "Month-to-month"}</dd></div><div><dt>Plan dates</dt><dd>{date(subscription.startsOn)}–{date(subscription.renewsOn)}</dd></div><div><dt>Base monthly plan</dt><dd>{money(subscription.baseMonthlyAmountCents)}</dd></div>{subscription.term === "annual" ? <div><dt>Annual upfront total</dt><dd>{money(subscription.termChargeAmountCents)}</dd></div> : null}</dl></section>
      <section className="card platform-live-comparison"><div className="platform-comparison-heading"><div><p className="eyebrow">Live Usage · {billing.usagePeriod ? `${date(billing.usagePeriod.start)}–${date(billing.usagePeriod.end)}` : "current month"}</p><h2>{billing.comparison ? billing.comparison.withinPlan ? "Within plan" : `Over plan by ${billing.comparison.totalOverBy}` : "Calculating usage"}</h2></div></div>{billing.liveUsage && billing.comparison ? <div className="platform-usage-grid">{([['Talent slots', 'talentSessions'], ['House slots', 'housePrograms']] as const).map(([label, key]) => { const metric = billing.comparison![key]; return <div key={key} className={`platform-usage-metric ${metric.withinPlan ? "within" : "over"}`}><span>{label}</span><strong>{metric.live} / {metric.committed}</strong><small>{metric.withinPlan ? `${metric.committed - metric.live} remaining` : `Over by ${metric.overBy}`}</small></div>; })}</div> : <p className="muted">No usage is available yet.</p>}<p className="privacy-note">Overages are logged for review. They do not create charges, change the plan, or restrict access.</p></section>
      <section className="card platform-invoice-history" id="invoice-history"><div><p className="eyebrow">Platform invoice history</p><h2>Subscription invoices</h2></div>{billing.invoices.length ? <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Paid</th><th>Status</th><th>Documents</th></tr></thead><tbody>{billing.invoices.map((invoice) => { const url = safeHostedInvoiceUrl(invoice.hostedInvoiceUrl); return <tr key={invoice.id}><td>{invoice.invoiceNumber || date(invoice.invoiceDate)}</td><td>{date(invoice.billingPeriodStart)}–{date(invoice.billingPeriodEnd)}</td><td>{money(invoice.amountDueCents)}</td><td>{money(invoice.amountPaidCents)}</td><td><span className={`status ${invoice.status}`}>{invoice.status}</span></td><td><div className="platform-invoice-links">{invoice.pdfStoragePath ? <Link className="button secondary" href={`/residency/settings/billing/invoices/${invoice.id}/pdf`}>Platform PDF</Link> : null}{url ? <a className="button secondary" href={url} target="_blank" rel="noreferrer">Stripe receipt</a> : null}{!invoice.pdfStoragePath && !url ? "—" : null}</div></td></tr>; })}</tbody></table></div> : <div className="empty">No Platform subscription invoices have been synced from Stripe yet.</div>}</section>
    </> : <section className="card empty platform-billing-empty"><h2>Platform billing is being finalized</h2><p>Your subscription record has not been connected to Stripe yet. HFY will add the plan, card, and next charge details here.</p></section>}
  </WorkspaceSurface>;
}
