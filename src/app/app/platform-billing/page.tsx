import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@/components/format";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { PlatformBillingActionForm } from "@/components/platform-billing-action-form";
import { getDeveloperResidencyList, getPlatformRevenueDashboard } from "@/data/internal";
import { LIVE_BILLING_HOLD_MESSAGE } from "@/domain/live-billing";
import { requireInternalActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";
import { CommittedPlanForm } from "./committed-plan-form";
import { refreshPlatformUsageAction, startPlatformStripeCheckoutAction } from "./actions";

function date(value: string | Date | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(value instanceof Date ? value : new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}

function defaultDates() {
  const now = new Date();
  const start = now.toISOString().slice(0, 10);
  const renewal = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())).toISOString().slice(0, 10);
  return { start, renewal };
}

function UsageMetric({ label, committed, live }: { label: string; committed: number; live: number }) {
  const overBy = Math.max(0, live - committed);
  return <div className={overBy ? "platform-usage-metric over" : "platform-usage-metric within"}><span>{label}</span><strong>{live} / {committed}</strong><small>{overBy ? `Over by ${overBy}` : `${committed - live} remaining`}</small></div>;
}

function CompedResidencyPanel() {
  return <div className="platform-comped-state active" role="status"><div><strong>Permanently comped · $0 billed</strong><span>The selected Talent and House capacities remain active for usage comparison. No payment method is required.</span></div><span className="status active">COMPED</span></div>;
}

export default async function PlatformBillingPage({ searchParams }: { searchParams: Promise<{ stripe?: string; liveBilling?: string }> }) {
  if (!isCurrentPlatformBillingAvailable()) notFound();
  await requireInternalActor();
  const [{ stripe, liveBilling }, residencies, plans] = await Promise.all([searchParams, getDeveloperResidencyList(), getPlatformRevenueDashboard()]);
  const planByResidency = new Map(plans.map((plan) => [plan.residencyId, plan]));
  const defaults = defaultDates();
  return <WorkspaceSurface className="workspace-surface-platform-console">
    <header className="page-header owner-mode-header developer-mode-header"><div><p className="eyebrow">Developer · owner only</p><h1>Platform billing</h1><p className="subhead">Committed Plans determine Stripe billing. Live Usage is comparison-only and overages are logged without charges or access restrictions.</p></div><span className="platform-test-mode-badge">Stripe test mode only</span></header>
    {liveBilling === "blocked" ? <p className="error" role="alert">{LIVE_BILLING_HOLD_MESSAGE}</p> : null}
    {stripe === "success" ? <p className="success">Stripe Checkout completed. Webhook reconciliation will update the subscription and invoice history.</p> : null}
    {stripe === "cancelled" ? <p className="muted">Stripe Checkout was cancelled. No subscription was created.</p> : null}
    <div className="platform-billing-residencies">
      {residencies.map((residency) => {
        const plan = planByResidency.get(residency.id);
        const billingProgramPanel = residency.comped ? <CompedResidencyPanel /> : null;
        if (!plan) return <article className="card platform-owner-card" key={residency.id}>
          <header><div><p className="eyebrow">No Committed Plan</p><h2>{residency.name}</h2><p>{residency.cityState || "Location pending"}</p></div><div className="platform-owner-statuses">{residency.comped ? <span className="status active">COMPED · $0</span> : null}<span className="status incomplete">Not connected</span></div></header>
          {billingProgramPanel}
          <CommittedPlanForm residencyId={residency.id} residencyName={residency.name} comped={residency.comped} value={{ term: "month_to_month", talentBucketSize: 10, houseBucketSize: 5, startsOn: defaults.start, renewsOn: defaults.renewal }} />
        </article>;
        const comparison = plan.comparison;
        return <article className="card platform-owner-card" key={residency.id}>
          <header className="platform-owner-card-heading"><div><p className="eyebrow">Committed Plan · revision {plan.revision}</p><h2>{plan.residencyName}</h2><p>{plan.residencyActive ? plan.residencyName : `${plan.residencyName} · inactive`}</p></div><div className="platform-owner-statuses">{plan.comped ? <span className="status active">COMPED · $0</span> : null}<span className="platform-test-mode-badge">TEST</span><span className={`status ${plan.status}`}>{plan.status.replaceAll("_", " ")}</span></div></header>
          {billingProgramPanel}
          {plan.paymentFailedAt ? <div className="platform-payment-failed-inline" role="alert"><strong>Payment failed</strong><span>{plan.paymentFailureMessage || "Stripe could not collect the latest payment."} Hotel access remains active.</span></div> : null}
          <section className="platform-owner-plan-summary">
            <div><small>Base monthly plan</small><strong>{formatMoney(plan.baseMonthlyAmountCents)}</strong></div><div><small>{plan.term === "annual" ? "Annual upfront · 25% off" : "Monthly charge"}</small><strong>{formatMoney(plan.termChargeAmountCents)}</strong></div><div><small>Next invoice</small><strong>{date(plan.nextChargeAt ?? plan.renewsOn)}</strong></div><div><small>Card</small><strong>{plan.cardLast4 ? `${plan.cardBrand} •••• ${plan.cardLast4}` : "Not added"}</strong></div>
          </section>
          <section className="platform-live-comparison"><div className="platform-comparison-heading"><div><p className="eyebrow">Live Usage · {plan.usagePeriod ? `${date(plan.usagePeriod.start)}–${date(plan.usagePeriod.end)}` : "current month"}</p><h3>{comparison?.withinPlan ? "Within plan" : comparison ? `Over plan by ${comparison.totalOverBy}` : "No usage snapshot"}</h3></div><PlatformBillingActionForm action={refreshPlatformUsageAction} residencyId={residency.id} label="Refresh & log" pendingLabel="Refreshing…" buttonClassName="button secondary" /></div>
            {plan.liveUsage && comparison ? <div className="platform-usage-grid"><UsageMetric label="Talent slots" committed={plan.talentBucketSize} live={plan.liveUsage.talentSessions} /><UsageMetric label="House slots" committed={plan.houseBucketSize} live={plan.liveUsage.housePrograms} /></div> : <p className="muted">Usage is available after the first plan refresh.</p>}
          </section>
          <div className="platform-owner-actions">
            {plan.comped ? <span className="platform-stripe-connected">No payment method required for a comped Residency</span> : !plan.stripeSubscriptionId ? <PlatformBillingActionForm action={startPlatformStripeCheckoutAction} residencyId={residency.id} label="Add test card & start subscription" pendingLabel="Starting Checkout…" /> : <span className="platform-stripe-connected">One continuous Stripe subscription connected</span>}
            {plan.latestInvoice ? <Link className="button secondary" href={`/app/platform-billing/invoices/${plan.latestInvoice.id}/pdf`}>Latest Platform invoice</Link> : null}
          </div>
          <details className="platform-plan-editor"><summary>Edit Committed Plan</summary><CommittedPlanForm residencyId={residency.id} residencyName={residency.name} comped={plan.comped} value={{ term: plan.term, talentBucketSize: plan.talentBucketSize, houseBucketSize: plan.houseBucketSize, startsOn: plan.startsOn, renewsOn: plan.renewsOn }} /></details>
          {plan.recentRevisions.length ? <details className="platform-plan-history"><summary>Plan history</summary><ol>{plan.recentRevisions.map((revision) => <li key={revision.id}><strong>Revision {revision.revision}</strong><span>{date(revision.createdAt)} · {revision.changeReason}</span><small className={revision.stripeSyncStatus === "failed" ? "error" : "muted"}>{revision.stripeSyncStatus.replaceAll("_", " ")}{revision.stripeSyncError ? ` · ${revision.stripeSyncError}` : ""}</small></li>)}</ol></details> : null}
        </article>;
      })}
    </div>
  </WorkspaceSurface>;
}
