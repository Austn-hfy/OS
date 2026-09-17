import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import bundledChromium from "@sparticuz/chromium";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const viewports = [
  { width: 1440, height: 900 },
  { width: 1200, height: 800 },
  { width: 1024, height: 768 },
] as const;

const states = ["batch-menu", "status-legend", "share", "quick-add", "quick-edit", "batch-takeover"] as const;
type InteractionState = (typeof states)[number];
const baselineDirectory = new URL("./visual-baselines/", import.meta.url);

async function browserExecutable() {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicitPath) return { executablePath: explicitPath, args: [] as string[] };
  const localCandidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const localPath = localCandidates.find((candidate) => existsSync(candidate));
  if (localPath) return { executablePath: localPath, args: [] as string[] };
  return { executablePath: await bundledChromium.executablePath(), args: bundledChromium.args };
}

function button(label: string, className = "button") {
  return `<button class="${className}" type="button">${label}</button>`;
}

function commandFixture(state: "batch-menu" | "status-legend") {
  const control = state === "batch-menu"
    ? `<details class="calendar-batch-launcher" open>
        <summary class="calendar-needs-summary calendar-batch-summary attention"><span class="calendar-batch-status"><strong>4</strong><span>need scheduling</span></span><span class="calendar-batch-divider"></span><span class="calendar-batch-label">batch edit</span></summary>
        <div class="calendar-batch-menu"><div class="calendar-batch-menu-heading"><strong>Batch edit a Daypart</strong><small>September 2026</small></div>
          <button class="calendar-batch-menu-row"><span><strong>Lobby Sessions</strong><small>Lobby</small></span><em>4 need scheduling</em></button>
          <button class="calendar-batch-menu-row"><span><strong>Sunset DJ</strong><small>Rooftop</small></span><em class="clear">all scheduled</em></button>
          <button class="calendar-batch-menu-row"><span><strong>Listening Room</strong><small>Amigo</small></span><em>2 need scheduling</em></button>
        </div></details>`
    : `<details class="calendar-status-legend" open><summary aria-label="Color key"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 10.75V16"></path></svg></summary>
        <div class="calendar-status-legend-menu"><span><i class="daypart"></i>Color: Daypart identity</span><span><i class="needs"></i>No check: needs scheduling</span><span><i class="scheduled"></i>Checkmark: scheduled</span><span><i class="hfy-pending"></i>Outlined pink dot: HFY request pending</span><span><i class="hfy-confirmed"></i>Filled pink dot: HFY booked</span></div></details>`;
  return `<main class="visual-command-stage"><section class="calendar-page"><header class="calendar-command-bar"><div class="calendar-command-primary"><div class="calendar-title"><p class="eyebrow">Ace Hotel · Calendar</p><h1>Calendar</h1></div><div class="calendar-month-cluster">${state === "batch-menu" ? control : ""}<div class="month-navigation"><button class="calendar-arrow">←</button><h2>September 2026</h2><button class="calendar-arrow">→</button></div></div></div><div class="calendar-command-secondary"><div class="calendar-toolbar"><div class="calendar-toolbar-cluster calendar-toolbar-filters"><label class="calendar-toolbar-select"><span>Status</span><select><option>All slots</option></select></label><label class="calendar-toolbar-select"><span>Daypart</span><select><option>All Dayparts</option></select></label></div><div class="calendar-toolbar-cluster calendar-toolbar-view"><div class="calendar-view-toggle"><a class="active">Month</a><a>Week</a></div></div><div class="calendar-toolbar-cluster calendar-toolbar-actions">${button("Share calendar", "button secondary calendar-share-button")}${state === "status-legend" ? control : ""}</div></div></div></header><div class="visual-calendar-placeholder"></div></section></main>`;
}

function shareFixture() {
  return `<div class="quick-modal-backdrop modalBackdrop"><section class="quick-modal modal" role="dialog"><header class="quick-modal-header modalHeader"><div><p class="eyebrow">Ace Hotel</p><h2>Share calendar</h2><p>Create and manage read-only links for trusted partners.</p></div><button class="quick-modal-close">×</button></header><div class="quick-modal-body modalBody"><section class="manager formView"><button class="backButton">← Back to existing links</button><div class="formHeading"><h3>Create a new link</h3><p>Name the audience, then choose what they should be able to see.</p></div><div class="formSurface"><div class="nameField"><label>Link name</label><input value="Social Media Team" readonly><small>Use the person, team, or purpose so you can recognize it later.</small></div><fieldset class="scopeFieldset"><legend>What should this link include?</legend><div class="scopeOptions"><label class="scopeOption scopeOptionSelected"><input type="radio" checked readonly><span><strong>Include all Dayparts</strong><small>Every scheduled Daypart in this Residency.</small></span></label><label class="scopeOption"><input type="radio" readonly><span><strong>Select Dayparts</strong><small>Only the rooms or programs selected below.</small></span></label></div></fieldset></div><div class="formActions">${button("Cancel", "secondaryButton")}${button("Create link", "primaryButton")}</div></section></div></section></div>`;
}

function quickDialogFixture(editing: boolean) {
  const content = editing
    ? `<div class="quick-time-summary"><span>Lobby Sessions</span><strong>8:00–11:00 PM</strong></div><section class="replacement-editor"><div class="replacement-step"><span>1</span><div><strong>Scheduled artist</strong><small>Edit hours or change the artist without leaving Calendar.</small></div></div><div class="quick-dj-time-fields"><div class="field"><label>Starts</label><select><option>8:00 PM</option></select></div><div class="field"><label>Ends</label><select><option>11:00 PM</option></select></div></div></section><div class="quick-reschedule-list"><div class="quick-reschedule-row"><div class="quick-existing-dj"><span>DJ 1</span><strong>DANAISY</strong><small>8:00–11:00 PM</small></div><div class="quick-existing-actions">${button("Edit hours", "button secondary")}${button("Change DJ", "button secondary")}</div></div></div>`
    : `<section class="quick-selected-daypart quick-selected-daypart-editable"><div class="quick-selected-daypart-summary"><span>Selected Daypart</span><strong>Lobby Sessions</strong><small>Lobby</small></div><div class="quick-selected-window"><span>Hours for this date</span><div class="quick-inline-time-fields"><div class="field"><label>Starts</label><select><option>8:00 PM</option></select></div><div class="field"><label>Ends</label><select><option>11:00 PM</option></select></div></div></div></section><div class="client-assignment-choices equal-options"><button class="artist-choice-option"><span>Client Managed</span><strong>+ Add your own artist</strong><small>Choose a Residency artist and track the amount owed.</small></button><button class="request-hfy-option"><span>HFY system option</span><strong>Request HFY</strong><small>Send this date to HFY for staffing.</small></button></div><div class="field quick-booking-notes"><label>Notes <span>optional</span></label><textarea>Load-in through the lobby entrance.</textarea></div>`;
  return `<div class="quick-modal-backdrop calendar-quick-modal-backdrop"><section class="quick-modal calendar-event-dialog ${editing ? "quick-modal-edit" : ""}" role="dialog"><header class="quick-modal-header"><div><p class="eyebrow">Wednesday, 2026-09-16</p><h2>${editing ? "Manage · Lobby Sessions" : "Schedule Daypart"}</h2></div><button class="quick-modal-close">×</button></header><div class="quick-modal-body"><form class="quick-book-form">${content}<footer class="quick-modal-footer">${editing ? button("Delete Shift", "button danger-button") : button("Back", "button secondary")}<span>${editing ? "Only this scheduled date is affected." : "Ready to schedule?"}</span>${button("Cancel", "button secondary")}${button(editing ? "Done" : "Save Lobby Sessions")}</footer></form></div></section></div>`;
}

function batchTakeoverFixture() {
  return `<section class="calendar-batch-screen" role="dialog"><header class="calendar-batch-header"><div class="calendar-batch-heading"><div class="calendar-batch-context"><span>Lobby</span><span>September 2026</span></div><h1>Lobby Sessions</h1><p>Schedule each remaining occurrence without returning to the Calendar between dates.</p></div><div class="calendar-batch-header-actions"><strong>1 of 4 scheduled</strong><button class="quick-modal-close">×</button></div></header><div class="calendar-batch-body"><div class="calendar-batch-list"><article class="calendar-batch-row expanded"><button class="calendar-batch-row-summary"><span>Sep 16</span><strong>Wednesday</strong><i>−</i></button><form class="quick-book-form calendar-batch-form"><div class="quick-selected-daypart"><strong>Lobby Sessions</strong><small>8:00–11:00 PM</small></div><div class="calendar-batch-time-fields"><div class="field"><label>Artist starts</label><select><option>8:00 PM</option></select></div><div class="field"><label>Artist ends</label><select><option>11:00 PM</option></select></div></div><footer class="calendar-batch-form-footer"><span>Ready to schedule this date?</span>${button("Save & Next")}</footer></form></article><article class="calendar-batch-row"><button class="calendar-batch-row-summary"><span>Sep 23</span><strong>Wednesday</strong><i>+</i></button></article><article class="calendar-batch-row"><button class="calendar-batch-row-summary"><span>Sep 30</span><strong>Wednesday</strong><i>+</i></button></article></div></div></section>`;
}

function fixture(state: InteractionState) {
  if (state === "batch-menu" || state === "status-legend") return commandFixture(state);
  if (state === "share") return shareFixture();
  if (state === "quick-add") return quickDialogFixture(false);
  if (state === "quick-edit") return quickDialogFixture(true);
  return batchTakeoverFixture();
}

async function fixtureDocument(state: InteractionState) {
  const [tokens, globals, pilot, shareStyles, font] = await Promise.all([
    readFile(new URL("../src/app/hfy-design-tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/public-calendar-link-manager.module.css", import.meta.url), "utf8"),
    readFile(new URL("../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2", import.meta.url)),
  ]);
  const localGlobals = globals.replace(/^@import[^;]+;\s*/m, "");
  const localShareStyles = shareStyles.replace(/:global\(([^)]+)\)/g, "$1");
  const fixtureStyles = `
    @font-face { font-family: VisualGeist; src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2"); font-weight: 100 900; font-style: normal; }
    :root { --hfy-font-sans: VisualGeist, Arial, sans-serif; }
    html, body { width: 100%; min-height: 100%; }
    body { margin: 0; background: #e9edef; font-family: VisualGeist, Arial, sans-serif; }
    .visual-command-stage { min-height: 100vh; padding: 48px; }
    .visual-command-stage .calendar-page { min-height: 620px; padding: 22px; border-radius: var(--hfy-radius-feature); background: rgba(244, 248, 250, .82); }
    .visual-calendar-placeholder { height: 480px; border: 1px solid var(--hfy-line); border-radius: 18px; background: rgba(255,255,255,.8); }
    @media (max-width: 1200px) { .visual-command-stage { padding: 32px; } }
  `;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${tokens}\n${localGlobals}\n${pilot}\n${localShareStyles}\n${fixtureStyles}</style></head><body><div class="hfy-style-system">${fixture(state)}</div></body></html>`;
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
      const difference = (Math.abs(actualPixels[index] - expectedPixels[index]) + Math.abs(actualPixels[index + 1] - expectedPixels[index + 1]) + Math.abs(actualPixels[index + 2] - expectedPixels[index + 2])) / 3;
      totalDifference += difference;
      if (difference > 18) changedPixels += 1;
    }
    const pixelCount = actualPixels.length / 4;
    return { meanDifference: totalDifference / pixelCount, changedPixelRatio: changedPixels / pixelCount };
  }, { actualBase64: actual.toString("base64"), expectedBase64: expected.toString("base64") });
}

describe("Residency Calendar interaction-state visual regression", () => {
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

  it("contains menus, dialogs, footers, and batch workspaces at all desktop widths", async () => {
    for (const state of states) {
      const html = await fixtureDocument(state);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const metrics = await page.evaluate((activeState) => {
          const selector = activeState === "batch-menu" ? ".calendar-batch-menu"
            : activeState === "status-legend" ? ".calendar-status-legend-menu"
              : activeState === "batch-takeover" ? ".calendar-batch-screen"
                : ".quick-modal";
          const surface = document.querySelector<HTMLElement>(selector);
          if (!surface) throw new Error(`Missing interaction surface for ${activeState}`);
          const bounds = surface.getBoundingClientRect();
          const footer = document.querySelector<HTMLElement>(activeState === "share" ? ".formActions" : ".quick-modal-footer");
          const footerBounds = footer?.getBoundingClientRect();
          const dialog = document.querySelector<HTMLElement>(".quick-modal");
          const dialogBounds = dialog?.getBoundingClientRect();
          return {
            noDocumentOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
            surfaceInsideViewport: bounds.left >= -0.5 && bounds.right <= window.innerWidth + 0.5 && bounds.top >= -0.5 && bounds.bottom <= window.innerHeight + 0.5,
            footerInsideDialog: !footerBounds || !dialogBounds || (footerBounds.left >= dialogBounds.left && footerBounds.right <= dialogBounds.right && footerBounds.bottom <= dialogBounds.bottom + 0.5),
            footerMarginInline: footer ? [getComputedStyle(footer).marginLeft, getComputedStyle(footer).marginRight] : null,
          };
        }, state);
        expect(metrics.noDocumentOverflow).toBe(true);
        expect(metrics.surfaceInsideViewport).toBe(true);
        expect(metrics.footerInsideDialog).toBe(true);
        if (state === "share" || state === "quick-add" || state === "quick-edit") expect(metrics.footerMarginInline).toEqual(["0px", "0px"]);

        const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" });
        const baselineUrl = new URL(`residency-calendar-interaction-${state}-${viewport.width}.png`, baselineDirectory);
        if (process.env.UPDATE_CALENDAR_INTERACTION_VISUALS === "1") {
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
