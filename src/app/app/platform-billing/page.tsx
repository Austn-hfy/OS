import Link from "next/link";
import { formatMoney } from "@/components/format";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { getDeveloperResidencyList, getPlatformRevenueDashboard } from "@/data/internal";
import { requireInternalActor } from "@/lib/auth";
import { CommittedPlanForm } from "./committed-plan-form";
import { refreshPlatformUsageAction, startPlatformStripeCheckoutAction } from "./actions";

function date(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
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

export default async function PlatformBillingPage({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  await requireInternalActor();
  const [{ stripe }, residencies, plans] = await Promise.all([searchParams, getDeveloperResidencyList(), getPlatformRevenueDashboard()]);
  const planByResidency = new Map(plans.map((plan) => [plan.residencyId, plan]));
  const defaults = defaultDates();

  return <WorkspaceSurface className="workspace-surface-platform-console">
    <header className="page-header owner-mode-header developer-mode-header"><div><p className="eyebrow">Developer · owner only</p><h1>Platform billing</h1><p className="subhead">Committed Plans determine Stripe billing. Live Usage is comparison-only and overages are logged without charges or access restrictions.</p></div><span className="platform-test-mode-badge">Stripe test mode only</span></header>
    {stripe === "success" ? <p className="success">Stripe Checkout completed. Webhook reconciliation will update the subscription and invoice history.</p> : null}
    {stripe === "cancelled" ? <p className="muted">Stripe Checkout was cancelled. No subscription was created.</p> : null}
    <div className="platform-billing-residencies">
      {residencies.map((residency) => {
        const plan = planByResidency.get(residency.id);
        if (!plan) return <article className="card platform-owner-card" key={residency.id}>
          <header><div><p className="eyebrow">No Committed Plan</p><h2>{residency.name}</h2><p>{residency.cityState || "Location pending"}</p></div><span className="status incomplete">Not connected</span></header>
          <CommittedPlanForm residencyId={residency.id} residencyName={residency.name} value={{ cadence: "monthly", talentProgramSessions: 0, housePrograms: 0, oneOffAllowance: 0, unitAmountCents: 0, startsOn: defaults.start, renewsOn: defaults.renewal }} />
        </article>;
        const comparison = plan.comparison;
        return <article className="card platform-owner-card" key={residency.id}>
          <header className="platform-owner-card-heading"><div><p className="eyebrow">Committed Plan · revision {plan.revision}</p><h2>{plan.residencyName}</h2><p>{plan.residencyActive ? plan.residencyName : `${plan.residencyName} · inactive`}</p></div><div className="platform-owner-statuses"><span className="platform-test-mode-badge">TEST</span><span className={`status ${plan.status}`}>{plan.status.replaceAll("_", " ")}</span></div></header>
          {plan.paymentFailedAt ? <div className="platform-payment-failed-inline" role="alert"><strong>Payment failed</strong><span>{plan.paymentFailureMessage || "Stripe could not collect the latest payment."} Hotel access remains active.</span></div> : null}
          <section className="platform-owner-plan-summary">
            <div><small>Monthly plan</small><strong>{formatMoney(plan.monthlyAmountCents)}</strong></div><div><small>{plan.cadence} charge</small><strong>{formatMoney(plan.cadenceChargeCents)}</strong></div><div><small>Next invoice</small><strong>{date(plan.nextChargeAt ?? plan.renewsOn)}</strong></div><div><small>Card</small><strong>{plan.cardLast4 ? `${plan.cardBrand} •••• ${plan.cardLast4}` : "Not added"}</strong></div>
          </section>
          <section className="platform-live-comparison"><div className="platform-comparison-heading"><div><p className="eyebrow">Live Usage · {plan.usagePeriod ? `${date(plan.usagePeriod.start)}–${date(plan.usagePeriod.end)}` : "current month"}</p><h3>{comparison?.withinPlan ? "Within plan" : comparison ? `Over plan by ${comparison.totalOverBy}` : "No usage snapshot"}</h3></div><form action={refreshPlatformUsageAction}><input type="hidden" name="residencyId" value={residency.id} /><button className="button secondary" type="submit">Refresh & log</button></form></div>
            {plan.liveUsage && comparison ? <div className="platform-usage-grid"><UsageMetric label="Talent sessions" committed={plan.talentProgramSessions} live={plan.liveUsage.talentSessions} /><UsageMetric label="House programs" committed={plan.housePrograms} live={plan.liveUsage.housePrograms} /><UsageMetric label="One-offs" committed={plan.oneOffAllowance} live={plan.liveUsage.oneOffs} /></div> : <p className="muted">Usage is available after the first plan refresh.</p>}
          </section>
          <div className="platform-owner-actions">
            {!plan.stripeSubscriptionId ? <form action={startPlatformStripeCheckoutAction}><input type="hidden" name="residencyId" value={residency.id} /><button className="button" type="submit">Add test card & start subscription</button></form> : <span className="platform-stripe-connected">One continuous Stripe subscription connected</span>}
            {plan.latestInvoice ? <Link className="button secondary" href={`/app/platform-billing/invoices/${plan.latestInvoice.id}/pdf`}>Latest Platform invoice</Link> : null}
          </div>
          <details className="platform-plan-editor"><summary>Edit Committed Plan</summary><CommittedPlanForm residencyId={residency.id} residencyName={residency.name} value={{ cadence: plan.cadence, talentProgramSessions: plan.talentProgramSessions, housePrograms: plan.housePrograms, oneOffAllowance: plan.oneOffAllowance, unitAmountCents: plan.unitAmountCents, startsOn: plan.startsOn, renewsOn: plan.renewsOn }} /></details>
          {plan.recentRevisions.length ? <details className="platform-plan-history"><summary>Plan history</summary><ol>{plan.recentRevisions.map((revision) => <li key={revision.id}><strong>Revision {revision.revision}</strong><span>{date(revision.createdAt)} · {revision.changeReason}</span><small className={revision.stripeSyncStatus === "failed" ? "error" : "muted"}>{revision.stripeSyncStatus.replaceAll("_", " ")}{revision.stripeSyncError ? ` · ${revision.stripeSyncError}` : ""}</small></li>)}</ol></details> : null}
        </article>;
      })}
    </div>
  </WorkspaceSurface>;
}
