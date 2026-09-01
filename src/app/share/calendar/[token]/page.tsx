import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MonthCalendar, type MonthCalendarEvent } from "@/components/month-calendar";
import { getPublicCalendarByToken } from "@/data/public-calendar";
import { enforcePublicCalendarResponse } from "@/domain/public-calendar";
import { monthLabel, monthRange, normalizeMonthKey, shiftMonthKey } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Programming Calendar · HFY",
  description: "Read-only programming calendar",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function PublicCalendarPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ month?: string }> }) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const result = await getPublicCalendarByToken(token);
  if (!result) notFound();
  const calendar = enforcePublicCalendarResponse(result);
  const monthKey = normalizeMonthKey(query.month);
  const range = monthRange(monthKey);
  const events: MonthCalendarEvent[] = calendar.entries.map((entry, index) => ({
    id: `public-${entry.date}-${entry.startTime}-${index}`,
    date: entry.date,
    title: entry.instagramHandle
      ? entry.instagramHandle.startsWith("@") ? entry.instagramHandle : `@${entry.instagramHandle}`
      : "Instagram not provided",
    time: `${entry.startTime}–${entry.endTime}`,
    residencyName: "",
    tone: "blue",
  }));
  const visibleBookingCount = events.filter((event) => event.date >= range.from && event.date <= range.to).length;

  function monthHref(target: string) {
    return `/share/calendar/${token}?${new URLSearchParams({ month: target }).toString()}`;
  }

  return <main className="public-calendar-page">
    <header className="public-calendar-header"><span className="brand-mark">HFY</span><div><p className="eyebrow">Read-only calendar</p><h1>Programming Schedule</h1><p>Shared scheduling details. This link does not provide access to HFY OS.</p></div></header>
    <section className="public-calendar-surface" aria-label="Programming calendar">
      <div className="public-calendar-toolbar">
        <p>{visibleBookingCount ? `${visibleBookingCount} confirmed booking${visibleBookingCount === 1 ? "" : "s"} this month` : "No confirmed programming is listed for this month."}</p>
        <nav className="month-navigation" aria-label="Shared calendar month">
          <Link className="calendar-arrow" aria-label="Previous month" href={monthHref(shiftMonthKey(monthKey, -1))}>←</Link>
          <h2>{monthLabel(monthKey)}</h2>
          <Link className="calendar-arrow" aria-label="Next month" href={monthHref(shiftMonthKey(monthKey, 1))}>→</Link>
        </nav>
      </div>
      <MonthCalendar compact monthKey={monthKey} events={events} ariaLabel={`${monthLabel(monthKey)} programming calendar`} />
    </section>
    <footer className="public-calendar-footer">Shared by HFY · Read only</footer>
  </main>;
}
