import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = new URL("../", import.meta.url);

describe("Residency layered person-card responsive layout", () => {
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
    { width: 1440, height: 900, layout: "wide" },
    { width: 1200, height: 900, layout: "wide" },
    { width: 1024, height: 900, layout: "wide" },
    { width: 768, height: 900, layout: "wide" },
    { width: 375, height: 812, layout: "narrow" },
  ] as const) {
    it(`keeps the layered person cards readable and contained at ${viewport.width}px`, async () => {
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
            <div class="residency-user-list" role="list">
              <article class="residency-user-card active" role="listitem">
                <div class="residency-user-card-top">
                  <div class="residency-user-identity"><span class="residency-user-avatar">AI</span><span><strong>Austyn Internal Test</strong><small>760amoreno@gmail.com</small></span></div>
                  <div class="residency-user-status"><span class="status active">Primary contact</span><span class="status active">Enrolled</span></div>
                </div>
                <div class="residency-user-card-bottom">
                  <div class="residency-user-access"><form class="residency-user-role-form"><select aria-label="Role for Austyn Internal Test"><option>Manager</option><option>Calendar viewer</option></select><button class="button secondary" type="button">Update role</button></form></div>
                  <div class="residency-user-actions"><button class="button secondary" type="button">Reset password</button><button class="button secondary" type="button">View as</button></div>
                </div>
              </article>
              <article class="residency-user-card pending" role="listitem">
                <div class="residency-user-card-top">
                  <div class="residency-user-identity"><span class="residency-user-avatar">JL</span><span><strong>jordan.lee@example.com</strong><small>Invited Sep 18, 2026 by HFY</small></span></div>
                  <div class="residency-user-status"><span class="status pending">Invitation pending</span></div>
                </div>
                <div class="residency-user-card-bottom">
                  <div class="residency-user-access"><div class="residency-user-pending-role"><strong>Calendar viewer</strong><small>Calendar only. No Account, Billing, Talent, or Finances access.</small></div></div>
                  <div class="residency-user-actions"><button class="button secondary" type="button">Resend invite</button><button class="button danger" type="button">Revoke</button></div>
                </div>
              </article>
              </div>
          </section>
        </main>
      `);

      const metrics = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>(".residency-users-card")!;
        const invite = document.querySelector<HTMLElement>(".residency-user-invite-form")!;
        const list = document.querySelector<HTMLElement>(".residency-user-list")!;
        const cards = [...document.querySelectorAll<HTMLElement>(".residency-user-card")];
        const cardBottoms = [...document.querySelectorAll<HTMLElement>(".residency-user-card-bottom")];
        const actions = [...document.querySelectorAll<HTMLElement>(".residency-user-actions")];
        const firstBottomStyle = getComputedStyle(cardBottoms[0]);

        return {
          documentContained: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          inviteContained: invite.scrollWidth <= invite.clientWidth,
          listContained: list.scrollWidth <= list.clientWidth,
          cardsContained: cards.every((personCard) => personCard.scrollWidth <= personCard.clientWidth && personCard.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1),
          cardBottomsContained: cardBottoms.every((bottom) => bottom.scrollWidth <= bottom.clientWidth),
          controlsContained: [...document.querySelectorAll<HTMLElement>("input, select, button")].every((control) => control.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1),
          bottomColumns: firstBottomStyle.gridTemplateColumns.split(" ").length,
          actionWidths: actions.map((action) => action.getBoundingClientRect().width),
          clippedCopy: [...document.querySelectorAll<HTMLElement>(".residency-user-card strong, .residency-user-card small, .residency-user-actions .button")].some((node) => node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight),
        };
      });

      expect(metrics.documentContained).toBe(true);
      expect(metrics.inviteContained).toBe(true);
      expect(metrics.listContained).toBe(true);
      expect(metrics.cardsContained).toBe(true);
      expect(metrics.cardBottomsContained).toBe(true);
      expect(metrics.controlsContained).toBe(true);
      expect(metrics.clippedCopy).toBe(false);
      expect(metrics.actionWidths.every((width) => width > 0)).toBe(true);

      expect(metrics.bottomColumns).toBe(viewport.layout === "wide" ? 2 : 1);

      const inviteRole = page.locator("#invite-role");
      await inviteRole.selectOption("manager");
      expect(await inviteRole.inputValue()).toBe("manager");
      await inviteRole.selectOption("calendar_viewer");
      expect(await inviteRole.inputValue()).toBe("calendar_viewer");
      await page.getByRole("button", { name: "Reset password" }).click();
      await page.getByRole("button", { name: "Resend invite" }).click();

      await page.close();
    });
  }
});
