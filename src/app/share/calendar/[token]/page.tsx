import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCalendarByToken } from "@/data/public-calendar";
import { enforcePublicCalendarResponse } from "@/domain/public-calendar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Programming Calendar · HFY",
  description: "Read-only programming calendar",
  robots: { index: false, follow: false, noarchive: true },
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default async function PublicCalendarPage({ params }: { params: Promise<{ token: string }> }) {
  const result = await getPublicCalendarByToken((await params).token);
  if (!result) notFound();
  const calendar = enforcePublicCalendarResponse(result);
  const groups = [...new Set(calendar.entries.map((entry) => entry.date))];

  return <main className="public-calendar-page">
    <header className="public-calendar-header"><span className="brand-mark">HFY</span><div><p className="eyebrow">Read-only calendar</p><h1>Programming Schedule</h1><p>Shared scheduling details. This link does not provide access to HFY OS.</p></div></header>
    <section className="public-calendar-list" aria-label="Programming dates">
      {groups.map((date) => <article className="public-calendar-day" key={date}>
        <h2>{displayDate(date)}</h2>
        <div>{calendar.entries.filter((entry) => entry.date === date).map((entry, index) => <div className="public-calendar-entry" key={`${entry.instagramHandle}-${entry.startTime}-${index}`}><strong>{entry.instagramHandle ? entry.instagramHandle.startsWith("@") ? entry.instagramHandle : `@${entry.instagramHandle}` : "Instagram not provided"}</strong><span>{entry.startTime}–{entry.endTime}</span></div>)}</div>
      </article>)}
      {!calendar.entries.length ? <div className="card empty">No confirmed programming is currently listed.</div> : null}
    </section>
    <footer className="public-calendar-footer">Shared by HFY · Read only</footer>
  </main>;
}
