import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
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

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function editorMarkup() {
  const weeklyRules = weekdays.map((day) => `<div class="week-rule enabled"><button class="week-toggle" type="button" aria-pressed="true">${day}</button><div class="week-rule-fields"><div class="field"><label>Start</label><select><option>6:00 PM</option></select></div><div class="field"><label>End</label><select><option>9:00 PM</option></select></div><div class="field"><label>Talent count <span>optional</span></label><input value="1"></div></div></div>`).join("");
  return `<div class="hfy-style-system"><div class="daypart-drawer-backdrop residency-daypart-drawer-backdrop"><aside class="daypart-drawer residency-daypart-drawer" role="dialog"><form class="daypart-editor"><div class="daypart-editor-heading"><div><p class="eyebrow">Edit Daypart</p><div class="daypart-editor-title-row"><h2>Sunset Sessions</h2><span class="daypart-editor-status">Active</span></div></div><button class="quick-modal-close" type="button">×</button></div><div class="daypart-editor-scroll"><div class="field"><label>Type</label><div class="daypart-type-options"><button class="active" type="button"><strong>Talent Activity</strong><small>Schedule programming with talent. Assignments and financial tracking follow the billing choice you select next.</small></button><button type="button"><strong>House Activity</strong><small>Schedule an activity or optional host without creating talent financial records.</small></button></div></div><div class="row daypart-identity-row"><div class="field"><label>Name</label><input value="Sunset Sessions"></div><div class="field"><label>Room / space</label><input value="Rooftop Lounge"></div></div><div class="daypart-definition-row has-settings"><div class="field daypart-color-field"><label>Room color shade</label><div class="daypart-color-control"><span></span><strong>Purple</strong></div></div><div class="daypart-setting-tiles"><button class="daypart-setting-tile rate" type="button"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M15 8.5c-.7-.7-1.7-1.1-3-1.1-1.7 0-3 .9-3 2.2 0 3.2 6 1.5 6 4.8 0 1.3-1.3 2.2-3 2.2-1.4 0-2.5-.4-3.3-1.2M12 5.5v13"></path></svg><span><small>Default artist rate</small><strong>$90/hr</strong></span><em>Edit</em></button><button class="daypart-setting-tile end-date" type="button"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"></path><path d="M12 14v5M9.5 16.5h5"></path></svg><span><small>End date</small><strong>None</strong></span><em>Add</em></button></div></div><div class="week-rule-selection"><div class="week-rule-intro"><div><strong>Weekly hours</strong><small>Select every day this Daypart runs. Each day can keep different hours.</small></div><button class="button secondary" type="button">Sync times to selected days</button></div><div class="week-rule-grid">${weeklyRules}</div></div></div><div class="daypart-editor-actions"><div class="daypart-editor-more"><button class="daypart-editor-more-trigger" type="button">More actions</button><div class="daypart-editor-more-menu" role="menu"><button role="menuitem">Pause Daypart</button><button class="danger" role="menuitem">Delete / archive Daypart</button></div></div><div class="daypart-editor-primary-actions"><button class="button secondary" type="button">Cancel</button><button class="button" type="button">Save Daypart</button></div></div></form></aside></div></div>`;
}

function roomEditorMarkup() {
  const hues = ["Blue", "Orange", "Green", "Purple"].map((hue) => `<button type="button"><i></i><span>${hue}</span></button>`).join("");
  return `<div class="hfy-style-system"><div class="room-editor-backdrop residency-room-editor-backdrop"><aside class="room-editor-panel residency-room-editor-panel" role="dialog"><div class="room-editor-heading"><div><p class="eyebrow">Room &amp; space</p><h2>Edit room</h2></div><button class="quick-modal-close">×</button></div><div class="room-editor-body"><div class="field"><label>Room name</label><input value="Rooftop Lounge"></div><div class="field"><label>Room color</label><div class="room-hue-picker">${hues}</div><small>Saving updates the room name everywhere and recolors its Dayparts and reusable templates.</small></div><div class="daypart-danger-zone"><div><strong>Delete room</strong><small>Only an empty room can be deleted.</small></div><button class="remove-dj-button">Delete room</button></div></div><div class="room-editor-actions"><button class="button secondary">Cancel</button><button class="button">Save room</button></div></aside></div></div>`;
}

function popoverMarkup() {
  return `<div class="hfy-style-system"><div class="room-template-popover residency-room-template-popover" style="left:12px;top:24px;width:300px;max-height:420px"><div class="room-template-popover-heading"><div><span>Saved templates</span><strong>Rooftop Lounge</strong></div><button>×</button></div><div class="room-template-list"><button class="calendar-only-daypart-card room-template-card"><span></span><div><strong>Sunset Sessions</strong><small>Talent Activity</small></div><div class="calendar-only-daypart-meta"><em>Default hours</em><span>6:00 PM–9:00 PM</span></div></button><button class="calendar-only-daypart-card room-template-card"><span></span><div><strong>Listening Room</strong><small>House Activity</small></div><div class="calendar-only-daypart-meta"><em>Default hours</em><span>8:00 PM–11:00 PM</span></div></button></div></div></div>`;
}

async function fixtureDocument(markup: string) {
  const [tokens, globals, pilot, font] = await Promise.all([
    readFile(new URL("../src/app/hfy-design-tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
    readFile(new URL("../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2", import.meta.url)),
  ]);
  const localGlobals = globals.replace(/^@import[^;]+;\s*/m, "");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${tokens}\n${localGlobals}\n${pilot}\n@font-face{font-family:VisualGeist;src:url(data:font/woff2;base64,${font.toString("base64")}) format("woff2");font-weight:100 900}html,body{width:100%;height:100%;overflow:hidden}body{background:#e9edef;font-family:VisualGeist,Arial,sans-serif}</style></head><body>${markup}</body></html>`;
}

describe("Residency Day Parts overlay visual contract", () => {
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

  it("contains the Daypart editor and switches its form to defined compact states", async () => {
    const html = await fixtureDocument(editorMarkup());
    for (const width of [1440, 1024, 760, 600, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => {
        const element = (selector: string) => document.querySelector<HTMLElement>(selector)!;
        const box = (selector: string) => element(selector).getBoundingClientRect();
        const drawer = box(".residency-daypart-drawer");
        const footer = box(".daypart-editor-actions");
        const menu = box(".daypart-editor-more-menu");
        const options = [...document.querySelectorAll<HTMLElement>(".daypart-type-options > button")].map((item) => item.getBoundingClientRect());
        const weekGrid = element(".week-rule-grid");
        const firstRule = box(".week-rule");
        const rateLabel = box(".daypart-setting-tile.rate small");
        const rateAction = box(".daypart-setting-tile.rate > em");
        return {
          documentContained: document.documentElement.scrollWidth === document.documentElement.clientWidth,
          drawerContained: drawer.left >= -0.5 && drawer.right <= innerWidth + 0.5,
          bodyContained: element(".daypart-editor-scroll").scrollWidth === element(".daypart-editor-scroll").clientWidth,
          footerContained: footer.left >= drawer.left && footer.right <= drawer.right + 0.5,
          menuContained: menu.left >= drawer.left && menu.right <= drawer.right + 0.5 && menu.top >= -0.5,
          optionsStacked: Math.abs(options[0].left - options[1].left) < 1 && options[1].top >= options[0].bottom,
          weekGridOverflow: weekGrid.scrollWidth > weekGrid.clientWidth,
          ruleWidth: firstRule.width,
          rateLabelClearOfAction: rateLabel.right + 4 <= rateAction.left,
        };
      });
      expect(metrics.documentContained).toBe(true);
      expect(metrics.drawerContained).toBe(true);
      expect(metrics.bodyContained).toBe(true);
      expect(metrics.footerContained).toBe(true);
      expect(metrics.menuContained).toBe(true);
      expect(metrics.optionsStacked).toBe(width <= 600);
      expect(metrics.weekGridOverflow).toBe([760, 600].includes(width));
      expect(metrics.rateLabelClearOfAction).toBe(true);
      if (width === 390) expect(metrics.ruleWidth).toBeGreaterThan(340);
      if (process.env.WRITE_DAYPARTS_ARTIFACTS === "1" && [1024, 600, 390].includes(width)) {
        await writeFile(`/tmp/hfy-dayparts-editor-${width}.png`, await page.screenshot({ fullPage: true, animations: "disabled" }));
      }
    }
  }, 120_000);

  it("contains the room editor and saved-template popover at narrow width", async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.setContent(await fixtureDocument(roomEditorMarkup()), { waitUntil: "load" });
    const roomMetrics = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".residency-room-editor-panel")!;
      const hueButtons = [...document.querySelectorAll<HTMLElement>(".room-hue-picker button")];
      return {
        panelContained: panel.getBoundingClientRect().left >= -0.5 && panel.getBoundingClientRect().right <= innerWidth + 0.5,
        bodyContained: panel.scrollWidth === panel.clientWidth,
        hueColumns: new Set(hueButtons.map((button) => Math.round(button.getBoundingClientRect().left))).size,
      };
    });
    expect(roomMetrics).toEqual({ panelContained: true, bodyContained: true, hueColumns: 2 });
    if (process.env.WRITE_DAYPARTS_ARTIFACTS === "1") await writeFile("/tmp/hfy-dayparts-room-editor-390.png", await page.screenshot({ fullPage: true, animations: "disabled" }));

    await page.setContent(await fixtureDocument(popoverMarkup()), { waitUntil: "load" });
    const popoverMetrics = await page.evaluate(() => {
      const popover = document.querySelector<HTMLElement>(".residency-room-template-popover")!;
      const cards = [...document.querySelectorAll<HTMLElement>(".room-template-card")];
      const metas = [...document.querySelectorAll<HTMLElement>(".calendar-only-daypart-meta")];
      return {
        contained: popover.getBoundingClientRect().left >= 0 && popover.getBoundingClientRect().right <= innerWidth,
        cardsContained: cards.every((card) => card.scrollWidth === card.clientWidth),
        metaBelowCopy: metas.every((meta) => meta.getBoundingClientRect().left === cards[0].querySelectorAll("div")[0].getBoundingClientRect().left),
      };
    });
    expect(popoverMetrics).toEqual({ contained: true, cardsContained: true, metaBelowCopy: true });
  }, 120_000);
});
