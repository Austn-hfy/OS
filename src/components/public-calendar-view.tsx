"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
    .filter(({ entry }) => entry.date >= range.from && entry.date <= range.to), [calendar.entries, range.from, range.to]);
  const selected = visibleEntries.find(({ id }) => id === selectedId)?.entry ?? null;
  const events: MonthCalendarEvent[] = calendar.entries.map((entry, index) => ({
    id: entryId(entry, index),
    date: entry.date,
    title: entry.daypartName,
    time: `${entry.startTime}–${entry.endTime}`,
    residencyName: calendar.residencyName,
    color: entry.color,
    schedulingStatus: "filled",
  }));
  const groups = [...new Set(visibleEntries.map(({ entry }) => entry.date))];

  useEffect(() => {
    if (!selected) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  function monthHref(target: string) {
    return `/share/calendar/${token}?${new URLSearchParams({ month: target }).toString()}`;
  }

  return <main className="public-calendar-page">
    <section className="calendar-main public-calendar-shell" aria-label="Shared programming calendar">
      <div className="calendar-page client-calendar-page public-calendar-grid-page">
        <header className="page-header calendar-page-header calendar-command-bar">
          <div className="calendar-command-primary">
            <div className="calendar-title"><p className="eyebrow">{calendar.residencyName}</p><h1>Calendar</h1></div>
            <div className="calendar-month-cluster">
              <div className="calendar-needs-summary clear public-calendar-count"><strong>{visibleEntries.length}</strong><span>{visibleEntries.length === 1 ? "scheduled slot" : "scheduled slots"}</span></div>
              <nav className="month-navigation" aria-label="Shared calendar month">
                <Link className="calendar-arrow" aria-label="Previous month" href={monthHref(shiftMonthKey(monthKey, -1))}>←</Link>
                <h2>{monthLabel(monthKey)}</h2>
                <Link className="calendar-arrow" aria-label="Next month" href={monthHref(shiftMonthKey(monthKey, 1))}>→</Link>
              </nav>
            </div>
          </div>
          <div className="calendar-command-secondary public-calendar-command-secondary">
            <p><strong>Shared schedule</strong><span>Click any Daypart for artist details, or scan the date list below.</span></p>
            <span className="public-calendar-read-only">Read only</span>
          </div>
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
    </section>

    <section className="public-calendar-agenda" aria-labelledby="public-calendar-agenda-title">
      <header className="public-calendar-agenda-heading">
        <div><p className="eyebrow">At a glance</p><h2 id="public-calendar-agenda-title">{monthLabel(monthKey)} schedule</h2></div>
        <p>Artist names and Instagram handles only. No private contact or financial information is shared.</p>
      </header>
      <div className="public-calendar-agenda-list">
        {groups.map((date) => <article className="public-calendar-agenda-day" key={date}>
          <h3>{displayDate(date)}</h3>
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
    </section>

    <footer className="public-calendar-footer">Shared by HFY · Read only</footer>

    {selected ? <div className="quick-modal-backdrop public-calendar-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedId(null); }}>
      <section className="quick-modal public-calendar-modal" role="dialog" aria-modal="true" aria-labelledby="public-calendar-modal-title">
        <header className="quick-modal-header">
          <div><p className="eyebrow">{displayDate(selected.date)}</p><h2 id="public-calendar-modal-title">{selected.daypartName}</h2></div>
          <button className="quick-modal-close" type="button" aria-label="Close popup" onClick={() => setSelectedId(null)}>×</button>
        </header>
        <div className="quick-modal-body">
          <div className="public-calendar-modal-summary" style={{ "--daypart-color": selected.color } as CSSProperties}>
            <span className="public-calendar-modal-color" aria-hidden="true" />
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
      </section>
    </div> : null}
  </main>;
}
