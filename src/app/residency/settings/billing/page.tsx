import Link from "next/link";
import { redirect } from "next/navigation";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { getResidencyPlatformBilling } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";
import { startResidencyPlatformCheckoutAction, updateResidencyPlatformCardAction } from "./actions";

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

export default async function ResidencyPlatformBillingPage({ searchParams }: { searchParams: Promise<{ stripe?: string; card?: string }> }) {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "settings")) redirect("/residency/calendar");
  const [billing, query] = await Promise.all([getResidencyPlatformBilling(actor.residencyId), searchParams]);
  const subscription = billing.subscription;
  return <WorkspaceSurface className="residency-workspace-surface workspace-surface-settings workspace-surface-platform-billing">
    <ResidencyPageHeader eyebrow="Settings · Billing" title="Platform subscription"><span className="platform-test-mode-badge">Stripe test mode only</span></ResidencyPageHeader>
    <nav className="settings-tabs" aria-label="Settings sections"><Link href="/residency/settings">Account</Link><Link className="active" href="/residency/settings/billing">Billing</Link></nav>
    {query.stripe === "success" ? <p className="success">Test Checkout completed. Subscription details will update when Stripe confirms the event.</p> : null}
    {query.stripe === "cancelled" || query.card === "cancelled" ? <p className="muted">Stripe Checkout was cancelled. Nothing changed.</p> : null}
    {query.card === "updated" ? <p className="success">Your test card update was submitted. Stripe confirmation may take a moment.</p> : null}
    {subscription ? <>
      {subscription.paymentFailedAt ? <section className="platform-payment-failed-inline" role="alert"><strong>Payment failed</strong><span>{subscription.paymentFailureMessage || "Stripe could not collect the latest payment."} Your portal remains fully available.</span><form action={updateResidencyPlatformCardAction}><button className="button" type="submit">Update test card</button></form></section> : null}
      <section className="platform-billing-summary">
        <article className="card"><small>Current plan · revision {subscription.revision}</small><strong>{money(subscription.monthlyAmountCents)} / month</strong><span>{subscription.cadence} billing · {money(subscription.nextChargeAmountCents)} per charge</span></article>
        <article className="card"><small>Card on file</small><strong>{subscription.cardLast4 ? `${subscription.cardBrand} •••• ${subscription.cardLast4}` : "No card on file"}</strong><span>Managed securely through Stripe</span></article>
        <article className="card"><small>Next charge</small><strong>{date(subscription.nextChargeAt ?? subscription.renewsOn)}</strong><span className={`status ${subscription.status}`}>{subscription.status.replaceAll("_", " ")}</span></article>
      </section>
      <section className="card platform-plan-breakdown"><div><p className="eyebrow">Committed Plan</p><h2>Subscription details</h2><p>Live Usage is tracked separately and never changes this bill automatically.</p></div><dl><div><dt>Talent sessions</dt><dd>{subscription.talentProgramSessions} × {money(subscription.unitAmountCents)}</dd></div><div><dt>House programs</dt><dd>{subscription.housePrograms} × {money(subscription.unitAmountCents)}</dd></div><div><dt>Monthly one-offs included</dt><dd>{subscription.oneOffAllowance}</dd></div><div><dt>Plan dates</dt><dd>{date(subscription.startsOn)}–{date(subscription.renewsOn)}</dd></div><div><dt>Monthly plan</dt><dd>{money(subscription.monthlyAmountCents)}</dd></div></dl></section>
      <section className="card platform-live-comparison"><div className="platform-comparison-heading"><div><p className="eyebrow">Live Usage · {billing.usagePeriod ? `${date(billing.usagePeriod.start)}–${date(billing.usagePeriod.end)}` : "current month"}</p><h2>{billing.comparison ? billing.comparison.withinPlan ? "Within plan" : `Over plan by ${billing.comparison.totalOverBy}` : "Calculating usage"}</h2></div></div>{billing.liveUsage && billing.comparison ? <div className="platform-usage-grid">{([['Talent sessions', 'talentSessions'], ['House programs', 'housePrograms'], ['One-offs', 'oneOffs']] as const).map(([label, key]) => { const metric = billing.comparison![key]; return <div key={key} className={`platform-usage-metric ${metric.withinPlan ? "within" : "over"}`}><span>{label}</span><strong>{metric.live} / {metric.committed}</strong><small>{metric.withinPlan ? `${metric.committed - metric.live} remaining` : `Over by ${metric.overBy}`}</small></div>; })}</div> : <p className="muted">No usage is available yet.</p>}<p className="privacy-note">Overages are logged for review. They do not create charges, change the plan, or restrict access.</p></section>
      <section className="platform-card-actions"><form action={subscription.stripeSubscriptionId ? updateResidencyPlatformCardAction : startResidencyPlatformCheckoutAction}><button className="button" type="submit">{subscription.stripeSubscriptionId ? "Update test card" : "Add test card & start subscription"}</button></form></section>
      <section className="card platform-invoice-history" id="invoice-history"><div><p className="eyebrow">Platform invoice history</p><h2>Subscription invoices</h2></div>{billing.invoices.length ? <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Paid</th><th>Status</th><th>Documents</th></tr></thead><tbody>{billing.invoices.map((invoice) => { const url = safeHostedInvoiceUrl(invoice.hostedInvoiceUrl); return <tr key={invoice.id}><td>{invoice.invoiceNumber || date(invoice.invoiceDate)}</td><td>{date(invoice.billingPeriodStart)}–{date(invoice.billingPeriodEnd)}</td><td>{money(invoice.amountDueCents)}</td><td>{money(invoice.amountPaidCents)}</td><td><span className={`status ${invoice.status}`}>{invoice.status}</span></td><td><div className="platform-invoice-links">{invoice.pdfStoragePath ? <Link className="button secondary" href={`/residency/settings/billing/invoices/${invoice.id}/pdf`}>Platform PDF</Link> : null}{url ? <a className="button secondary" href={url} target="_blank" rel="noreferrer">Stripe receipt</a> : null}{!invoice.pdfStoragePath && !url ? "—" : null}</div></td></tr>; })}</tbody></table></div> : <div className="empty">No Platform subscription invoices have been synced from Stripe yet.</div>}</section>
    </> : <section className="card empty platform-billing-empty"><h2>Platform billing is being finalized</h2><p>Your subscription record has not been connected to Stripe yet. HFY will add the plan, card, and next charge details here.</p></section>}
  </WorkspaceSurface>;
}
