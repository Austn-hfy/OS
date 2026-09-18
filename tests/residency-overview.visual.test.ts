import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import bundledChromium from "@sparticuz/chromium";
import { chromium, type Browser, type Page } from "playwright-core";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ResidencyClientOverview } from "@/data/residency-overview";
import type { ResidencyActor } from "@/lib/auth";
import { getResidencyClientOverview } from "@/data/residency-overview";
import { requireResidencyActor } from "@/lib/auth";
import ResidencyOverviewPage from "../src/app/residency/page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/data/residency-overview", () => ({ getResidencyClientOverview: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireResidencyActor: vi.fn() }));

const manager: ResidencyActor = {
  kind: "residency",
  userId: "user-1",
  email: "avery.long.manager.address@example.com",
  displayName: "Alexandria Montgomery-Worthington",
  residencyId: "residency-1",
  residencyName: "The Juniper Hotel and Conference Residences",
  residencyTimezone: "America/Los_Angeles",
  residencyTier: "operations_only",
  accessRole: "manager",
  isViewAs: false,
  isInternalTest: false,
  availableResidencies: [],
};

function service(
  id: string,
  name: string,
  room: string,
  status: "scheduled" | "pending" | "open",
  talentNames: string[] = [],
): ResidencyClientOverview["week"][number]["services"][number] {
  return { id, calendarEventId: id, daypartId: `daypart-${id}`, name, room, timeLabel: "6:00 PM–9:00 PM", talentNames, status };
}

const populatedOverview: ResidencyClientOverview = {
  asOfDate: "2026-09-18",
  week: [
    { date: "2026-09-18", scheduledCount: 3, pendingCount: 0, openCount: 0, services: [
      service("1", "Pool DJ", "Pool", "scheduled", ["Casey Rivera-Montgomery-Worthington"]),
      service("2", "Restaurant Dinner", "Restaurant", "scheduled", ["Maya James"]),
      service("3", "Terrace Trivia", "Terrace", "scheduled"),
    ] },
    { date: "2026-09-19", scheduledCount: 2, pendingCount: 1, openCount: 0, services: [
      service("4", "Pool DJ", "Pool", "scheduled"),
      service("5", "Late Night", "Lobby", "pending"),
      service("6", "Cinema", "Screening room", "scheduled"),
    ] },
    { date: "2026-09-20", scheduledCount: 1, pendingCount: 0, openCount: 1, services: [
      service("7", "Sunday Brunch", "Restaurant", "scheduled"),
      service("8", "Sunday Dinner", "Restaurant", "open"),
    ] },
    { date: "2026-09-21", scheduledCount: 1, pendingCount: 0, openCount: 0, services: [service("9", "Lobby Set", "Lobby", "scheduled")] },
    { date: "2026-09-22", scheduledCount: 1, pendingCount: 0, openCount: 0, services: [service("10", "Pool DJ", "Pool", "scheduled")] },
    { date: "2026-09-23", scheduledCount: 0, pendingCount: 0, openCount: 0, services: [] },
    { date: "2026-09-24", scheduledCount: 0, pendingCount: 0, openCount: 0, services: [] },
  ],
  attention: {
    openServiceCount: 1,
    nextOpenService: { name: "Sunday Dinner with an Exceptionally Long Programming Name", room: "Restaurant", serviceDate: "2026-09-20" },
    pendingConfirmationCount: 1,
    nextPendingConfirmation: { talentName: "Casey Rivera-Montgomery", activityName: "Late Night", serviceDate: "2026-09-19" },
    overdueInvoiceCount: 2,
    overdueInvoiceCents: 145_000,
  },
  finances: {
    currentMonthCommitmentsCents: 98_765_432_100,
    owedToResidencyTalentCents: 12_345_678_900,
    outstandingHfyInvoicesCents: 8_765_432_100,
    openInvoiceCount: 128,
    overdueInvoiceCount: 24,
  },
};

function emptyOverview(): ResidencyClientOverview {
  return {
    ...populatedOverview,
    week: populatedOverview.week.map((day) => ({ ...day, scheduledCount: 0, pendingCount: 0, openCount: 0, services: [] })),
    attention: {
      openServiceCount: 0,
      nextOpenService: null,
      pendingConfirmationCount: 0,
      nextPendingConfirmation: null,
      overdueInvoiceCount: 0,
      overdueInvoiceCents: 0,
    },
    finances: { currentMonthCommitmentsCents: 0, owedToResidencyTalentCents: 0, outstandingHfyInvoicesCents: 0, openInvoiceCount: 0, overdueInvoiceCount: 0 },
  };
}

async function browserExecutable() {
  const localCandidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const localPath = localCandidates.find((candidate) => existsSync(candidate));
  if (localPath) return { executablePath: localPath, args: [] as string[] };
  return { executablePath: await bundledChromium.executablePath(), args: bundledChromium.args };
}

async function fixtureDocument(overview: ResidencyClientOverview) {
  vi.mocked(requireResidencyActor).mockResolvedValue(manager);
  vi.mocked(getResidencyClientOverview).mockResolvedValue(overview);
  const pageMarkup = renderToStaticMarkup(await ResidencyOverviewPage({ searchParams: Promise.resolve({}) }));
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
    body { background: var(--hfy-canvas); font-family: VisualGeist, Arial, sans-serif; }
  `;
  const shell = `<div class="shell client-shell visual-overview-shell"><aside class="sidebar client-sidebar"><div class="brand"><span class="brand-mark">HFY</span><span class="brand-copy"><strong>HFY OS</strong><span>Residency calendar</span></span></div><div class="client-residency-context"><small>Your Residency</small><strong>${manager.residencyName}</strong></div><nav class="nav residency-workspace-nav"><p class="nav-label">Workspace</p><a class="residency-nav-item active"><span class="residency-nav-icon"></span><span class="residency-nav-copy"><strong>Overview</strong><small>Program status and next steps</small></span><span class="residency-nav-end"><span class="residency-nav-arrow">›</span></span></a></nav></aside><main class="main">${pageMarkup}</main></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${tokens}\n${localGlobals}\n${pilot}\n${fixtureStyles}</style></head><body class="hfy-style-system">${shell}</body></html>`;
}

describe("Residency Overview responsive visual contract", () => {
  let browser: Browser;
  let page: Page;
  let populatedHtml: string;
  let emptyHtml: string;

  beforeAll(async () => {
    const executable = await browserExecutable();
    browser = await chromium.launch({ headless: true, ...executable });
    page = await browser.newPage({ deviceScaleFactor: 1 });
    populatedHtml = await fixtureDocument(populatedOverview);
    emptyHtml = await fixtureDocument(emptyOverview());
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  it("contains populated, long-name, and large-value states continuously from 1512px through 390px", async () => {
    const widths = new Set<number>([1512, 1440, 1200, 1024, 920, 900, 760, 700, 600, 480, 390]);
    for (let width = 1512; width >= 390; width -= 31) widths.add(width);

    for (const width of [...widths].sort((left, right) => right - left)) {
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(populatedHtml, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);

      const metrics = await page.evaluate(() => {
        const element = (selector: string) => {
          const match = document.querySelector<HTMLElement>(selector);
          if (!match) throw new Error(`Missing Overview visual fixture selector: ${selector}`);
          return match;
        };
        const viewportWidth = document.documentElement.clientWidth;
        const surface = element(".residency-overview-surface").getBoundingClientRect();
        const dashboard = element(".residency-overview-dashboard").getBoundingClientRect();
        const cards = [...document.querySelectorAll<HTMLElement>(".residency-overview-dashboard > .residency-surface-card")];
        const days = [...document.querySelectorAll<HTMLElement>(".residency-overview-day")];
        const dayColumns = new Set(days.map((day) => Math.round(day.getBoundingClientRect().left))).size;
        const expectedDayColumns = dashboard.width <= 480 ? 2 : dashboard.width <= 700 ? 4 : 7;
        const money = element(".residency-overview-finance-primary strong").getBoundingClientRect();
        const attentionCard = element(".residency-overview-attention-card").getBoundingClientRect();
        const financeCard = element(".residency-overview-finance-card").getBoundingClientRect();
        const selectedDay = element(".residency-overview-day.is-selected");
        const dayDetail = element(".residency-overview-day-detail");
        const selectedMarker = element(".residency-overview-day-markers > b");
        return {
          documentContained: document.documentElement.scrollWidth === viewportWidth,
          surfaceContained: surface.left >= -0.5 && surface.right <= viewportWidth + 0.5,
          cardsContained: cards.every((card) => {
            const rect = card.getBoundingClientRect();
            return rect.left >= surface.left - 0.5 && rect.right <= surface.right + 0.5 && card.scrollWidth === card.clientWidth;
          }),
          cardsUseLockedSurface: cards.length === 3 && cards.every((card) => {
            const style = getComputedStyle(card);
            return style.backgroundColor === "rgb(255, 255, 255)" && style.borderRadius === "16px" && style.boxShadow !== "none";
          }),
          sevenDays: days.length === 7,
          correctDayColumns: dayColumns === expectedDayColumns,
          equalSummaryCardWidths: Math.abs(attentionCard.width - financeCard.width) <= 0.5,
          selectionIsVisuallyLinked: selectedMarker.textContent === "Selected"
            && getComputedStyle(selectedDay).borderTopColor === getComputedStyle(dayDetail).borderTopColor,
          largeMoneyContained: money.left >= financeCard.left - 0.5 && money.right <= financeCard.right + 0.5,
        };
      });

      expect(metrics, `Overview geometry failed at ${width}px`).toEqual({
        documentContained: true,
        surfaceContained: true,
        cardsContained: true,
        cardsUseLockedSurface: true,
        sevenDays: true,
        correctDayColumns: true,
        equalSummaryCardWidths: true,
        selectionIsVisuallyLinked: true,
        largeMoneyContained: true,
      });
    }

    await page.setViewportSize({ width: 1200, height: 900 });
    await page.setContent(populatedHtml, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: "/private/tmp/hfy-residency-overview-1200.png", fullPage: true });
  }, 120_000);

  it("keeps the all-clear and empty states calm and contained on a narrow screen", async () => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.setContent(emptyHtml, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    const metrics = await page.evaluate(() => {
      const allClear = document.querySelector<HTMLElement>(".residency-overview-all-clear")!;
      const attentionCard = document.querySelector<HTMLElement>(".residency-overview-attention-card")!;
      return {
        documentContained: document.documentElement.scrollWidth === document.documentElement.clientWidth,
        allClearContained: allClear.getBoundingClientRect().right <= attentionCard.getBoundingClientRect().right + 0.5,
        allClearVisible: allClear.textContent?.includes("All clear") && allClear.textContent?.includes("No open scheduling gaps"),
        noAttentionRows: document.querySelectorAll(".residency-overview-attention-item").length === 0,
        sevenEmptyDays: document.querySelectorAll(".residency-overview-day").length === 7,
      };
    });

    expect(metrics).toEqual({
      documentContained: true,
      allClearContained: true,
      allClearVisible: true,
      noAttentionRows: true,
      sevenEmptyDays: true,
    });
    await page.screenshot({ path: "/private/tmp/hfy-residency-overview-empty-390.png", fullPage: true });
  }, 120_000);
});
