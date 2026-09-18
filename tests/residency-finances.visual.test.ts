import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import bundledChromium from "@sparticuz/chromium";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

async function browserExecutable() {
  const localCandidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const localPath = localCandidates.find((candidate) => existsSync(candidate));
  if (localPath) return { executablePath: localPath, args: [] as string[] };
  return { executablePath: await bundledChromium.executablePath(), args: bundledChromium.args };
}

function table(headings: string[], cells: string[], modifier: string) {
  return `<div class="table-wrap finance-table-wrap finance-table-wrap--${modifier}" role="region" aria-label="${modifier} finances" tabindex="0"><table class="finance-table finance-table--${modifier}"><thead><tr>${headings.map((heading) => `<th>${heading}</th>`).join("")}</tr></thead><tbody><tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr></tbody></table></div>`;
}

function fixture() {
  const directTable = table(
    ["Artist", "Activity", "Date", "Status", "Amount owed"],
    [
      "<strong>Artist Last</strong>",
      "Sunset DJ Set",
      "Sep 4, 2026",
      '<span class="status confirmed">Confirmed</span>',
      '<button class="finance-rate-needed-button" type="button"><span class="artist-rate-needed-badge"><span class="artist-rate-needed-mark">!</span><span>Rate needed</span></span><small>Edit rate →</small></button>',
    ],
    "direct",
  );
  const invoiceTable = table(
    ["Invoice", "Invoice date", "Service month", "Amount", "Status", "Document"],
    [
      "<strong>HFYTEST-0001</strong>",
      "Aug 30, 2026",
      '<span class="finance-invoice-period"><span>Aug 24, 2026</span><span class="finance-invoice-period-separator">–</span><span>Aug 30, 2026</span></span>',
      "$1,500.00",
      '<span class="status approved">Approved</span>',
      '<a class="button secondary">Download PDF</a>',
    ],
    "invoice",
  );

  return `<div class="hfy-style-system"><div class="shell client-shell visual-finances-shell"><aside class="sidebar client-sidebar"><div class="brand"><span class="brand-mark">HFY</span><span class="brand-copy"><strong>HFY OS</strong><span>Residency preview</span></span></div><div class="client-residency-context"><small>Your Residency</small><strong>HFY Internal Test Residency</strong></div></aside><main class="main"><div class="view-as-banner" role="status"><strong>Viewing as: HFY Internal Test Residency</strong><span>Changes made here are live for this Residency.</span><button type="button">Exit preview</button></div><section class="workspace-surface residency-workspace-surface residency-page-surface workspace-surface-finances"><header class="page-header client-page-header residency-page-header"><div><p class="eyebrow">HFY Internal Test Residency finances</p><h1>Finances</h1></div></header><div class="residency-page-body finance-accordions"><details class="finance-accordion card" open><summary><span><small>Directly sourced by your team</small><strong>Owed to Your Talent</strong></span><span><strong>$400.00</strong><small>informational only</small></span></summary><div class="finance-accordion-body"><p>This is a summary of what your Residency pays its own talent directly. HFY does not collect, send, or manage these payments.</p>${directTable}</div></details><details class="finance-accordion card" open><summary><span><small>HFY-managed programming</small><strong>Owed to HFY</strong></span><span><strong>$1,500.00</strong><small>outstanding</small></span></summary><div class="finance-accordion-body"><p>Invoices for talent sourced, scheduled, and paid by HFY. Your Platform subscription is managed separately in Settings → Billing.</p>${invoiceTable}</div></details></div></section></main></div></div>`;
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

describe("Residency Finances responsive visual contract", () => {
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

  it("contains the page, disclosures, and populated tables continuously from 1512px through 390px", async () => {
    const widths = new Set<number>([1512, 1200, 1024, 900, 851, 850, 849, 800, 600, 390]);
    for (let width = 1512; width >= 390; width -= 17) widths.add(width);

    for (const width of [...widths].sort((left, right) => right - left)) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);

      const metrics = await page.evaluate(() => {
        const element = (selector: string) => {
          const match = document.querySelector<HTMLElement>(selector);
          if (!match) throw new Error(`Missing Finances visual fixture selector: ${selector}`);
          return match;
        };
        const viewportWidth = document.documentElement.clientWidth;
        const surface = element(".workspace-surface-finances").getBoundingClientRect();
        const banner = element(".view-as-banner").getBoundingClientRect();
        const summaries = [...document.querySelectorAll<HTMLElement>(".finance-accordion > summary")].map((node) => node.getBoundingClientRect());
        const bodies = [...document.querySelectorAll<HTMLElement>(".finance-accordion-body")].map((node) => node.getBoundingClientRect());
        const wraps = [...document.querySelectorAll<HTMLElement>(".finance-table-wrap")];
        const rateAction = element(".finance-rate-needed-button").getBoundingClientRect();
        const rateCell = element(".finance-table--direct tbody td:last-child").getBoundingClientRect();
        return {
          documentContained: document.documentElement.scrollWidth === viewportWidth,
          bannerContained: banner.left >= -0.5 && banner.right <= viewportWidth + 0.5,
          surfaceContained: surface.left >= -0.5 && surface.right <= viewportWidth + 0.5,
          summariesContained: summaries.every((summary) => summary.left >= surface.left - 0.5 && summary.right <= surface.right + 0.5),
          bodiesContained: bodies.every((body) => body.left >= surface.left - 0.5 && body.right <= surface.right + 0.5),
          wrappersContained: wraps.every((wrap) => {
            const rect = wrap.getBoundingClientRect();
            return rect.left >= surface.left - 0.5 && rect.right <= surface.right + 0.5;
          }),
          scrollOwnedByWrappers: wraps.every((wrap) => wrap.scrollWidth >= wrap.clientWidth && getComputedStyle(wrap).overflowX === "auto"),
          rateActionContained: rateAction.left >= rateCell.left - 0.5 && rateAction.right <= rateCell.right + 0.5,
        };
      });

      expect(metrics, `Finances geometry failed at ${width}px`).toEqual({
        documentContained: true,
        bannerContained: true,
        surfaceContained: true,
        summariesContained: true,
        bodiesContained: true,
        wrappersContained: true,
        scrollOwnedByWrappers: true,
        rateActionContained: true,
      });
    }
  }, 120_000);
});
