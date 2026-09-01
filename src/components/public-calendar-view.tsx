"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { MonthCalendar, type MonthCalendarEvent } from "@/components/month-calendar";
import type { PublicCalendarEntry, PublicCalendarResponse } from "@/domain/public-calendar";
import { monthLabel, monthRange, shiftMonthKey } from "@/lib/calendar";

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function displayAgendaDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function timeMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return 0;
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return (hour * 60) + Number(match[2]);
}

function displayInstagram(value: string) {
  const handle = value.trim();
  if (!handle) return "Instagram not provided";
  return handle.startsWith("@") ? handle : `@${handle}`;
}

function entryId(entry: PublicCalendarEntry, index: number) {
  return `public-${entry.date}-${entry.startTime}-${entry.daypartName}-${index}`;
}

export function PublicCalendarView({ token, monthKey, calendar }: {
  token: string;
  monthKey: string;
  calendar: PublicCalendarResponse;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const range = monthRange(monthKey);
  const visibleEntries = useMemo(() => calendar.entries
    .map((entry, index) => ({ entry, id: entryId(entry, index) }))
    .filter(({ entry }) => entry.date >= range.from && entry.date <= range.to)
    .sort((left, right) => left.entry.date.localeCompare(right.entry.date)
      || timeMinutes(left.entry.startTime) - timeMinutes(right.entry.startTime)), [calendar.entries, range.from, range.to]);
  const selected = visibleEntries.find(({ id }) => id === selectedId)?.entry ?? null;
  const events: MonthCalendarEvent[] = visibleEntries.map(({ entry, id }) => ({
    id,
    date: entry.date,
    title: entry.daypartName,
    time: `${entry.startTime}–${entry.endTime}`,
    residencyName: calendar.residencyName,
    color: entry.color,
    schedulingStatus: "filled",
  }));
  const groups = [...new Set(visibleEntries.map(({ entry }) => entry.date))];

  function monthHref(target: string) {
    return `/share/calendar/${token}?${new URLSearchParams({ month: target }).toString()}`;
  }

  return <main className="public-calendar-page">
    <section className="calendar-main public-calendar-shell" aria-label="Shared programming calendar">
      <div className="calendar-page client-calendar-page public-calendar-grid-page">
        <header className="public-calendar-heading">
          <div>
            <p className="eyebrow">{calendar.residencyName}</p>
            <h1>{monthLabel(monthKey)}</h1>
          </div>
          <nav className="month-navigation" aria-label="Shared calendar month">
            <Link className="calendar-arrow" aria-label="Previous month" href={monthHref(shiftMonthKey(monthKey, -1))}>←</Link>
            <Link className="calendar-arrow" aria-label="Next month" href={monthHref(shiftMonthKey(monthKey, 1))}>→</Link>
          </nav>
        </header>
        <MonthCalendar
          compact
          monthKey={monthKey}
          events={events}
          onEventClick={(event) => setSelectedId(event.id)}
          selectedDate={selected?.date}
          ariaLabel={`${monthLabel(monthKey)} programming calendar`}
        />
      </div>
      <aside className="public-calendar-agenda" aria-labelledby="public-calendar-agenda-title" aria-live="polite">
        {selected ? <div className="public-calendar-detail">
          <header className="public-calendar-detail-heading">
            <button className="public-calendar-detail-back" type="button" onClick={() => setSelectedId(null)}>← At a glance</button>
            <p className="eyebrow">{displayDate(selected.date)}</p>
            <h2 id="public-calendar-agenda-title">{selected.daypartName}</h2>
          </header>
          <div className="public-calendar-detail-body">
            <div className="public-calendar-detail-summary" style={{ "--daypart-color": selected.color } as CSSProperties}>
              <span className="public-calendar-detail-color" aria-hidden="true" />
              <div><small>Time</small><strong>{selected.startTime}–{selected.endTime}</strong></div>
              {selected.room ? <div><small>Location</small><strong>{selected.room}</strong></div> : null}
            </div>
            <section className="public-calendar-artists" aria-label={selected.artists.length === 1 ? "Artist" : "Artists"}>
              <h3>{selected.artists.length === 1 ? "Artist" : "Artists"}</h3>
              {selected.artists.map((artist) => <div className="public-calendar-artist" key={`${artist.name}-${artist.instagramHandle}`}>
                <strong>{artist.name}</strong>
                <span>{displayInstagram(artist.instagramHandle)}</span>
              </div>)}
            </section>
          </div>
        </div> : <>
          <header className="public-calendar-agenda-heading">
            <h2 id="public-calendar-agenda-title">At a glance</h2>
            <p>{visibleEntries.length} {visibleEntries.length === 1 ? "slot" : "slots"}, in chronological order.</p>
          </header>
          <div className="public-calendar-agenda-list">
            {groups.map((date) => <article className="public-calendar-agenda-day" key={date}>
              <h3>{displayAgendaDate(date)}</h3>
              <div>{visibleEntries.filter(({ entry }) => entry.date === date).map(({ entry, id }) => {
                const eventStyle = { "--daypart-color": entry.color } as CSSProperties;
                return <button className="public-calendar-agenda-entry" type="button" style={eventStyle} onClick={() => setSelectedId(id)} key={id}>
                  <span className="public-calendar-agenda-color" aria-hidden="true" />
                  <span><strong>{entry.daypartName}</strong><small>{entry.room ? `${entry.room} · ` : ""}{entry.startTime}–{entry.endTime}</small></span>
                  <span className="public-calendar-agenda-artists">{entry.artists.map((artist) => artist.name).join(", ")}</span>
                </button>;
              })}</div>
            </article>)}
            {!visibleEntries.length ? <div className="card empty">No confirmed programming is listed for this month.</div> : null}
          </div>
        </>}
      </aside>
    </section>

    <footer className="public-calendar-footer">Shared by HFY · Read only</footer>

  </main>;
}
