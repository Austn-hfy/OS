import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("Residency Calendar interaction contract", () => {
  it("keeps add/edit and batch dialogs modal, keyboard-contained, and focus-restoring", async () => {
    const [calendar, batchEditor] = await Promise.all([
      source("../src/app/app/calendar/residency-calendar.tsx"),
      source("../src/components/calendar-batch-editor.tsx"),
    ]);

    expect(calendar).toContain('className={`quick-modal calendar-event-dialog');
    expect(calendar).toContain('aria-modal="true"');
    expect(calendar).toContain('event.key !== "Tab"');
    expect(calendar).toContain("overlayTriggerRef.current");
    expect(calendar).toContain("returnFocusTarget.focus()");
    expect(batchEditor).toContain('aria-modal="true"');
    expect(batchEditor).toContain('event.key !== "Tab"');
    expect(batchEditor).toContain('querySelector<HTMLElement>("summary")?.focus()');
  });

  it("closes Calendar popovers predictably without letting them escape the viewport", async () => {
    const [legend, batchEditor, calendar, pilot] = await Promise.all([
      source("../src/components/calendar-status-legend.tsx"),
      source("../src/components/calendar-batch-editor.tsx"),
      source("../src/app/app/calendar/residency-calendar.tsx"),
      source("../src/app/hfy-style-pilot.css"),
    ]);

    for (const component of [legend, batchEditor, calendar]) {
      expect(component).toContain('event.key === "Escape"');
      expect(component).toContain('document.addEventListener("pointerdown"');
    }
    expect(pilot).toContain(".hfy-style-system .calendar-status-legend-menu");
    expect(pilot).toContain("max-width: calc(100vw - 64px)");
    expect(pilot).toContain("max-height: min(520px, calc(100dvh - 96px))");
  });

  it("contains Calendar action footers without the legacy negative-margin bleed", async () => {
    const [pilot, shareStyles] = await Promise.all([
      source("../src/app/hfy-style-pilot.css"),
      source("../src/components/public-calendar-link-manager.module.css"),
    ]);

    const calendarFooter = pilot.slice(pilot.indexOf(".hfy-style-system .calendar-event-dialog .quick-modal-footer"));
    expect(calendarFooter).toContain("margin: var(--hfy-space-2) 0 0");
    expect(calendarFooter).toContain("border-radius: var(--hfy-radius-control)");
    const shareFooter = shareStyles.slice(shareStyles.indexOf(".formActions"), shareStyles.indexOf(".successMessage"));
    expect(shareFooter).toContain("margin: 16px 0 0");
    expect(shareFooter).not.toMatch(/margin:[^;]*-/);
  });
});
