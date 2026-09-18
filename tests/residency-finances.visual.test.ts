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

  return `<div class="hfy-style-system"><div class="shell client-shell visual-finances-shell"><aside class="sidebar client-sidebar"><div class="brand"><span class="brand-mark">HFY</span><span class="brand-copy"><strong>HFY OS</strong><span>Residency preview</span></span></div><div class="client-residency-context"><small>Your Residency</small><strong>HFY Internal Test Residency</strong></div></aside><main class="main"><div class="view-as-banner" role="status"><strong>Viewing as: HFY Internal Test Residency</strong><span>Changes made here are live for this Residency.</span><button type="button">Exit preview</button></div><section class="workspace-surface residency-workspace-surface residency-page-surface workspace-surface-finances"><header class="page-header client-page-header residency-page-header"><div><p class="eyebrow">HFY Internal Test Residency finances</p><h1>Finances</h1></div></header><div class="residency-page-body finance-accordions"><section class="card residency-surface-card residency-surface-card--white finance-disclosure-card"><details class="finance-accordion" open><summary><span><small>Directly sourced by your team</small><strong>Owed to Your Talent</strong></span><span><strong>$400.00</strong><small>informational only</small></span></summary><div class="finance-accordion-body"><p>This is a summary of what your Residency pays its own talent directly. HFY does not collect, send, or manage these payments.</p>${directTable}</div></details></section><section class="card residency-surface-card residency-surface-card--white finance-disclosure-card"><details class="finance-accordion" open><summary><span><small>HFY-managed programming</small><strong>Owed to HFY</strong></span><span><strong>$1,500.00</strong><small>outstanding</small></span></summary><div class="finance-accordion-body"><p>Invoices for talent sourced, scheduled, and paid by HFY. Your Platform subscription is managed separately in Settings → Billing.</p>${invoiceTable}</div></details></section></div></section></main></div></div>`;
}

function rateDialogFixture() {
  return `<div class="quick-modal-backdrop finances-rate-dialog-backdrop"><section class="quick-modal client-assignment-rate-modal finances-rate-dialog" role="dialog"><header class="quick-modal-header"><div><p class="eyebrow">Sep 4, 2026</p><h2>DJ – Main Pool</h2><p>DANAISY · Pool</p></div><button class="quick-modal-close" type="button">×</button></header><div class="quick-modal-body"><dl class="client-assignment-booking-summary"><div><dt>Artist</dt><dd>DANAISY</dd></div><div><dt>Date</dt><dd>Sep 4, 2026</dd></div><div><dt>Hours</dt><dd>12:00 PM–7:00 PM</dd></div><div><dt>Status</dt><dd>confirmed</dd></div></dl><section class="client-assignment-rate-editor"><div><p class="eyebrow">Booking rate</p><h3>Rate needed</h3><span class="client-rate-source">Rate needed</span></div><form class="client-rate-form"><label>Artist hourly rate</label><div class="client-rate-control"><span>$</span><input type="number" placeholder="Enter rate"><button class="button" type="button">Save rate</button></div><small>Enter the hourly rate for this artist and booking.</small></form></section></div></section></div>`;
}

async function fixtureDocument(markup = fixture()) {
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
  return `<!doctype html><html><head><meta charset="utf-8"><style>${tokens}\n${localGlobals}\n${pilot}\n${fixtureStyles}</style></head><body class="hfy-style-system">${markup}</body></html>`;
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
        const cards = [...document.querySelectorAll<HTMLElement>(".finance-disclosure-card")];
        const summaries = [...document.querySelectorAll<HTMLElement>(".finance-accordion > summary")].map((node) => node.getBoundingClientRect());
        const bodies = [...document.querySelectorAll<HTMLElement>(".finance-accordion-body")].map((node) => node.getBoundingClientRect());
        const wraps = [...document.querySelectorAll<HTMLElement>(".finance-table-wrap")];
        const rateAction = element(".finance-rate-needed-button").getBoundingClientRect();
        const rateCell = element(".finance-table--direct tbody td:last-child").getBoundingClientRect();
        return {
          documentContained: document.documentElement.scrollWidth === viewportWidth,
          bannerContained: banner.left >= -0.5 && banner.right <= viewportWidth + 0.5,
          surfaceContained: surface.left >= -0.5 && surface.right <= viewportWidth + 0.5,
          cardsContained: cards.every((card) => {
            const rect = card.getBoundingClientRect();
            return rect.left >= surface.left - 0.5 && rect.right <= surface.right + 0.5;
          }),
          cardsUseLockedSurface: cards.length === 2 && cards.every((card) => {
            const style = getComputedStyle(card);
            return style.backgroundColor === "rgb(255, 255, 255)" && style.borderRadius === "16px" && style.boxShadow !== "none";
          }),
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
        cardsContained: true,
        cardsUseLockedSurface: true,
        summariesContained: true,
        bodiesContained: true,
        wrappersContained: true,
        scrollOwnedByWrappers: true,
        rateActionContained: true,
      });
    }
  }, 120_000);

  it("anchors the rate editor to the viewport and reflows it into defined compact states", async () => {
    const dialogHtml = await fixtureDocument(rateDialogFixture());
    for (const width of [1440, 1200, 1024, 760, 600, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent(dialogHtml, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);

      const metrics = await page.evaluate(() => {
        const element = (selector: string) => document.querySelector<HTMLElement>(selector)!;
        const backdrop = element(".finances-rate-dialog-backdrop").getBoundingClientRect();
        const dialog = element(".finances-rate-dialog").getBoundingClientRect();
        const body = element(".finances-rate-dialog .quick-modal-body");
        const summaryFacts = [...document.querySelectorAll<HTMLElement>(".client-assignment-booking-summary > div")];
        const editorChildren = [...document.querySelectorAll<HTMLElement>(".client-assignment-rate-editor > *")];
        const rateControl = element(".client-rate-control").getBoundingClientRect();
        const saveButton = element(".client-rate-control .button").getBoundingClientRect();
        return {
          documentContained: document.documentElement.scrollWidth === document.documentElement.clientWidth,
          backdropViewportAnchored: Math.abs(backdrop.top) < 1 && Math.abs(backdrop.left) < 1 && Math.abs(backdrop.right - innerWidth) < 1 && Math.abs(backdrop.bottom - innerHeight) < 1,
          dialogContained: dialog.left >= -0.5 && dialog.right <= innerWidth + 0.5 && dialog.top >= -0.5 && dialog.bottom <= innerHeight + 0.5,
          bodyContained: body.scrollWidth === body.clientWidth,
          summaryColumns: new Set(summaryFacts.map((fact) => Math.round(fact.getBoundingClientRect().left))).size,
          editorStacked: Math.abs(editorChildren[0].getBoundingClientRect().left - editorChildren[1].getBoundingClientRect().left) < 1 && editorChildren[1].getBoundingClientRect().top >= editorChildren[0].getBoundingClientRect().bottom,
          rateControlContained: saveButton.right <= rateControl.right + 0.5,
          saveButtonFullRow: Math.abs(saveButton.left - rateControl.left) < 1 && Math.abs(saveButton.right - rateControl.right) < 1,
        };
      });

      expect(metrics.documentContained, `document overflow at ${width}px`).toBe(true);
      expect(metrics.backdropViewportAnchored, `backdrop anchoring at ${width}px`).toBe(true);
      expect(metrics.dialogContained, `dialog containment at ${width}px`).toBe(true);
      expect(metrics.bodyContained, `dialog body overflow at ${width}px`).toBe(true);
      expect(metrics.summaryColumns, `summary columns at ${width}px`).toBe(width <= 850 ? 2 : 4);
      expect(metrics.editorStacked, `editor stacking at ${width}px`).toBe(width <= 850);
      expect(metrics.rateControlContained, `rate controls at ${width}px`).toBe(true);
      expect(metrics.saveButtonFullRow, `rate action row at ${width}px`).toBe(width === 390);
    }
  }, 120_000);
});
