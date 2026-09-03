"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { SlotSchedulingStatus } from "@/domain/dayparts";
import { monthGrid, type CalendarTone } from "@/lib/calendar";

export { calendarToneForSlot } from "@/lib/calendar";

export type MonthCalendarEvent = {
  id: string;
  date: string;
  title: string;
  time: string;
  residencyName: string;
  room?: string;
  tone?: MonthCalendarTone;
  color?: string;
  schedulingStatus?: SlotSchedulingStatus;
  bookingState?: "hfy_pending" | "hfy_confirmed";
  href?: string;
};

export type MonthCalendarTone = CalendarTone;

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthCalendar({ monthKey, events, selectedDate, onDateClick, onEventClick, compact = false, ariaLabel = "Programming calendar" }: { monthKey: string; events: MonthCalendarEvent[]; selectedDate?: string | null; onDateClick?: (date: string) => void; onEventClick?: (event: MonthCalendarEvent) => void; compact?: boolean; ariaLabel?: string }) {
  const days = monthGrid(monthKey);
  const calendarStyle = { "--calendar-weeks": days.length / 7 } as CSSProperties;
  const maxVisibleEvents = compact ? 4 : 5;
  return (
    <div className={`month-calendar-wrap ${compact ? "compact" : ""}`}>
      <div className="month-calendar" role="grid" aria-label={ariaLabel} style={calendarStyle}>
        {weekdays.map((day) => <div className="calendar-weekday" role="columnheader" key={day}>{day}</div>)}
        {days.map((day) => {
          const dayEvents = events.filter((event) => event.date === day.iso);
          const visibleEvents = dayEvents.slice(0, maxVisibleEvents);
          const hiddenCount = dayEvents.length - visibleEvents.length;
          return <div className={`calendar-day ${onDateClick ? "interactive" : ""} ${day.inMonth ? "" : "outside"} ${selectedDate === day.iso ? "selected" : ""}`} role="gridcell" key={day.iso}>
            {onDateClick ? <button className="calendar-date-trigger" type="button" aria-label={`Add to ${day.iso}`} onClick={() => onDateClick(day.iso)}><span className="calendar-day-header"><time dateTime={day.iso}>{day.day}</time>{day.inMonth ? <span className="calendar-add-icon" aria-hidden="true">+</span> : null}</span></button> : <div className="calendar-day-header"><time dateTime={day.iso}>{day.day}</time></div>}
            <div className="calendar-events">{visibleEvents.map((event) => {
              const eventStyle = event.color ? { "--daypart-color": event.color } as CSSProperties : undefined;
              const eventClassName = `calendar-event ${event.schedulingStatus ? `schedule-${event.schedulingStatus}` : event.color ? "custom-color" : event.tone ?? "blue"} ${event.bookingState ? event.bookingState.replace("_", "-") : ""}`;
              const content = <><span className="calendar-event-line"><strong>{event.title}</strong><span>{event.time}</span></span>{compact ? null : <small>{event.residencyName}</small>}{event.bookingState ? <i className="hfy-booking-indicator" aria-label={event.bookingState === "hfy_pending" ? "HFY request pending" : "HFY booked"} /> : null}</>;
              const tooltip = [event.title, event.room, event.time, compact ? event.residencyName : null].filter(Boolean).join(" · ");
              if (onEventClick) return <button className={eventClassName} style={eventStyle} type="button" title={tooltip} aria-label={`Open ${event.title} on ${event.date}`} onClick={() => onEventClick(event)} key={event.id}>{content}</button>;
              if (event.href) return <Link className={eventClassName} style={eventStyle} title={tooltip} aria-label={`Open ${event.title} on ${event.date}`} href={event.href} key={event.id}>{content}</Link>;
              return <div className={eventClassName} style={eventStyle} title={tooltip} key={event.id}>{content}</div>;
            })}{hiddenCount > 0 ? onDateClick
              ? <button className="calendar-more-events" type="button" onClick={() => onDateClick(day.iso)}>+{hiddenCount} more</button>
              : <div className="calendar-more-events">+{hiddenCount} more</div> : null}</div>
          </div>;
        })}
      </div>
    </div>
  );
}
