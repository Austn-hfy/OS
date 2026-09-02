import Link from "next/link";
import { redirect } from "next/navigation";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { getResidencyPlatformBilling } from "@/data/residency-client";
import { canResidencyRoleAccess } from "@/domain/residency-access";
import { requireResidencyActor } from "@/lib/auth";

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

export default async function ResidencyPlatformBillingPage() {
  const actor = await requireResidencyActor();
  if (!canResidencyRoleAccess(actor.accessRole, "settings")) redirect("/residency/calendar");
  const billing = await getResidencyPlatformBilling(actor.residencyId);
  const subscription = billing.subscription;
  return <WorkspaceSurface className="residency-workspace-surface workspace-surface-settings workspace-surface-platform-billing">
    <ResidencyPageHeader eyebrow="Settings · Billing" title="Platform subscription" />
    <nav className="settings-tabs" aria-label="Settings sections"><Link href="/residency/settings">Account</Link><Link className="active" href="/residency/settings/billing">Billing</Link></nav>
    {subscription ? <>
      <section className="platform-billing-summary">
        <article className="card"><small>Current plan</small><strong>{money(subscription.monthlyAmountCents)} / month</strong><span>{subscription.cadence} billing · {money(subscription.nextChargeAmountCents)} per charge</span></article>
        <article className="card"><small>Card on file</small><strong>{subscription.cardLast4 ? `${subscription.cardBrand} •••• ${subscription.cardLast4}` : "No card on file"}</strong><span>Managed securely through Stripe</span></article>
        <article className="card"><small>Next charge</small><strong>{subscription.nextChargeAt ? date(subscription.nextChargeAt) : "Not scheduled"}</strong><span className={`status ${subscription.status}`}>{subscription.status.replaceAll("_", " ")}</span></article>
      </section>
      <section className="card platform-plan-breakdown"><div><p className="eyebrow">Plan calculation</p><h2>Subscription details</h2><p>The same per-session and per-program pricing applies to every account type.</p></div><dl><div><dt>Talent Program sessions</dt><dd>{subscription.talentProgramSessions} × {money(subscription.talentSessionUnitAmountCents)}</dd></div><div><dt>House Programs</dt><dd>{subscription.housePrograms} × {money(subscription.houseProgramUnitAmountCents)}</dd></div><div><dt>Monthly plan</dt><dd>{money(subscription.monthlyAmountCents)}</dd></div></dl></section>
      <section className="card platform-invoice-history"><div><p className="eyebrow">Stripe history</p><h2>Subscription invoices</h2></div>{billing.invoices.length ? <div className="table-wrap"><table><thead><tr><th>Invoice date</th><th>Period</th><th>Amount</th><th>Paid</th><th>Status</th><th>Receipt</th></tr></thead><tbody>{billing.invoices.map((invoice) => { const url = safeHostedInvoiceUrl(invoice.hostedInvoiceUrl); return <tr key={invoice.id}><td>{date(invoice.invoiceDate)}</td><td>{date(invoice.billingPeriodStart)}–{date(invoice.billingPeriodEnd)}</td><td>{money(invoice.amountDueCents)}</td><td>{money(invoice.amountPaidCents)}</td><td><span className={`status ${invoice.status}`}>{invoice.status}</span></td><td>{url ? <a className="button secondary" href={url} target="_blank" rel="noreferrer">Open in Stripe</a> : "—"}</td></tr>; })}</tbody></table></div> : <div className="empty">No subscription invoices have been synced from Stripe yet.</div>}</section>
    </> : <section className="card empty platform-billing-empty"><h2>Platform billing is being finalized</h2><p>Your subscription record has not been connected to Stripe yet. HFY will add the plan, card, and next charge details here.</p></section>}
  </WorkspaceSurface>;
}
