import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonthCalendar, type MonthCalendarEvent } from "../src/components/month-calendar";

describe("MonthCalendar", () => {
  it("highlights today and marks only events that need scheduling attention", () => {
    const events: MonthCalendarEvent[] = [
      {
        id: "open",
        date: "2026-09-18",
        title: "DJ - Main Pool",
        time: "12–7 PM · Needs scheduling",
        residencyName: "Ace Hotel",
        color: "#cce4f6",
        schedulingStatus: "empty",
      },
      {
        id: "scheduled",
        date: "2026-09-18",
        title: "Deep Dives",
        time: "7–9 PM · 1 talent",
        residencyName: "Ace Hotel",
        color: "#124a80",
        schedulingStatus: "filled",
      },
    ];

    const html = renderToStaticMarkup(createElement(MonthCalendar, {
      monthKey: "2026-09",
      events,
      today: "2026-09-18",
      compact: true,
    }));

    expect(html).toContain('class="calendar-day   today ');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain('class="calendar-today-label">Today</span>');
    expect(html.match(/calendar-attention-indicator/g)).toHaveLength(1);
    expect(html).toContain("<span>12–7 PM</span>");
    expect(html).toContain("<span>7–9 PM</span>");
    expect(html).not.toContain("<span>12–7 PM · Needs scheduling</span>");
    expect(html).not.toContain("<span>7–9 PM · 1 talent</span>");
  });
});
