"use client";

import { formatDate } from "@/components/format";
import { clockToMinute, resolveEndMinute } from "@/domain/dayparts";
import { monthGrid, monthLabel } from "@/lib/calendar";
import { HfyRequestFulfillment } from "./hfy-request-fulfillment";

type RequestRow = {
  id: string;
  residencyId: string;
  residencyName: string;
  residencyTimezone: string;
  shiftName: string;
  room: string;
  serviceDate: string;
  startsAt: string;
  endsAt: string;
  ratesConfigured: boolean;
};

type Artist = { id: string; stageName: string; homeMarket: string; exclusiveResidencyId: string | null };
const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];

function localClock(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(value));
}

function displayTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
}

function RequestDateContext({ serviceDate }: { serviceDate: string }) {
  const monthKey = serviceDate.slice(0, 7);
  const days = monthGrid(monthKey);
  return <aside className="hfy-request-date-context" aria-label={`Calendar context for ${serviceDate}`}>
    <div className="hfy-request-date-heading"><span>On the calendar</span><strong>{monthLabel(monthKey)}</strong></div>
    <div className="hfy-request-mini-calendar" role="grid" aria-label={monthLabel(monthKey)}>
      {weekdayLabels.map((weekday, index) => <span className="hfy-request-mini-weekday" role="columnheader" key={`${weekday}-${index}`}>{weekday}</span>)}
      {days.map((day) => <span className={`${day.inMonth ? "" : "outside"} ${day.iso === serviceDate ? "selected" : ""}`} role="gridcell" aria-selected={day.iso === serviceDate} key={day.iso}>{day.day}</span>)}
    </div>
    <time dateTime={serviceDate}>{formatDate(serviceDate, { weekday: "long", month: "long", day: "numeric" })}</time>
  </aside>;
}

export function HfyRequestQueue({ requests, artists }: { requests: RequestRow[]; artists: Artist[] }) {
  return <section className="hfy-request-queue-section">
    <div className="section-heading hfy-request-section-heading"><div><p className="eyebrow">Client requests</p><h2>Pending Request HFY</h2><p className="subhead">Move down the list, see each date in context, and schedule one artist or split the shift.</p></div><span className="status hfy-request-pending-count">{requests.length} need scheduling</span></div>
    {requests.length ? <div className="hfy-request-list">{requests.map((request) => {
      const available = artists.filter((artist) => !artist.exclusiveResidencyId || artist.exclusiveResidencyId === request.residencyId);
      const shiftStartMinute = clockToMinute(localClock(request.startsAt, request.residencyTimezone));
      const shiftEndMinute = resolveEndMinute(shiftStartMinute, localClock(request.endsAt, request.residencyTimezone));
      return <article className="card hfy-request-card" key={request.id}>
        <div className="hfy-request-details"><div className="hfy-request-label-row"><p className="eyebrow">{request.residencyName}</p><span className="status hfy-request-pending">Needs artist</span></div><h3>{request.shiftName}</h3><dl><div><dt>Date</dt><dd>{formatDate(request.serviceDate, { month: "short", day: "numeric", year: "numeric" })}</dd></div><div><dt>Room</dt><dd>{request.room}</dd></div><div><dt>Hours</dt><dd>{displayTime(request.startsAt, request.residencyTimezone)}–{displayTime(request.endsAt, request.residencyTimezone)}</dd></div></dl></div>
        <HfyRequestFulfillment requestId={request.id} shiftName={request.shiftName} shiftStartMinute={shiftStartMinute} shiftEndMinute={shiftEndMinute} artists={available} ratesConfigured={request.ratesConfigured} />
        <RequestDateContext serviceDate={request.serviceDate} />
      </article>;
    })}</div> : <div className="card empty">No pending Request HFY items.</div>}
  </section>;
}
