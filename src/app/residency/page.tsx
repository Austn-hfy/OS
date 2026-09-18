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

function longWeekday(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(dateValue(value));
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

function calendarHref(date: string, eventId?: string, openDate = false, returnToOverview = false) {
  const query = new URLSearchParams({ calendarView: "week", week: date });
  if (eventId) query.set("event", eventId);
  else if (openDate) query.set("date", date);
  if (returnToOverview) query.set("returnTo", `/residency?day=${date}`);
  return `/residency/calendar?${query.toString()}`;
}

function serviceStatusLabel(status: "scheduled" | "pending" | "open") {
  if (status === "scheduled") return "Scheduled";
  if (status === "pending") return "Pending";
  return "Needs coverage";
}

function serviceActionLabel(status: "scheduled" | "pending" | "open") {
  if (status === "scheduled") return "View or edit";
  if (status === "pending") return "Review staffing";
  return "Schedule talent";
}

export default async function ResidencyOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const [actor, params] = await Promise.all([requireResidencyActor(), searchParams]);
  if (actor.accessRole !== "manager") redirect("/residency/access-limited");
  const overview = await getResidencyClientOverview(actor.residencyId, actor.residencyTimezone);
  const selectedDay = overview.week.find((day) => day.date === params.day) ?? overview.week[0];
  const selectedDayNeedsAttention = selectedDay.openCount > 0 || selectedDay.pendingCount > 0;
  const selectedDayTone = selectedDayNeedsAttention
    ? "needs-attention"
    : selectedDay.scheduledCount > 0
      ? "is-ready"
      : "is-neutral";
  const attentionCount = overview.attention.openServiceCount
    + overview.attention.pendingConfirmationCount
    + overview.attention.overdueInvoiceCount;

  return <ResidencyPageSurface className="residency-overview-surface">
    <ResidencyPageHeader
      eyebrow={`${actor.residencyName} · Residency overview`}
      title={`Welcome, ${actor.displayName}`}
    >
      <time className="residency-overview-current-date" dateTime={overview.asOfDate}>{fullDate(overview.asOfDate)}</time>
    </ResidencyPageHeader>
    <ResidencyPageBody className="residency-overview-body">
      <div className="residency-overview-dashboard">
        <ResidencySurfaceCard className="residency-overview-week-card">
          <ResidencySectionHeader
            title="This week"
            eyebrow="Programming coverage"
            description="Select a day to review its programming and take action."
            aside={<Link className="residency-overview-link" href={calendarHref(overview.asOfDate)}>Open calendar <ArrowIcon /></Link>}
            split
          />
          <div className="residency-overview-days">
            {overview.week.map((day, index) => {
              const selected = selectedDay.date === day.date;
              const needsAttention = day.openCount > 0 || day.pendingCount > 0;
              const tone = needsAttention ? "needs-attention" : day.scheduledCount > 0 ? "is-ready" : "is-neutral";
              const details = [
                day.scheduledCount ? `${day.scheduledCount} scheduled` : "",
                day.pendingCount ? `${day.pendingCount} pending` : "",
                day.openCount ? `${day.openCount} open` : "",
              ].filter(Boolean);
              const servicesLabel = day.services.length
                ? day.services.map((service) => `${service.name} in ${service.room}: ${service.status}`).join("; ")
                : "No programming scheduled";
              return <Link
                className={`residency-overview-day${index === 0 ? " is-today" : ""} ${tone}${selected ? " is-selected" : ""}`}
                aria-label={`${shortDate(day.date)}. ${servicesLabel}.`}
                aria-current={selected ? "date" : undefined}
                href={`/residency?day=${day.date}`}
                key={day.date}
              >
                <div className="residency-overview-day-heading">
                  <span className="residency-overview-day-name">{weekday(day.date)}</span>
                  <span className="residency-overview-day-markers">
                    {index === 0 ? <i>Today</i> : null}
                    {needsAttention ? <b aria-label="Needs attention" title="Needs attention">!</b> : null}
                  </span>
                </div>
                <strong>{dayNumber(day.date)}</strong>
                <p>{day.services.length ? `${day.services.length} ${day.services.length === 1 ? "activity" : "activities"}` : "No program"}</p>
                <small>{details.join(" · ") || "Nothing scheduled"}</small>
                <div className="residency-overview-coverage" aria-hidden="true">
                  {day.services.map((service) => <span className={service.status} title={`${service.name} · ${service.status}`} key={service.id} />)}
                </div>
              </Link>;
            })}
          </div>
          <section className={`residency-overview-day-detail ${selectedDayTone}`} aria-labelledby="residency-overview-day-detail-title" aria-live="polite">
            <header className="residency-overview-day-detail-header">
              <div><span className="residency-overview-day-detail-kicker"><i aria-hidden="true" />Day focus · {longWeekday(selectedDay.date)} selected</span><h3 id="residency-overview-day-detail-title">{fullDate(selectedDay.date)}</h3><p>{selectedDay.services.length ? `${selectedDay.services.length} ${selectedDay.services.length === 1 ? "activity" : "activities"} to review.` : "Nothing is programmed yet."}</p></div>
              <Link className="residency-overview-day-detail-week-link" href={calendarHref(selectedDay.date)}>View this week <ArrowIcon /></Link>
            </header>
            {selectedDay.services.length ? <div className="residency-overview-day-services">
              {selectedDay.services.map((service) => {
                const staffing = service.talentNames.length
                  ? service.talentNames.join(" + ")
                  : service.status === "pending"
                    ? "Staffing request is pending"
                    : service.status === "open"
                      ? "Talent has not been assigned"
                      : "Programming is confirmed";
                const actionLabel = serviceActionLabel(service.status);
                return <Link
                  className={`residency-overview-day-service ${service.status}`}
                  aria-label={`${actionLabel} for ${service.name}. ${service.timeLabel} in ${service.room}.`}
                  href={calendarHref(selectedDay.date, service.calendarEventId, false, true)}
                  key={service.id}
                >
                  <span className="residency-overview-day-service-status" aria-hidden="true" />
                  <div className="residency-overview-day-service-copy">
                    <strong>{service.name}</strong>
                    <span>{service.timeLabel} · {service.room}</span>
                    <small>{staffing}</small>
                  </div>
                  <span className="residency-overview-day-service-label">{serviceStatusLabel(service.status)}</span>
                  <span className="residency-overview-day-service-action">{actionLabel} <ArrowIcon /></span>
                </Link>;
              })}
            </div> : <div className="residency-overview-day-empty">
              <div><strong>No programming scheduled</strong><p>Add an activity or open this week in Calendar.</p></div>
              <Link className="residency-overview-day-service-action" href={calendarHref(selectedDay.date, undefined, true, true)}>Add activity <ArrowIcon /></Link>
            </div>}
          </section>
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
