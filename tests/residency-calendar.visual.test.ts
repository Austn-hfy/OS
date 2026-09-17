import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import bundledChromium from "@sparticuz/chromium";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MonthCalendar, type MonthCalendarEvent } from "../src/components/month-calendar";
import { WeekCalendar } from "../src/components/week-calendar";

const viewports = [
  { width: 1440, height: 900, toolbarRows: 1 },
  { width: 1200, height: 800, toolbarRows: 2 },
  { width: 1024, height: 768, toolbarRows: 2 },
] as const;

const baselineDirectory = new URL("./visual-baselines/", import.meta.url);

const events: MonthCalendarEvent[] = [
  { id: "one", date: "2026-09-01", title: "Lobby Session", time: "8:00–11:00 PM · Scheduled", residencyName: "DANAISY", room: "Lobby", color: "#8bc7f1", schedulingStatus: "filled" },
  { id: "two", date: "2026-09-02", title: "Sunset DJ", time: "6:00–9:00 PM · Scheduled", residencyName: "Verify Artist 2", room: "Rooftop", color: "#9ed9c2", schedulingStatus: "filled" },
  { id: "three", date: "2026-09-03", title: "Listening Room", time: "7:00–10:00 PM · Needs scheduling", residencyName: "Projected from Day Parts", room: "Amigo", color: "#f1b27e", schedulingStatus: "empty" },
  { id: "four", date: "2026-09-04", title: "Lobby Session", time: "8:00–11:00 PM · Scheduled", residencyName: "DANAISY", room: "Lobby", color: "#8bc7f1", schedulingStatus: "filled" },
  { id: "five", date: "2026-09-04", title: "Poolside", time: "2:00–5:00 PM · Scheduled", residencyName: "Verify Artist 2", room: "Pool", color: "#9ed9c2", schedulingStatus: "filled" },
  { id: "six", date: "2026-09-07", title: "Rooftop", time: "7:00–10:00 PM · Needs scheduling", residencyName: "Projected from Day Parts", room: "Rooftop", color: "#f1b27e", schedulingStatus: "empty" },
  { id: "seven", date: "2026-09-09", title: "Lobby Session", time: "8:00–11:00 PM · Scheduled", residencyName: "DANAISY", room: "Lobby", color: "#8bc7f1", schedulingStatus: "filled" },
  { id: "eight", date: "2026-09-11", title: "Sunset DJ", time: "6:00–9:00 PM · Scheduled", residencyName: "Verify Artist 2", room: "Rooftop", color: "#9ed9c2", schedulingStatus: "filled" },
  { id: "nine", date: "2026-09-13", title: "Lobby Session", time: "8:00–11:00 PM · Scheduled", residencyName: "DANAISY", room: "Lobby", color: "#8bc7f1", schedulingStatus: "filled" },
  { id: "ten", date: "2026-09-15", title: "Sunset DJ", time: "6:00–9:00 PM · Scheduled", residencyName: "Verify Artist 2", room: "Rooftop", color: "#9ed9c2", schedulingStatus: "filled" },
  { id: "eleven", date: "2026-09-16", title: "Listening Room", time: "7:00–10:00 PM · Needs scheduling", residencyName: "Projected from Day Parts", room: "Amigo", color: "#f1b27e", schedulingStatus: "empty" },
  { id: "twelve", date: "2026-09-18", title: "Poolside", time: "2:00–5:00 PM · Scheduled", residencyName: "Verify Artist 2", room: "Pool", color: "#9ed9c2", schedulingStatus: "filled" },
];

async function browserExecutable() {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicitPath) return { executablePath: explicitPath, args: [] as string[] };

  const localCandidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const localPath = localCandidates.find((candidate) => existsSync(candidate));
  if (localPath) return { executablePath: localPath, args: [] as string[] };

  return {
    executablePath: await bundledChromium.executablePath(),
    args: bundledChromium.args,
  };
}

function calendarHeader(view: "month" | "week") {
  return createElement(
    "header",
    { className: "page-header calendar-page-header calendar-command-bar" },
    createElement(
      "div",
      { className: "calendar-command-primary" },
      createElement("div", { className: "calendar-title" },
        createElement("p", { className: "eyebrow" }, "Ace Hotel · Calendar"),
        createElement("h1", null, "Calendar"),
      ),
      createElement("div", { className: "calendar-month-cluster" },
        createElement("button", { className: "calendar-batch-launcher", type: "button" }, "Schedule all (4)"),
        createElement("div", { className: "month-navigation" },
          createElement("button", { className: "calendar-arrow", type: "button", "aria-label": `Previous ${view}` }, "←"),
          createElement("h2", null, view === "month" ? "September 2026" : "Sep 13–19, 2026"),
          createElement("button", { className: "calendar-arrow", type: "button", "aria-label": `Next ${view}` }, "→"),
        ),
      ),
    ),
    createElement("div", { className: "calendar-command-secondary" },
      createElement("div", { className: "calendar-toolbar", "aria-label": "Calendar controls" },
        createElement("div", { className: "calendar-toolbar-cluster calendar-toolbar-filters" },
          createElement("label", { className: "calendar-toolbar-select" }, createElement("span", null, "Status"), createElement("select", { defaultValue: "all", "aria-label": "Status" }, createElement("option", { value: "all" }, "All slots"))),
          createElement("label", { className: "calendar-toolbar-select" }, createElement("span", null, "Daypart"), createElement("select", { defaultValue: "all", "aria-label": "Daypart" }, createElement("option", { value: "all" }, "All Dayparts"))),
        ),
        createElement("div", { className: "calendar-toolbar-cluster calendar-toolbar-view" },
          createElement("div", { className: "calendar-view-toggle", role: "group", "aria-label": "Calendar view" },
            createElement("a", { className: view === "month" ? "active" : "", href: "#month" }, "Month"),
            createElement("a", { className: view === "week" ? "active" : "", href: "#week" }, "Week"),
          ),
        ),
        createElement("div", { className: "calendar-toolbar-cluster calendar-toolbar-actions" },
          createElement("button", { className: "button secondary calendar-share-button", type: "button" }, "Share"),
          createElement("details", { className: "calendar-status-legend" }, createElement("summary", { "aria-label": "Calendar legend" }, "?")),
        ),
      ),
    ),
  );
}

function calendarFixture(view: "month" | "week") {
  const calendar = view === "month"
    ? createElement(MonthCalendar, { compact: true, monthKey: "2026-09", events })
    : createElement(WeekCalendar, { weekStart: "2026-09-13", events });

  return renderToStaticMarkup(createElement(
    "div",
    { className: "hfy-style-system" },
    createElement("div", { className: "shell client-shell visual-calendar-shell" },
      createElement("aside", { className: "sidebar client-sidebar visual-calendar-sidebar" },
        createElement("div", { className: "brand" }, createElement("span", { className: "brand-mark" }, "HFY"), createElement("span", { className: "brand-copy" }, createElement("strong", null, "HFY OS"), createElement("span", null, "Residency preview"))),
        createElement("div", { className: "client-residency-context" }, createElement("small", null, "Your Residency"), createElement("strong", null, "Ace Hotel")),
        createElement("nav", { className: "nav residency-workspace-nav", "aria-label": "Residency workspace" },
          createElement("a", { href: "#overview" }, "Overview"),
          createElement("a", { className: "active", href: "#calendar" }, "Calendar"),
          createElement("a", { href: "#dayparts" }, "Day Parts"),
          createElement("a", { href: "#talent" }, "Talent"),
          createElement("a", { href: "#finances" }, "Finances"),
        ),
      ),
      createElement("main", { className: "main calendar-main" },
        createElement("div", { className: "view-as-banner", role: "status" }, createElement("strong", null, "Viewing as: Ace Hotel"), createElement("span", null, "Changes made here are live for this Residency."), createElement("button", { type: "button" }, "Exit preview")),
        createElement("div", { className: "calendar-page client-calendar-page" }, calendarHeader(view), calendar),
      ),
    ),
  ));
}

async function fixtureDocument(view: "month" | "week") {
  const [tokens, globals, pilot, font] = await Promise.all([
    readFile(new URL("../src/app/hfy-design-tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
    readFile(new URL("../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2", import.meta.url)),
  ]);
  const localGlobals = globals.replace(/^@import[^;]+;\s*/m, "");
  const fixtureStyles = `
    @font-face { font-family: VisualGeist; src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2"); font-weight: 100 900; font-style: normal; }
    :root { --hfy-font-sans: VisualGeist, Arial, sans-serif; }
    html, body { width: 100%; min-height: 100%; }
    body { background: #e9edef; font-family: VisualGeist, Arial, sans-serif; }
    .visual-calendar-sidebar .nav { display: grid; gap: 7px; margin-top: 28px; overflow: visible; }
    .visual-calendar-sidebar .nav a { min-height: 42px; display: flex; align-items: center; padding: 10px 12px; border-radius: 12px; color: rgba(255,255,255,.68); font-size: 12px; font-weight: 700; }
    .visual-calendar-sidebar .nav a.active { color: #102334; background: rgba(255,255,255,.92); }
    .visual-calendar-shell .calendar-batch-launcher { --calendar-toolbar-height: 40px; --daypart-color: #f1b27e; }
  `;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${tokens}\n${localGlobals}\n${pilot}\n${fixtureStyles}</style></head><body>${calendarFixture(view)}</body></html>`;
}

async function visualDifference(page: Page, actual: Buffer, expected: Buffer) {
  return page.evaluate(async ({ actualBase64, expectedBase64 }) => {
    const decode = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/png;base64,${source}`;
    });
    const [actualImage, expectedImage] = await Promise.all([decode(actualBase64), decode(expectedBase64)]);
    const sample = (image: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 60;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas 2D context is unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const actualPixels = sample(actualImage);
    const expectedPixels = sample(expectedImage);
    let totalDifference = 0;
    let changedPixels = 0;
    for (let index = 0; index < actualPixels.length; index += 4) {
      const difference = (
        Math.abs(actualPixels[index] - expectedPixels[index])
        + Math.abs(actualPixels[index + 1] - expectedPixels[index + 1])
        + Math.abs(actualPixels[index + 2] - expectedPixels[index + 2])
      ) / 3;
      totalDifference += difference;
      if (difference > 18) changedPixels += 1;
    }
    const pixelCount = actualPixels.length / 4;
    return { meanDifference: totalDifference / pixelCount, changedPixelRatio: changedPixels / pixelCount };
  }, { actualBase64: actual.toString("base64"), expectedBase64: expected.toString("base64") });
}

describe("Residency Calendar desktop visual regression", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const executable = await browserExecutable();
    browser = await chromium.launch({ headless: true, ...executable });
    page = await browser.newPage({ deviceScaleFactor: 1 });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  it("keeps Month and Week readable and collision-free at 1440, 1200, and 1024", async () => {
    for (const view of ["month", "week"] as const) {
      const html = await fixtureDocument(view);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);

        const metrics = await page.evaluate(() => {
          const element = (selector: string) => {
            const match = document.querySelector<HTMLElement>(selector);
            if (!match) throw new Error(`Missing Calendar visual fixture selector: ${selector}`);
            return match;
          };
          const box = (selector: string) => element(selector).getBoundingClientRect();
          const filters = box(".calendar-toolbar-filters");
          const viewControls = box(".calendar-toolbar-view");
          const actions = box(".calendar-toolbar-actions");
          const eventTitle = getComputedStyle(element(document.querySelector(".calendar-event-line strong") ? ".calendar-event-line strong" : ".week-calendar-event strong"));
          const eventMeta = getComputedStyle(element(document.querySelector(".calendar-event-line > span") ? ".calendar-event-line > span" : ".week-calendar-event span"));
          const weekWrap = document.querySelector<HTMLElement>(".week-calendar-wrap");
          return {
            noDocumentOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
            toolbarRows: Math.abs(filters.top - viewControls.top) < 1 ? 1 : 2,
            filtersClearView: filters.right <= viewControls.left + 0.5 || filters.bottom <= viewControls.top + 0.5,
            viewClearActions: viewControls.right <= actions.left + 0.5 || viewControls.bottom <= actions.top + 0.5,
            eventTitleSize: eventTitle.fontSize,
            eventMetaSize: eventMeta.fontSize,
            mainPaddingTop: getComputedStyle(element(".calendar-main")).paddingTop,
            weekFits: weekWrap ? weekWrap.scrollWidth === weekWrap.clientWidth : true,
          };
        });

        expect(metrics.noDocumentOverflow).toBe(true);
        expect(metrics.toolbarRows).toBe(viewport.toolbarRows);
        expect(metrics.filtersClearView).toBe(true);
        expect(metrics.viewClearActions).toBe(true);
        expect(metrics.eventTitleSize).toBe(view === "month" ? "10px" : "12px");
        expect(metrics.eventMetaSize).toBe("10px");
        expect(metrics.mainPaddingTop).toBe("38px");
        expect(metrics.weekFits).toBe(true);

        const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" });
        const baselineUrl = new URL(`residency-calendar-${view}-${viewport.width}.png`, baselineDirectory);
        if (process.env.UPDATE_CALENDAR_VISUALS === "1") {
          await mkdir(baselineDirectory, { recursive: true });
          await writeFile(baselineUrl, screenshot);
        }
        const baseline = await readFile(baselineUrl);
        const difference = await visualDifference(page, screenshot, baseline);
        expect(difference.meanDifference).toBeLessThan(6);
        expect(difference.changedPixelRatio).toBeLessThan(0.12);
      }
    }
  }, 120_000);
});
