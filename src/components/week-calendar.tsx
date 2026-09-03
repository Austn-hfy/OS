"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { weekDays } from "@/lib/calendar";
import type { MonthCalendarEvent } from "@/components/month-calendar";

function eventDetails(time: string) {
  const [timeRange, ...statusParts] = time.split(" · ");
  return { timeRange, status: statusParts.join(" · ") || "Scheduled" };
}

export function WeekCalendar({ weekStart, events, selectedDate, onDateClick, onEventClick, ariaLabel = "Programming calendar week" }: {
  weekStart: string;
  events: MonthCalendarEvent[];
  selectedDate?: string | null;
  onDateClick?: (date: string) => void;
  onEventClick?: (event: MonthCalendarEvent) => void;
  ariaLabel?: string;
}) {
  const days = weekDays(weekStart);

  return <div className="week-calendar-wrap">
    <div className="week-calendar" role="grid" aria-label={ariaLabel}>
      {days.map((day) => {
        const dayEvents = events.filter((event) => event.date === day.iso);
        return <section className={`week-calendar-day ${selectedDate === day.iso ? "selected" : ""}`} role="gridcell" key={day.iso}>
          <header className="week-calendar-day-header">
            <div><span>{day.weekday}</span><time dateTime={day.iso}>{day.month} {day.day}</time></div>
            {onDateClick ? <button type="button" aria-label={`Add to ${day.iso}`} onClick={() => onDateClick(day.iso)}>+</button> : null}
          </header>
          <div className="week-calendar-events">
            {dayEvents.length ? dayEvents.map((event) => {
              const { timeRange, status } = eventDetails(event.time);
              const eventStyle = event.color ? { "--daypart-color": event.color } as CSSProperties : undefined;
              const eventClassName = `week-calendar-event ${event.schedulingStatus ? `schedule-${event.schedulingStatus}` : event.color ? "custom-color" : event.tone ?? "blue"} ${event.bookingState ? event.bookingState.replace("_", "-") : ""}`;
              const content = <><strong>{event.title}</strong><span>{event.room || "Room not set"}</span><span>{timeRange}</span><b>{status}</b>{event.bookingState ? <i className="hfy-booking-indicator" aria-label={event.bookingState === "hfy_pending" ? "HFY request pending" : "HFY booked"} /> : null}</>;
              const label = `${event.title}, ${event.room || "room not set"}, ${event.time}`;
              if (onEventClick) return <button className={eventClassName} style={eventStyle} type="button" aria-label={`Open ${label} on ${event.date}`} onClick={() => onEventClick(event)} key={event.id}>{content}</button>;
              if (event.href) return <Link className={eventClassName} style={eventStyle} aria-label={`Open ${label} on ${event.date}`} href={event.href} key={event.id}>{content}</Link>;
              return <div className={eventClassName} style={eventStyle} key={event.id}>{content}</div>;
            }) : <p className="week-calendar-empty">No dayparts</p>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
