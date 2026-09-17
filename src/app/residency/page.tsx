import { redirect } from "next/navigation";
import Link from "next/link";
import { ResidencyPageBody, ResidencyPageHeader, ResidencyPageSurface, ResidencySectionHeader, ResidencySurfaceCard } from "@/components/residency-design-system";
import { getResidencyClientOverview, getResidencyPlatformBilling } from "@/data/residency-client";
import { requireResidencyActor } from "@/lib/auth";
import { isCurrentPlatformBillingAvailable } from "@/lib/platform-billing-stage";

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
  if (!isCurrentPlatformBillingAvailable()) redirect("/residency/calendar");
  if (actor.accessRole !== "manager") redirect("/residency/calendar");
  const [overview, billing] = await Promise.all([
    getResidencyClientOverview(actor.residencyId),
    getResidencyPlatformBilling(actor.residencyId),
  ]);
  const plan = billing.subscription;
  return <ResidencyPageSurface className="residency-overview-surface">
    <ResidencyPageHeader eyebrow="Residency workspace" title={`Welcome, ${actor.displayName}`} />
    <ResidencyPageBody className="residency-overview-body">
      <section className="residency-overview-grid">
        <ResidencySurfaceCard as="article" className="residency-overview-program-card"><ResidencySectionHeader eyebrow="Program" title={<>{overview.upcomingServiceCount} upcoming service{overview.upcomingServiceCount === 1 ? "" : "s"}</>} description={overview.nextServiceDate ? `Next service ${date(overview.nextServiceDate)}` : "No upcoming services are scheduled."} /><Link className="button secondary" href="/residency/calendar">Open calendar</Link></ResidencySurfaceCard>
        <ResidencySurfaceCard as="article" className="residency-overview-billing-card"><ResidencySectionHeader className="residency-overview-card-heading" split eyebrow="Platform subscription" title={plan ? `${money(plan.effectiveMonthlyAmountCents)} monthly equivalent` : "Plan pending"} aside={<span className="platform-test-mode-badge">TEST</span>} />
          {plan ? <>
            <dl className="residency-overview-plan-list"><div><dt>Term</dt><dd>{plan.term === "annual" ? "Annual · paid upfront" : "Month-to-month"}</dd></div><div><dt>Next invoice</dt><dd>{money(plan.termChargeAmountCents)} · {date(plan.nextChargeAt ?? plan.renewsOn)}</dd></div><div><dt>Live usage</dt><dd className={billing.comparison?.withinPlan ? "platform-usage-within" : "platform-usage-over"}>{billing.comparison ? billing.comparison.withinPlan ? "Within plan" : `Over by ${billing.comparison.totalOverBy}` : "Calculating"}</dd></div></dl>
            <Link className="button secondary" href="/residency/settings/billing#invoice-history">View plan & invoice history</Link>
          </> : <p>HFY is preparing your Committed Plan. It will appear here once it is confirmed.</p>}
        </ResidencySurfaceCard>
      </section>
    </ResidencyPageBody>
  </ResidencyPageSurface>;
}
