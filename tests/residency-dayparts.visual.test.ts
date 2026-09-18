import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import bundledChromium from "@sparticuz/chromium";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DaypartManager, type DaypartRow } from "../src/app/app/setup/daypart-manager";
import type { ResidencyRoom } from "../src/services/rooms";

const rooms: ResidencyRoom[] = [
  { id: "pool", residencyId: "ace", name: "Main Pool", hue: "blue", sortOrder: 0, daypartCount: 2 },
  { id: "amigo", residencyId: "ace", name: "Amigo Room", hue: "orange", sortOrder: 1, daypartCount: 2 },
  { id: "rooftop", residencyId: "ace", name: "Rooftop Lounge", hue: "purple", sortOrder: 2, daypartCount: 1 },
];

const dayparts: DaypartRow[] = [
  { id: "pool-day", roomId: "pool", roomHue: "blue", name: "DJ — Main Pool", room: "Main Pool", color: "#cce4f6", type: "dj_artist", billingMode: "billed_by_hfy", scheduleMode: "standing_weekly", suggestedStartMinute: null, suggestedEndMinute: null, defaultTalentRateCents: 8500, clientDefaultRateCents: null, activeUntil: null, active: true, sortOrder: 0, rules: [{ weekday: 0, startMinute: 720, endMinute: 1140, defaultDjCount: 1 }, { weekday: 5, startMinute: 720, endMinute: 1140, defaultDjCount: 1 }, { weekday: 6, startMinute: 720, endMinute: 1140, defaultDjCount: 1 }] },
  { id: "pool-night", roomId: "pool", roomHue: "blue", name: "Deep Dives: Poolside Movie", room: "Main Pool", color: "#124a80", type: "house_activity", billingMode: null, scheduleMode: "standing_weekly", suggestedStartMinute: null, suggestedEndMinute: null, defaultTalentRateCents: null, clientDefaultRateCents: null, activeUntil: null, active: true, sortOrder: 1, rules: [{ weekday: 0, startMinute: 1140, endMinute: 1260, defaultDjCount: null }] },
  { id: "amigo-karaoke", roomId: "amigo", roomHue: "orange", name: "Karaoke Night", room: "Amigo Room", color: "#ef8128", type: "house_activity", billingMode: null, scheduleMode: "standing_weekly", suggestedStartMinute: null, suggestedEndMinute: null, defaultTalentRateCents: null, clientDefaultRateCents: null, activeUntil: null, active: true, sortOrder: 2, rules: [{ weekday: 1, startMinute: 1200, endMinute: 1380, defaultDjCount: null }] },
  { id: "amigo-vinyl", roomId: "amigo", roomHue: "orange", name: "DJ — Vintage Vinyl Night", room: "Amigo Room", color: "#f6dcc3", type: "dj_artist", billingMode: "tracking_only", scheduleMode: "standing_weekly", suggestedStartMinute: null, suggestedEndMinute: null, defaultTalentRateCents: null, clientDefaultRateCents: 7000, activeUntil: null, active: true, sortOrder: 3, rules: [{ weekday: 4, startMinute: 1200, endMinute: 1380, defaultDjCount: 1 }] },
  { id: "rooftop-sunset", roomId: "rooftop", roomHue: "purple", name: "Sunset Sessions", room: "Rooftop Lounge", color: "#e8e2fa", type: "dj_artist", billingMode: "billed_by_hfy", scheduleMode: "standing_weekly", suggestedStartMinute: null, suggestedEndMinute: null, defaultTalentRateCents: 9000, clientDefaultRateCents: null, activeUntil: null, active: true, sortOrder: 4, rules: [{ weekday: 2, startMinute: 1080, endMinute: 1260, defaultDjCount: 1 }] },
];

async function browserExecutable() {
  const localCandidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const localPath = localCandidates.find((candidate) => existsSync(candidate));
  if (localPath) return { executablePath: localPath, args: [] as string[] };
  return { executablePath: await bundledChromium.executablePath(), args: bundledChromium.args };
}

function fixture() {
  return renderToStaticMarkup(createElement(
    "div",
    { className: "hfy-style-system" },
    createElement("div", { className: "shell client-shell visual-dayparts-shell" },
      createElement("aside", { className: "sidebar client-sidebar visual-dayparts-sidebar" },
        createElement("div", { className: "brand" }, createElement("span", { className: "brand-mark" }, "HFY"), createElement("span", { className: "brand-copy" }, createElement("strong", null, "HFY OS"), createElement("span", null, "Residency preview"))),
        createElement("div", { className: "client-residency-context" }, createElement("small", null, "Your Residency"), createElement("strong", null, "Ace Hotel")),
      ),
      createElement("main", { className: "main" },
        createElement("div", { className: "view-as-banner", role: "status" }, createElement("strong", null, "Viewing as: Ace Hotel"), createElement("span", null, "Changes made here are live for this Residency."), createElement("button", { type: "button" }, "Exit preview")),
        createElement(DaypartManager, { residencyId: "ace", dayparts, residencyRooms: rooms, hideFinancials: true, residencySurface: true }),
      ),
    ),
  ));
}

async function fixtureDocument() {
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
  `;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${tokens}\n${localGlobals}\n${pilot}\n${fixtureStyles}</style></head><body>${fixture()}</body></html>`;
}

describe("Residency Day Parts responsive visual contract", () => {
  let browser: Browser;
  let page: Page;
  let html: string;

  beforeAll(async () => {
    const executable = await browserExecutable();
    browser = await chromium.launch({ headless: true, ...executable });
    page = await browser.newPage({ deviceScaleFactor: 1 });
    html = await fixtureDocument();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  it("keeps the weekly board legible and contains overflow from desktop through mobile", async () => {
    for (let width = 1440; width >= 390; width -= 30) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);

      const metrics = await page.evaluate(() => {
        const element = (selector: string) => {
          const match = document.querySelector<HTMLElement>(selector);
          if (!match) throw new Error(`Missing Day Parts visual fixture selector: ${selector}`);
          return match;
        };
        const surface = element(".residency-dayparts-surface").getBoundingClientRect();
        const header = element(".residency-page-header").getBoundingClientRect();
        const actions = element(".daypart-workspace-actions").getBoundingClientRect();
        const scroll = element(".daypart-week-scroll");
        const board = element(".daypart-week-board");
        const scrollHint = element(".daypart-week-scroll-hint");
        const dayCells = [...document.querySelectorAll<HTMLElement>(".daypart-week-cell")];
        return {
          documentContained: document.documentElement.scrollWidth === document.documentElement.clientWidth,
          surfaceContained: surface.left >= -0.5 && surface.right <= document.documentElement.clientWidth + 0.5,
          actionsContained: actions.left >= header.left - 0.5 && actions.right <= header.right + 0.5,
          scrollContained: scroll.getBoundingClientRect().left >= surface.left - 0.5 && scroll.getBoundingClientRect().right <= surface.right + 0.5,
          boardWidth: board.getBoundingClientRect().width,
          minimumDayWidth: Math.min(...dayCells.map((cell) => cell.getBoundingClientRect().width)),
          eventTitleSize: getComputedStyle(element(".daypart-week-block strong")).fontSize,
          eventMetaSize: getComputedStyle(element(".daypart-week-block span")).fontSize,
          roomPosition: getComputedStyle(element(".daypart-room-label")).position,
          localizedOverflow: scroll.scrollWidth > scroll.clientWidth,
          scrollHintDisplay: getComputedStyle(scrollHint).display,
        };
      });

      expect(metrics, `Day Parts geometry failed at ${width}px`).toEqual({
        documentContained: true,
        surfaceContained: true,
        actionsContained: true,
        scrollContained: true,
        boardWidth: expect.any(Number),
        minimumDayWidth: expect.any(Number),
        eventTitleSize: "11px",
        eventMetaSize: "10px",
        roomPosition: "sticky",
        localizedOverflow: expect.any(Boolean),
        scrollHintDisplay: expect.any(String),
      });
      expect(metrics.boardWidth).toBeGreaterThanOrEqual(839);
      expect(metrics.minimumDayWidth).toBeGreaterThanOrEqual(103);
      expect(metrics.scrollHintDisplay).toBe(metrics.localizedOverflow ? "flex" : "none");

      if (metrics.localizedOverflow) {
        const stickyMetrics = await page.evaluate(async () => {
          const scroll = document.querySelector<HTMLElement>(".daypart-week-scroll")!;
          const corner = document.querySelector<HTMLElement>(".daypart-week-corner")!;
          const roomLabels = [...document.querySelectorAll<HTMLElement>(".daypart-room-label")];
          const firstHeading = document.querySelector<HTMLElement>(".daypart-week-heading")!;
          const scrollLeftEdge = scroll.getBoundingClientRect().left;
          const headingBefore = firstHeading.getBoundingClientRect().left;
          scroll.scrollLeft = Math.min(260, scroll.scrollWidth - scroll.clientWidth);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          return {
            scrollAmount: scroll.scrollLeft,
            cornerOffset: Math.abs(corner.getBoundingClientRect().left - scrollLeftEdge),
            largestRoomOffset: Math.max(...roomLabels.map((label) => Math.abs(label.getBoundingClientRect().left - scrollLeftEdge))),
            headingTravel: headingBefore - firstHeading.getBoundingClientRect().left,
            eventContentFits: [...document.querySelectorAll<HTMLElement>(".daypart-week-block")].every((block) => block.scrollHeight <= block.clientHeight),
          };
        });
        expect(stickyMetrics.cornerOffset).toBeLessThanOrEqual(1);
        expect(stickyMetrics.largestRoomOffset).toBeLessThanOrEqual(1);
        expect(stickyMetrics.scrollAmount).toBeGreaterThan(0);
        expect(stickyMetrics.headingTravel).toBeGreaterThanOrEqual(stickyMetrics.scrollAmount - 1);
        expect(stickyMetrics.eventContentFits).toBe(true);
      }

      if (process.env.WRITE_DAYPARTS_ARTIFACTS === "1" && [1440, 1020, 600, 390].includes(width)) {
        await writeFile(`/tmp/hfy-dayparts-${width}.png`, await page.screenshot({ fullPage: true, animations: "disabled" }));
      }
    }
  }, 120_000);
});
