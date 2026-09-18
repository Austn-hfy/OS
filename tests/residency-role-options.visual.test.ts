import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = new URL("../", import.meta.url);

describe("Residency role option responsive layout", () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  let css = "";

  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
    const [globals, tokens] = await Promise.all([
      readFile(new URL("src/app/globals.css", root), "utf8"),
      readFile(new URL("src/app/hfy-design-tokens.css", root), "utf8"),
    ]);
    css = `${tokens}\n${globals}`;
  });

  afterAll(async () => {
    await browser?.close();
  });

  for (const viewport of [
    { width: 1440, height: 900, formStacked: false, choicesStacked: false },
    { width: 1024, height: 900, formStacked: true, choicesStacked: false },
    { width: 768, height: 900, formStacked: true, choicesStacked: false },
    { width: 375, height: 812, formStacked: true, choicesStacked: true },
  ]) {
    it(`keeps both role choices readable and interactive at ${viewport.width}px`, async () => {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.setContent(`
        <style>
          ${css}
          * { box-sizing: border-box; }
          body { margin: 0; padding: 20px; }
          main { width: min(1100px, 100%); margin: 0 auto; }
        </style>
        <main>
          <form class="residency-user-invite-form">
            <label class="field"><span>Email addresses</span><textarea>viewer@example.com</textarea></label>
            <fieldset>
              <legend>Access role</legend>
              <label class="residency-role-option">
                <input type="radio" name="role" value="calendar_viewer" checked />
                <span><strong>Calendar viewer</strong><small>Calendar only. No Account, Billing, Talent, or Finances access.</small></span>
              </label>
              <label class="residency-role-option">
                <input type="radio" name="role" value="manager" />
                <span><strong>Manager</strong><small>Full workspace, Account, users, roles, and Billing.</small></span>
              </label>
            </fieldset>
            <button class="button" type="button">Send invite</button>
          </form>
        </main>
      `);

      const metrics = await page.evaluate(() => {
        const form = document.querySelector<HTMLElement>(".residency-user-invite-form")!;
        const fieldset = document.querySelector<HTMLElement>("fieldset")!;
        const options = [...document.querySelectorAll<HTMLElement>(".residency-role-option")];
        const copy = [...document.querySelectorAll<HTMLElement>(".residency-role-option > span")];
        const boxes = options.map((option) => option.getBoundingClientRect());

        return {
          documentContained: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          formContained: form.scrollWidth <= form.clientWidth,
          equalWidths: Math.abs(boxes[0].width - boxes[1].width) < 1,
          formStacked: getComputedStyle(form).gridTemplateColumns.split(" ").length === 1,
          choicesStacked: Math.abs(boxes[0].top - boxes[1].top) > 1,
          containedInFieldset: boxes.every((box) => box.left >= fieldset.getBoundingClientRect().left - 1 && box.right <= fieldset.getBoundingClientRect().right + 1),
          copyContained: copy.every((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight),
          copyOverflow: copy.map((node) => getComputedStyle(node).overflow),
        };
      });

      expect(metrics).toMatchObject({
        documentContained: true,
        formContained: true,
        equalWidths: true,
        formStacked: viewport.formStacked,
        choicesStacked: viewport.choicesStacked,
        containedInFieldset: true,
        copyContained: true,
      });
      expect(metrics.copyOverflow).not.toContain("hidden");
      expect(metrics.copyOverflow).not.toContain("clip");

      const calendarViewer = page.locator('input[value="calendar_viewer"]');
      const manager = page.locator('input[value="manager"]');
      await manager.click();
      expect(await manager.isChecked()).toBe(true);
      expect(await calendarViewer.isChecked()).toBe(false);
      await calendarViewer.click();
      expect(await calendarViewer.isChecked()).toBe(true);
      expect(await manager.isChecked()).toBe(false);

      await page.close();
    });
  }
});
