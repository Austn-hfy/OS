import Link from "next/link";
import { formatMoney } from "@/components/format";
import { PrivateValue } from "@/components/privacy-mode";
import { getDashboardData } from "@/data/internal";
import { CreateResidencyModal } from "./create-residency-modal";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ residency?: string }> }) {
  const { residency: residencyId } = await searchParams;
  const data = await getDashboardData();
  const selected = residencyId ? data.find((item) => item.id === residencyId) : undefined;

  if (selected) {
    return (
      <>
        <header className="page-header">
          <div><p className="eyebrow">Residency dashboard</p><h1>{selected.name}</h1><p className="subhead">Everything below belongs only to this residency program.</p></div>
          <span className={`pill ${selected.tier}`}>{selected.tier.replaceAll("_", " ")}</span>
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
              <div><dt>Service tier</dt><dd>{selected.tier.replaceAll("_", " ")}</dd></div>
              <div><dt>Timezone</dt><dd>{selected.timezone}</dd></div>
            </dl>
            <Link className="button secondary" href={`/app/setup?residency=${selected.id}`}>Open residency setup</Link>
          </article>
        </section>
        <section className="workspace-shortcuts">
          <Link className="card workspace-shortcut" href={`/app/calendar?residency=${selected.id}`}><span>01</span><strong>Calendar</strong><small>Shifts and confirmations</small></Link>
          <Link className="card workspace-shortcut" href={`/app/payouts?residency=${selected.id}`}><span>02</span><strong>Payouts</strong><small>Residency-specific artist payments</small></Link>
          <Link className="card workspace-shortcut" href={`/app/invoices?residency=${selected.id}`}><span>03</span><strong>Invoices</strong><small>Billing and delivery</small></Link>
        </section>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">HFY company</p>
          <h1>Overview</h1>
          <p className="subhead">See every residency at once, then open one to work inside that program.</p>
        </div>
      </header>
      <section className="active-residencies-section">
        <div className="section-heading active-residencies-heading"><div><p className="eyebrow">Operations</p><h2>Active Residencies</h2><p className="subhead">Open a program or create the next Residency from this company workspace.</p></div><CreateResidencyModal /></div>
      {data.length ? (
        <div className="active-residencies-grid">
          {data.map((residency) => (
            <Link className="card residency-card residency-card-button" href={`/app?residency=${residency.id}`} aria-label={`Open ${residency.name} residency`} key={residency.id}>
              <div className="residency-card-top">
                <div><h2>{residency.name}</h2><p className="location">{residency.cityState || "Location pending"}</p></div>
                <span className={`pill ${residency.tier}`}>{residency.tier.replaceAll("_", " ")}</span>
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
    </>
  );
}
