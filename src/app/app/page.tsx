import Link from "next/link";
import { formatMoney } from "@/components/format";
import { PrivateValue } from "@/components/privacy-mode";
import { getBilledByHfyWorkQueue, getDashboardData, getDeveloperResidencyList, getPendingHfyTalentRequests, getPlatformRevenueDashboard } from "@/data/internal";
import { formatLocalMinute } from "@/domain/dayparts";
import { enterViewAsAction } from "./view-as-actions";
import { CreateResidencyModal } from "./create-residency-modal";
import { HfyRequestQueue } from "./hfy-request-queue";
import { formatServiceTier } from "@/domain/service-tier";
import { WorkspaceSurface } from "@/components/workspace-surface";

const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function hfyResidencyHref(route: string, residencyId: string) {
  return `${route}?${new URLSearchParams({ mode: "hfy", view: "operations", residency: residencyId }).toString()}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ residency?: string; mode?: string; view?: string }> }) {
  const params = await searchParams;
  if (params.mode === "developer") return <DeveloperDashboard />;
  if (params.view === "operations" || params.residency) return <OperationsDashboard residencyId={params.residency} />;
  return <HfyWorkQueue />;
}

async function DeveloperDashboard() {
  const [residencies, platformPlans] = await Promise.all([getDeveloperResidencyList(), getPlatformRevenueDashboard()]);
  const activeCount = residencies.filter((residency) => residency.active).length;
  const completeCount = residencies.filter((residency) => residency.tier === "complete").length;
  const committedPlans = platformPlans.filter((plan) => plan.status !== "cancelled");
  const committedMonthlyCents = committedPlans.reduce((sum, plan) => sum + plan.monthlyAmountCents, 0);
  const overdueCount = platformPlans.filter((plan) => plan.status === "past_due" || plan.status === "unpaid").length;
  return <WorkspaceSurface className="workspace-surface-dashboard workspace-surface-developer-dashboard">
    <header className="page-header owner-mode-header developer-mode-header"><div><p className="eyebrow">Developer · Platform</p><h1>Platform Control</h1><p className="subhead">Every Residency, technical support access, and administrative settings—independent of HFY Programming operations.</p></div><Link className="button secondary" href="/app/setup?mode=developer">Admin Settings</Link></header>
    <section className="owner-mode-summary" aria-label="Platform summary">
      <article><strong>{residencies.length}</strong><span>Total Residencies</span></article>
      <article><strong>{activeCount}</strong><span>Active Platform records</span></article>
      <article><strong>{residencies.length - activeCount}</strong><span>Inactive records</span></article>
      <article><strong>{completeCount}</strong><span>Full Programming</span></article>
    </section>
    <section className="developer-platform-plans" id="committed-plans">
      <div className="section-heading"><div><p className="eyebrow">Platform revenue only</p><h2>Committed Plans</h2><p className="subhead">Subscription commitments, Stripe collection status, and overdue accounts. HFY talent billing is intentionally excluded.</p></div></div>
      <div className="owner-mode-summary platform-revenue-summary" aria-label="Platform revenue summary">
        <article><strong><PrivateValue>{formatMoney(committedMonthlyCents)}</PrivateValue></strong><span>Monthly committed</span></article>
        <article><strong>{committedPlans.length}</strong><span>Committed plans</span></article>
        <article><strong>{overdueCount}</strong><span>Past due / unpaid</span></article>
      </div>
      {platformPlans.length ? <div className="table-wrap"><table><thead><tr><th>Residency</th><th>Plan composition</th><th>Cadence</th><th>Charge</th><th>Stripe status</th><th>Latest payment</th><th>Next charge</th></tr></thead><tbody>{platformPlans.map((plan) => <tr key={plan.id}><td><strong>{plan.residencyName}</strong><small>{plan.residencyActive ? "Active" : "Inactive"}</small></td><td>{plan.talentProgramSessions} Talent Program sessions + {plan.housePrograms} House Programs</td><td>{plan.cadence}</td><td><PrivateValue>{formatMoney(plan.cadenceChargeCents)}</PrivateValue></td><td><span className={`status ${plan.status}`}>{plan.status.replaceAll("_", " ")}</span></td><td>{plan.latestInvoice ? <><span className={`status ${plan.latestInvoice.status}`}>{plan.latestInvoice.status}</span><small><PrivateValue>{formatMoney(plan.latestInvoice.amountDueCents)}</PrivateValue></small></> : "No Stripe invoice"}</td><td>{plan.nextChargeAt ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(plan.nextChargeAt)) : "Not scheduled"}</td></tr>)}</tbody></table></div> : <div className="card empty">No Platform subscription records yet.</div>}
    </section>
    <section className="developer-residencies-section">
      <div className="section-heading"><div><p className="eyebrow">Support directory</p><h2>All Residencies</h2><p className="subhead">Open the exact Residency-facing workspace to investigate support issues, or jump directly to its owner-only configuration.</p></div></div>
      {residencies.length ? <div className="developer-residency-grid">{residencies.map((residency) => <article className={`card developer-residency-card ${residency.active ? "" : "inactive"}`} key={residency.id}>
        <div className="developer-residency-heading"><div><span className="developer-residency-mark">{residency.name.slice(0, 1)}</span><div><h2>{residency.name}</h2><p>{residency.cityState || "Location pending"}</p></div></div><span className={`platform-status ${residency.active ? "active" : "inactive"}`}>{residency.active ? "Active" : "Inactive"}</span></div>
        <dl><div><dt>Service tier</dt><dd>{formatServiceTier(residency.tier)}</dd></div><div><dt>Timezone</dt><dd>{residency.timezone}</dd></div></dl>
        <div className="developer-residency-actions"><form action={enterViewAsAction}><input name="residencyId" type="hidden" value={residency.id} /><button className="button" type="submit">Open Workspace</button></form><Link className="button secondary" href={`/app/setup?${new URLSearchParams({ mode: "developer", residency: residency.id }).toString()}`}>Admin Settings</Link></div>
      </article>)}</div> : <div className="card empty">No Residency records exist yet.</div>}
    </section>
  </WorkspaceSurface>;
}

async function HfyWorkQueue() {
  const [queue, hfyRequests] = await Promise.all([getBilledByHfyWorkQueue(), getPendingHfyTalentRequests()]);
  const today = new Date().toISOString().slice(0, 10);
  const grouped = new Map<string, typeof queue>();
  for (const daypart of queue) {
    const existing = grouped.get(daypart.residencyId) ?? [];
    existing.push(daypart);
    grouped.set(daypart.residencyId, existing);
  }

  return <WorkspaceSurface className="workspace-surface-dashboard workspace-surface-work-queue">
    <header className="page-header owner-mode-header hfy-mode-header"><div><p className="eyebrow">HFY · Programming</p><h1>Work Queue</h1><p className="subhead">Schedule pending client requests quickly, then scan every Standing HFY Booking across all Residencies.</p></div><Link className="button secondary" href="/app?mode=hfy&view=operations">Open Operations</Link></header>
    <HfyRequestQueue requests={hfyRequests.requests} artists={hfyRequests.artists} />
    <section className="hfy-work-queue-section">
      <div className="section-heading"><div><p className="eyebrow">Revenue source of truth</p><h2>Standing HFY Bookings</h2><p className="subhead">Residency Platform status never removes a matching Daypart from this view. Inactive records stay visible and clearly labeled.</p></div></div>
      {queue.length ? <div className="hfy-work-queue-groups">{[...grouped.values()].map((daypartsForResidency) => {
        const first = daypartsForResidency[0];
        return <section className="hfy-work-queue-group" key={first.residencyId}>
          <header><div><p className="eyebrow">{first.residencyCityState || "Location pending"}</p><h3>{first.residencyName}</h3></div><div className="queue-residency-status"><span className={`platform-status ${first.residencyActive ? "active" : "inactive"}`}>{first.residencyActive ? "Platform active" : "Platform inactive"}</span><span className="pill">{formatServiceTier(first.residencyTier)}</span></div></header>
          <div className="hfy-work-queue-list">{daypartsForResidency.map((daypart) => {
            const live = daypart.active && (!daypart.activeUntil || daypart.activeUntil >= today);
            return <article className={live ? "" : "inactive"} key={daypart.id}>
              <span className="queue-color" style={{ background: daypart.color }} aria-hidden="true" />
              <div className="queue-daypart-name"><strong>{daypart.name}</strong><span>{daypart.room || "Room not set"}</span></div>
              <div className="queue-daypart-schedule">{daypart.rules.length ? daypart.rules.map((rule) => <span key={rule.weekday}><strong>{weekdayLabels[rule.weekday]}</strong> {formatLocalMinute(rule.startMinute)}–{formatLocalMinute(rule.endMinute)}{rule.defaultDjCount ? ` · ${rule.defaultDjCount} talent` : ""}</span>) : <span>No standing schedule</span>}</div>
              <div className="queue-daypart-actions"><span className={`platform-status ${live ? "active" : "inactive"}`}>{live ? daypart.activeUntil ? `Live until ${daypart.activeUntil}` : "Live" : daypart.activeUntil && daypart.activeUntil < today ? `Ended ${daypart.activeUntil}` : "Inactive"}</span><Link href={`/app/calendar?${new URLSearchParams({ mode: "hfy", view: "operations", residency: daypart.residencyId }).toString()}`}>Open Calendar →</Link></div>
            </article>;
          })}</div>
        </section>;
      })}</div> : <div className="card empty">No Dayparts are currently set as Standing HFY Bookings.</div>}
    </section>
  </WorkspaceSurface>;
}

async function OperationsDashboard({ residencyId }: { residencyId?: string }) {
  const data = await getDashboardData();
  const selected = residencyId ? data.find((item) => item.id === residencyId) : undefined;

  if (selected) {
    return (
      <WorkspaceSurface className="workspace-surface-dashboard workspace-surface-residency-overview">
        <header className="page-header">
          <div><p className="eyebrow">Residency dashboard</p><h1>{selected.name}</h1><p className="subhead">Everything below belongs only to this residency program.</p></div>
          <span className={`pill ${selected.tier}`}>{formatServiceTier(selected.tier)}</span>
        </header>
        <section className="grid residency-overview-grid">
          <article className="card residency-summary-card">
            <p className="eyebrow">Program snapshot</p>
            <div className="metrics">
              <div className="metric"><strong>{selected.upcomingShiftCount}</strong><span>Upcoming shifts</span></div>
              <div className="metric"><strong>{selected.openAssignmentCount}</strong><span>Open / pending</span></div>
              <div className="metric"><strong><PrivateValue>{formatMoney(selected.readyToPayCents)}</PrivateValue></strong><span>Ready to pay</span></div>
              <div className="metric"><strong><PrivateValue>{formatMoney(selected.outstandingReceivablesCents)}</PrivateValue></strong><span>Receivables</span></div>
            </div>
          </article>
          <article className="card residency-profile-card">
            <div><p className="eyebrow">Residency profile</p><h2>Program details</h2></div>
            <dl>
              <div><dt>Location</dt><dd>{selected.cityState || "Location pending"}</dd></div>
              <div><dt>Service tier</dt><dd>{formatServiceTier(selected.tier)}</dd></div>
              <div><dt>Timezone</dt><dd>{selected.timezone}</dd></div>
            </dl>
            <Link className="button secondary" href={hfyResidencyHref("/app/setup", selected.id)}>Open residency setup</Link>
          </article>
        </section>
        <section className="workspace-shortcuts">
          <Link className="card workspace-shortcut" href={hfyResidencyHref("/app/calendar", selected.id)}><span>01</span><strong>Calendar</strong><small>Shifts and confirmations</small></Link>
          <Link className="card workspace-shortcut" href={hfyResidencyHref("/app/payouts", selected.id)}><span>02</span><strong>Payouts</strong><small>Residency-specific artist payments</small></Link>
          <Link className="card workspace-shortcut" href={hfyResidencyHref("/app/invoices", selected.id)}><span>03</span><strong>Owed to Us</strong><small>HFY talent receivables</small></Link>
        </section>
      </WorkspaceSurface>
    );
  }

  return (
    <WorkspaceSurface className="workspace-surface-dashboard workspace-surface-operations">
      <section className="active-residencies-section">
        <div className="section-heading active-residencies-heading"><div><p className="eyebrow">Operations</p><h2>Active Residencies</h2><p className="subhead">Open a program or create the next Residency from this company workspace.</p></div><CreateResidencyModal /></div>
      {data.length ? (
        <div className="active-residencies-grid">
          {data.map((residency) => (
            <Link className="card residency-card residency-card-button" href={hfyResidencyHref("/app", residency.id)} aria-label={`Open ${residency.name} residency`} key={residency.id}>
              <div className="residency-card-top">
                <div><h2>{residency.name}</h2><p className="location">{residency.cityState || "Location pending"}</p></div>
                <span className={`pill ${residency.tier}`}>{formatServiceTier(residency.tier)}</span>
              </div>
              <div className="metrics">
                <div className="metric"><strong>{residency.upcomingShiftCount}</strong><span>Upcoming shifts</span></div>
                <div className="metric"><strong>{residency.openAssignmentCount}</strong><span>Open / pending</span></div>
                <div className="metric"><strong><PrivateValue>{formatMoney(residency.readyToPayCents)}</PrivateValue></strong><span>Ready to pay</span></div>
                <div className="metric"><strong><PrivateValue>{formatMoney(residency.outstandingReceivablesCents)}</PrivateValue></strong><span>Receivables</span></div>
              </div>
              <div className={residency.attentionCount ? "attention" : "muted"}>
                {residency.attentionCount ? `${residency.attentionCount} item${residency.attentionCount === 1 ? "" : "s"} need attention` : "No open exceptions"}
              </div>
              <span className="card-link">Open residency →</span>
            </Link>
          ))}
        </div>
      ) : <div className="card empty">No active Residencies yet. Create one here when a new hotel is ready to enter HFY OS.</div>}
      </section>
    </WorkspaceSurface>
  );
}
