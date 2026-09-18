import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = new URL("../", import.meta.url);

describe("Residency Focus Panel responsive layout", () => {
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
    { width: 1440, height: 900, focusColumns: 2, listColumns: 1, detailColumns: 2 },
    { width: 1200, height: 900, focusColumns: 2, listColumns: 1, detailColumns: 2 },
    { width: 1024, height: 900, focusColumns: 1, listColumns: 2, detailColumns: 2 },
    { width: 768, height: 900, focusColumns: 1, listColumns: 2, detailColumns: 2 },
    { width: 375, height: 812, focusColumns: 1, listColumns: 1, detailColumns: 1 },
  ] as const) {
    it(`keeps the Focus Panel readable and contained at ${viewport.width}px`, async () => {
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
            <div class="residency-section-header residency-section-header--split"><div><p class="eyebrow">Users &amp; roles</p><h2>People with access</h2><p>Pending invitations and active users both count toward the four-user limit.</p></div><span class="residency-user-seat-count">2 of 4 seats · 2 available</span></div>
            <form class="residency-user-invite-form">
              <label class="field residency-user-invite-email"><span>Email addresses</span><input value="viewer@example.com" /><small>Separate multiple addresses with commas.</small></label>
              <label class="field residency-user-invite-role"><span>Access role</span><select id="invite-role"><option value="calendar_viewer">Calendar viewer</option><option value="manager">Manager</option></select><small>Calendar-only or full workspace access.</small></label>
              <button class="button residency-user-invite-submit" type="button">Send invitations</button>
            </form>
            <div class="residency-user-focus-layout">
              <div class="residency-user-focus-list" role="group" aria-label="People with access">
                <button class="residency-user-focus-option" aria-controls="focus-detail" aria-pressed="true" data-member="austyn" type="button">
                  <span class="residency-user-avatar">AI</span><span><strong>Austyn Internal Test</strong><small>Manager · Enrolled</small></span>
                </button>
                <button class="residency-user-focus-option" aria-controls="focus-detail" aria-pressed="false" data-member="jordan" type="button">
                  <span class="residency-user-avatar">JL</span><span><strong>jordan.lee@example.com</strong><small>Calendar viewer · Pending</small></span>
                </button>
              </div>
              <section class="residency-user-focus-detail active" id="focus-detail">
                <div class="residency-user-focus-detail-head">
                  <div class="residency-user-identity"><span class="residency-user-avatar">AI</span><span><strong id="selected-person">Austyn Internal Test</strong><small>760amoreno@gmail.com</small></span></div>
                  <div class="residency-user-status"><span class="status active">Primary contact</span><span class="status active">Enrolled</span></div>
                </div>
                <div class="residency-user-focus-detail-grid">
                  <div class="residency-user-access"><small class="residency-user-focus-label">Access role</small><form class="residency-user-role-form"><select aria-label="Role for Austyn Internal Test"><option>Manager</option><option>Calendar viewer</option></select><button class="button secondary" type="button">Update role</button></form></div>
                  <div class="residency-user-focus-access-copy"><small class="residency-user-focus-label">Account access</small><p>Full workspace, Account, users, roles, and Billing.</p></div>
                </div>
                <div class="residency-user-focus-actions">
                  <div class="residency-user-actions"><form><button class="button secondary" type="button">View as</button></form><form><button class="button secondary" type="button">Reset password</button></form><form><button class="button secondary" type="button">Make primary</button></form></div>
                  <form><button class="button danger" type="button">Remove</button></form>
                </div>
              </section>
            </div>
          </section>
        </main>
        <script>
          document.querySelectorAll('[data-member]').forEach((button) => button.addEventListener('click', () => {
            document.querySelectorAll('[data-member]').forEach((member) => member.setAttribute('aria-pressed', String(member === button)));
            document.querySelector('#selected-person').textContent = button.dataset.member === 'austyn' ? 'Austyn Internal Test' : 'Jordan Lee';
          }));
        </script>
      `);

      const metrics = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>(".residency-users-card")!;
        const invite = document.querySelector<HTMLElement>(".residency-user-invite-form")!;
        const layout = document.querySelector<HTMLElement>(".residency-user-focus-layout")!;
        const list = document.querySelector<HTMLElement>(".residency-user-focus-list")!;
        const detail = document.querySelector<HTMLElement>(".residency-user-focus-detail")!;
        const detailGrid = document.querySelector<HTMLElement>(".residency-user-focus-detail-grid")!;
        const columnCount = (element: HTMLElement) => getComputedStyle(element).gridTemplateColumns.split(" ").length;

        return {
          documentContained: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          inviteContained: invite.scrollWidth <= invite.clientWidth,
          layoutContained: layout.scrollWidth <= layout.clientWidth,
          listContained: list.scrollWidth <= list.clientWidth,
          detailContained: detail.scrollWidth <= detail.clientWidth && detail.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1,
          controlsContained: [...document.querySelectorAll<HTMLElement>("input, select, button")].every((control) => control.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1),
          clippedCopy: [...document.querySelectorAll<HTMLElement>(".residency-user-focus-layout strong, .residency-user-focus-layout small, .residency-user-focus-layout p, .residency-user-focus-layout button")].some((node) => node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight),
          focusColumns: columnCount(layout),
          listColumns: columnCount(list),
          detailColumns: columnCount(detailGrid),
        };
      });

      expect(metrics.documentContained).toBe(true);
      expect(metrics.inviteContained).toBe(true);
      expect(metrics.layoutContained).toBe(true);
      expect(metrics.listContained).toBe(true);
      expect(metrics.detailContained).toBe(true);
      expect(metrics.controlsContained).toBe(true);
      expect(metrics.clippedCopy).toBe(false);
      expect(metrics.focusColumns).toBe(viewport.focusColumns);
      expect(metrics.listColumns).toBe(viewport.listColumns);
      expect(metrics.detailColumns).toBe(viewport.detailColumns);

      const inviteRole = page.locator("#invite-role");
      await inviteRole.selectOption("manager");
      expect(await inviteRole.inputValue()).toBe("manager");
      await inviteRole.selectOption("calendar_viewer");
      expect(await inviteRole.inputValue()).toBe("calendar_viewer");

      await page.getByRole("button", { name: /jordan.lee@example.com/i }).click();
      expect(await page.getByRole("button", { name: /jordan.lee@example.com/i }).getAttribute("aria-pressed")).toBe("true");
      expect(await page.locator("#selected-person").textContent()).toBe("Jordan Lee");
      await page.getByRole("button", { name: /Austyn Internal Test/i }).click();
      expect(await page.getByRole("button", { name: /Austyn Internal Test/i }).getAttribute("aria-pressed")).toBe("true");
      await page.getByRole("button", { name: "Reset password" }).click();

      await page.close();
    });
  }
});
