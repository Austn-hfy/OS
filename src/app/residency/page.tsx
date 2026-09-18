import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ResidencyPageBody,
  ResidencyPageHeader,
  ResidencyPageSurface,
  ResidencySectionHeader,
  ResidencySurfaceCard,
} from "@/components/residency-design-system";
import { getResidencyClientOverview } from "@/data/residency-overview";
import { requireResidencyActor } from "@/lib/auth";

function dateValue(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(dateValue(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dateValue(value));
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(dateValue(value));
}

function weekday(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(dateValue(value));
}

function dayNumber(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(dateValue(value));
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "HF";
}

function ArrowIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 12 12 4M6 4h6v6" /></svg>;
}

function CalendarAlertIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 6.5h12M6.5 3.5v3M13.5 3.5v3M4.5 5h11v11h-11zM7 10h3M7 13h2" /></svg>;
}

function ConfirmationIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 3.5h8l2 2V16H5zM12.5 3.5V6H15M7.5 9h5M7.5 12h3" /></svg>;
}

function InvoiceAlertIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 3.5h10V16l-2-1-2 1-2-1-2 1-2-1zM8 7h4M8 10h4M8 13h2" /></svg>;
}

export default async function ResidencyOverviewPage() {
  const actor = await requireResidencyActor();
  if (actor.accessRole !== "manager") redirect("/residency/access-limited");
  const overview = await getResidencyClientOverview(actor.residencyId, actor.residencyTimezone);
  const attentionCount = overview.attention.openServiceCount
    + overview.attention.pendingConfirmationCount
    + overview.attention.overdueInvoiceCount;
  const statusSummary = attentionCount
    ? `${attentionCount} operational ${attentionCount === 1 ? "item needs" : "items need"} attention.`
    : "Your operational work is clear right now.";

  return <ResidencyPageSurface className="residency-overview-surface">
    <ResidencyPageHeader
      eyebrow={`${actor.residencyName} · Residency overview`}
      title={`Welcome, ${actor.displayName}`}
      description={statusSummary}
    >
      <time className="residency-overview-current-date" dateTime={overview.asOfDate}>{fullDate(overview.asOfDate)}</time>
    </ResidencyPageHeader>
    <ResidencyPageBody className="residency-overview-body">
      <div className="residency-overview-dashboard">
        <ResidencySurfaceCard className="residency-overview-week-card">
          <ResidencySectionHeader
            title="This week"
            eyebrow="Programming coverage"
            description="Scheduled activity, pending coverage, and open Daypart gaps across the next seven days."
            aside={<Link className="residency-overview-link" href="/residency/calendar">Open calendar <ArrowIcon /></Link>}
            split
          />
          <div className="residency-overview-days">
            {overview.week.map((day, index) => {
              const details = [
                day.scheduledCount ? `${day.scheduledCount} scheduled` : "",
                day.pendingCount ? `${day.pendingCount} pending` : "",
                day.openCount ? `${day.openCount} open` : "",
              ].filter(Boolean);
              const servicesLabel = day.services.length
                ? day.services.map((service) => `${service.name} in ${service.room}: ${service.status}`).join("; ")
                : "No programming scheduled";
              return <article
                className={`residency-overview-day${index === 0 ? " is-today" : ""}${day.openCount ? " needs-attention" : ""}`}
                aria-label={`${shortDate(day.date)}. ${servicesLabel}.`}
                key={day.date}
              >
                <div className="residency-overview-day-heading"><span>{weekday(day.date)}</span>{index === 0 ? <i aria-label="Today" /> : null}</div>
                <strong>{dayNumber(day.date)}</strong>
                <p>{day.services.length ? `${day.services.length} ${day.services.length === 1 ? "activity" : "activities"}` : "No program"}</p>
                <small>{details.join(" · ") || "Nothing scheduled"}</small>
                <div className="residency-overview-coverage" aria-hidden="true">
                  {day.services.map((service) => <span className={service.status} title={`${service.name} · ${service.status}`} key={service.id} />)}
                </div>
              </article>;
            })}
          </div>
        </ResidencySurfaceCard>

        <ResidencySurfaceCard className="residency-overview-attention-card">
          <ResidencySectionHeader
            title="Needs attention"
            eyebrow="Operational exceptions"
            description="Only work that needs a decision or follow-up."
            aside={<span className={`residency-overview-count${attentionCount ? " has-items" : ""}`}>{attentionCount} {attentionCount === 1 ? "item" : "items"}</span>}
            split
          />
          {attentionCount ? <div className="residency-overview-attention-list">
            {overview.attention.openServiceCount ? <Link className="residency-overview-attention-item" href="/residency/calendar">
              <span className="residency-overview-attention-icon"><CalendarAlertIcon /></span>
              <span><strong>{overview.attention.openServiceCount} {overview.attention.openServiceCount === 1 ? "service needs" : "services need"} scheduling</strong><small>{overview.attention.nextOpenService ? `Next: ${overview.attention.nextOpenService.name} · ${shortDate(overview.attention.nextOpenService.serviceDate)}` : "Open Calendar to review coverage."}</small></span>
              <ArrowIcon />
            </Link> : null}
            {overview.attention.pendingConfirmationCount ? <Link className="residency-overview-attention-item pending" href="/residency/talent">
              <span className="residency-overview-attention-icon"><ConfirmationIcon /></span>
              <span><strong>{overview.attention.pendingConfirmationCount} talent {overview.attention.pendingConfirmationCount === 1 ? "confirmation is" : "confirmations are"} pending</strong><small>{overview.attention.nextPendingConfirmation ? `${overview.attention.nextPendingConfirmation.talentName} · ${shortDate(overview.attention.nextPendingConfirmation.serviceDate)}` : "Open Talent to follow up."}</small></span>
              <ArrowIcon />
            </Link> : null}
            {overview.attention.overdueInvoiceCount ? <Link className="residency-overview-attention-item" href="/residency/finances">
              <span className="residency-overview-attention-icon"><InvoiceAlertIcon /></span>
              <span><strong>{overview.attention.overdueInvoiceCount} talent {overview.attention.overdueInvoiceCount === 1 ? "invoice is" : "invoices are"} overdue</strong><small>{money(overview.attention.overdueInvoiceCents)} outstanding</small></span>
              <ArrowIcon />
            </Link> : null}
          </div> : <div className="residency-overview-all-clear">
            <span aria-hidden="true">✓</span><div><strong>All clear</strong><p>No open scheduling gaps, pending confirmations, or overdue talent invoices need attention.</p></div>
          </div>}
        </ResidencySurfaceCard>

        <ResidencySurfaceCard className="residency-overview-talent-card">
          <ResidencySectionHeader
            title="Talent"
            eyebrow="Upcoming roster"
            description="Active roster and upcoming talent bookings."
            aside={<Link className="residency-overview-link" href="/residency/talent">View talent <ArrowIcon /></Link>}
            split
          />
          <dl className="residency-overview-talent-stats">
            <div><dt>Active roster</dt><dd>{overview.talent.activeRosterCount}</dd></div>
            <div><dt>Upcoming</dt><dd>{overview.talent.upcomingTalentCount}</dd></div>
            <div><dt>Pending</dt><dd>{overview.talent.pendingConfirmationCount}</dd></div>
          </dl>
          {overview.talent.upcomingBookings.length ? <div className="residency-overview-bookings">
            {overview.talent.upcomingBookings.map((booking) => {
              const href = booking.talentId && (actor.residencyTier !== "complete" || booking.ownership === "hfy")
                ? `/residency/talent?artist=${booking.talentId}`
                : null;
              const content = <>
                <span className="residency-overview-avatar" aria-hidden="true">{initials(booking.talentName)}</span>
                <span className="residency-overview-booking-copy"><strong>{booking.talentName}</strong><small>{booking.activityName} · {booking.room}</small></span>
                <time dateTime={booking.serviceDate}>{shortDate(booking.serviceDate)}</time>
              </>;
              return href
                ? <Link className="residency-overview-booking" href={href} key={booking.id}>{content}</Link>
                : <div className="residency-overview-booking" key={booking.id}>{content}</div>;
            })}
          </div> : <div className="residency-overview-empty">No upcoming talent bookings are scheduled.</div>}
        </ResidencySurfaceCard>

        <ResidencySurfaceCard className="residency-overview-finance-card">
          <ResidencySectionHeader
            title="Finances"
            eyebrow="Talent commitments"
            description="Operational talent obligations only."
            aside={<Link className="residency-overview-link" href="/residency/finances">Open finances <ArrowIcon /></Link>}
            split
          />
          <div className="residency-overview-finance-primary"><strong>{money(overview.finances.currentMonthCommitmentsCents)}</strong><span>Scheduled in {monthLabel(overview.asOfDate)}</span></div>
          <dl className="residency-overview-finance-facts">
            <div><dt>Owed to your talent</dt><dd>{money(overview.finances.owedToResidencyTalentCents)}</dd></div>
            <div><dt>HFY talent invoices</dt><dd>{money(overview.finances.outstandingHfyInvoicesCents)}</dd></div>
          </dl>
          <div className={`residency-overview-invoice-status${overview.finances.overdueInvoiceCount ? " overdue" : ""}`}>
            <span><strong>{overview.finances.openInvoiceCount}</strong> open</span>
            <span><strong>{overview.finances.overdueInvoiceCount}</strong> overdue</span>
          </div>
        </ResidencySurfaceCard>
      </div>
    </ResidencyPageBody>
  </ResidencyPageSurface>;
}
