"use client";

import { useMemo, useState } from "react";
import { monthGrid, monthLabel, shiftMonthKey } from "@/lib/calendar";

type BookingDate = { serviceDate: string };
const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];

export function ArtistBookingCalendar({ artistId, bookings }: { artistId: string; bookings: BookingDate[] }) {
  const firstMonth = bookings[0]?.serviceDate.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const [selection, setSelection] = useState({ artistId, monthKey: firstMonth });
  const monthKey = selection.artistId === artistId ? selection.monthKey : firstMonth;
  const bookingCounts = useMemo(() => bookings.reduce<Record<string, number>>((counts, booking) => {
    counts[booking.serviceDate] = (counts[booking.serviceDate] ?? 0) + 1;
    return counts;
  }, {}), [bookings]);

  return <div className="artist-mini-calendar" aria-label={`${monthLabel(monthKey)} booking calendar`}>
    <div className="artist-mini-calendar-heading"><button type="button" aria-label="Previous booking month" onClick={() => setSelection({ artistId, monthKey: shiftMonthKey(monthKey, -1) })}>←</button><strong>{monthLabel(monthKey)}</strong><button type="button" aria-label="Next booking month" onClick={() => setSelection({ artistId, monthKey: shiftMonthKey(monthKey, 1) })}>→</button></div>
    <div className="artist-mini-calendar-grid">{weekdayLabels.map((weekday, index) => <span className="artist-mini-weekday" key={`${weekday}-${index}`}>{weekday}</span>)}{monthGrid(monthKey).map((day) => {
      const count = bookingCounts[day.iso] ?? 0;
      return <div className={`artist-mini-day ${day.inMonth ? "" : "outside"} ${count ? "booked" : ""}`} title={count ? `${count} booking${count === 1 ? "" : "s"}` : undefined} key={day.iso}><time dateTime={day.iso}>{day.day}</time>{count ? <span>{count}</span> : null}</div>;
    })}</div>
  </div>;
}
