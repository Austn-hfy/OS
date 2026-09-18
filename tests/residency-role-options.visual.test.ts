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
    { width: 1200, height: 900, formStacked: false, choicesStacked: false },
    { width: 1100, height: 900, formStacked: true, choicesStacked: false },
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
          @media (min-width: 850px) { main { width: min(1100px, calc(100% - 252px)); margin: 0 0 0 252px; } }
        </style>
        <main>
          <section class="residency-users-card">
            <form class="residency-user-invite-form">
              <label class="field"><span>Email addresses</span><textarea>viewer@example.com</textarea></label>
              <fieldset class="residency-role-options">
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
              <div class="residency-user-invite-actions"><button class="button" type="button">Send invite</button></div>
            </form>
            <div class="residency-user-row">
              <div class="residency-user-identity"><strong>Residency Manager</strong><span>manager@example.com</span></div>
              <div class="residency-user-role"><strong>Manager</strong><small>Full workspace, Account, users, roles, and Billing.</small></div>
              <div class="residency-user-actions"><button class="button secondary" type="button">Save role</button><button class="button secondary" type="button">View as manager</button></div>
            </div>
          </section>
        </main>
      `);

      const metrics = await page.evaluate(() => {
        const form = document.querySelector<HTMLElement>(".residency-user-invite-form")!;
        const card = document.querySelector<HTMLElement>(".residency-users-card")!;
        const fieldset = document.querySelector<HTMLElement>("fieldset")!;
        const userRow = document.querySelector<HTMLElement>(".residency-user-row")!;
        const userIdentity = document.querySelector<HTMLElement>(".residency-user-identity")!;
        const userRole = document.querySelector<HTMLElement>(".residency-user-role")!;
        const userActions = document.querySelector<HTMLElement>(".residency-user-actions")!;
        const options = [...document.querySelectorAll<HTMLElement>(".residency-role-option")];
        const copy = [...document.querySelectorAll<HTMLElement>(".residency-role-option > span")];
        const radios = [...document.querySelectorAll<HTMLInputElement>('.residency-role-option input[type="radio"]')];
        const boxes = options.map((option) => option.getBoundingClientRect());
        const formBox = form.getBoundingClientRect();
        const cardBox = card.getBoundingClientRect();
        const userRowBox = userRow.getBoundingClientRect();

        return {
          documentContained: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          formContained: form.scrollWidth <= form.clientWidth,
          formContainedInCard: formBox.left >= cardBox.left - 1 && formBox.right <= cardBox.right + 1,
          userRowContainedInCard: userRowBox.left >= cardBox.left - 1 && userRowBox.right <= cardBox.right + 1 && userRow.scrollWidth <= userRow.clientWidth,
          equalWidths: Math.abs(boxes[0].width - boxes[1].width) < 1,
          formStacked: getComputedStyle(form).gridTemplateColumns.split(" ").length === 1,
          choicesStacked: Math.abs(boxes[0].top - boxes[1].top) > 1,
          containedInFieldset: boxes.every((box) => box.left >= fieldset.getBoundingClientRect().left - 1 && box.right <= fieldset.getBoundingClientRect().right + 1),
          copyContained: copy.every((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight),
          copyHasReadableWidth: copy.every((node) => node.clientWidth >= 100),
          copyOverflow: copy.map((node) => getComputedStyle(node).overflow),
          copyWordBreak: copy.map((node) => getComputedStyle(node).wordBreak),
          radioSizes: radios.map((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })),
          actionsUseOwnRow: userActions.getBoundingClientRect().top >= Math.max(userIdentity.getBoundingClientRect().bottom, userRole.getBoundingClientRect().bottom),
        };
      });

      expect(metrics).toMatchObject({
        documentContained: true,
        formContained: true,
        formContainedInCard: true,
        userRowContainedInCard: true,
        equalWidths: true,
        formStacked: viewport.formStacked,
        choicesStacked: viewport.choicesStacked,
        containedInFieldset: true,
        copyContained: true,
        copyHasReadableWidth: true,
        actionsUseOwnRow: true,
      });
      expect(metrics.copyOverflow).not.toContain("hidden");
      expect(metrics.copyOverflow).not.toContain("clip");
      expect(metrics.copyWordBreak).toEqual(["normal", "normal"]);
      expect(metrics.radioSizes).toEqual([{ width: 18, height: 18 }, { width: 18, height: 18 }]);

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
