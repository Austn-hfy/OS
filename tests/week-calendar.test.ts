import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeekCalendar } from "../src/components/week-calendar";

describe("WeekCalendar", () => {
  it("shows seven days, full event details, and empty-day placeholders", () => {
    const html = renderToStaticMarkup(createElement(WeekCalendar, {
      weekStart: "2026-08-30",
      events: [{
        id: "slot-1",
        date: "2026-09-01",
        title: "Vintage Vinyl Night",
        room: "Amigo Room",
        time: "6–9 PM · 2 talent",
        residencyName: "Ace Hotel",
        color: "#EC4899",
        schedulingStatus: "filled",
      }],
    }));

    expect(html.match(/class="week-calendar-day /g)).toHaveLength(7);
    expect(html).toContain("Vintage Vinyl Night");
    expect(html).toContain("Amigo Room");
    expect(html).toContain("6–9 PM");
    expect(html).toContain("2 talent");
    expect(html.match(/No dayparts/g)).toHaveLength(6);
    expect(html).toContain("--daypart-color:#EC4899");
  });
});
