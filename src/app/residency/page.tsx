import { redirect } from "next/navigation";
import Link from "next/link";
import { ResidencyPageHeader } from "@/components/residency-page-header";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { getResidencyClientOverview, getResidencyPlatformBilling } from "@/data/residency-client";
import { requireResidencyActor } from "@/lib/auth";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function date(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}

export default async function ResidencyOverviewPage() {
  const actor = await requireResidencyActor();
  if (actor.accessRole !== "manager") redirect("/residency/calendar");
  const [overview, billing] = await Promise.all([
    getResidencyClientOverview(actor.residencyId),
    getResidencyPlatformBilling(actor.residencyId),
  ]);
  const plan = billing.subscription;
  return <WorkspaceSurface className="residency-workspace-surface residency-overview-surface">
    <ResidencyPageHeader eyebrow="Residency workspace" title={`Welcome, ${actor.displayName}`} />
    <section className="residency-overview-grid">
      <article className="card residency-overview-program-card"><p className="eyebrow">Program</p><h2>{overview.upcomingServiceCount} upcoming service{overview.upcomingServiceCount === 1 ? "" : "s"}</h2><p>{overview.nextServiceDate ? `Next service ${date(overview.nextServiceDate)}` : "No upcoming services are scheduled."}</p><Link className="button secondary" href="/residency/calendar">Open calendar</Link></article>
      <article className="card residency-overview-billing-card"><div className="residency-overview-card-heading"><div><p className="eyebrow">Platform subscription</p><h2>{plan ? `${money(plan.monthlyAmountCents)} monthly plan` : "Plan pending"}</h2></div><span className="platform-test-mode-badge">TEST</span></div>
        {plan ? <>
          <dl className="residency-overview-plan-list"><div><dt>Cadence</dt><dd>{plan.cadence}</dd></div><div><dt>Next invoice</dt><dd>{money(plan.nextChargeAmountCents)} · {date(plan.nextChargeAt ?? plan.renewsOn)}</dd></div><div><dt>Live usage</dt><dd className={billing.comparison?.withinPlan ? "platform-usage-within" : "platform-usage-over"}>{billing.comparison ? billing.comparison.withinPlan ? "Within plan" : `Over by ${billing.comparison.totalOverBy}` : "Calculating"}</dd></div></dl>
          <Link className="button secondary" href="/residency/settings/billing#invoice-history">View plan & invoice history</Link>
        </> : <p>HFY is preparing your Committed Plan. It will appear here once it is confirmed.</p>}
      </article>
    </section>
  </WorkspaceSurface>;
}
