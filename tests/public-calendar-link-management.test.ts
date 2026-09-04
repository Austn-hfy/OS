import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function actionBlock(actions: string, name: string, nextName?: string) {
  const start = actions.indexOf(`export async function ${name}`);
  const end = nextName ? actions.indexOf(`export async function ${nextName}`, start) : actions.length;
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return actions.slice(start, end);
}

describe("persistent public calendar link management", () => {
  it("authorizes every server action against the requested Residency", async () => {
    const actions = await source("../src/app/app/calendar-share-actions.ts");
    const names = [
      "createPublicCalendarLinkAction",
      "updatePublicCalendarLinkAction",
      "copyPublicCalendarLinkAction",
      "stopPublicCalendarLinkAction",
      "replacePublicCalendarLinkAction",
    ];
    for (const [index, name] of names.entries()) {
      const block = actionBlock(actions, name, names[index + 1]);
      expect(block).toContain("requireActorForResidency(parsed.residencyId, { manager: true })");
      if (name === "createPublicCalendarLinkAction") expect(block).toContain("residencyId: parsed.residencyId");
      else expect(block).toContain("eq(publicCalendarLinks.residencyId, parsed.residencyId)");
    }
  });

  it("keeps edit separate from replacement and revocation", async () => {
    const actions = await source("../src/app/app/calendar-share-actions.ts");
    const update = actionBlock(actions, "updatePublicCalendarLinkAction", "copyPublicCalendarLinkAction");
    const replace = actionBlock(actions, "replacePublicCalendarLinkAction");
    const stop = actionBlock(actions, "stopPublicCalendarLinkAction", "replacePublicCalendarLinkAction");

    expect(update).not.toContain("tokenHash,");
    expect(update).not.toContain("tokenCiphertext,");
    expect(update).not.toContain("rotatedAt");
    expect(update).toContain("public_calendar_link_updated");
    expect(replace).toContain("tokenHash,");
    expect(replace).toContain("tokenCiphertext,");
    expect(replace).toContain("public_calendar_link_replaced");
    expect(stop).toContain("tokenCiphertext: null");
    expect(stop).toContain("revokedAt: stoppedAt");
    expect(stop).toContain("public_calendar_link_stopped");
  });

  it("only resolves active links and applies selected Dayparts by link id", async () => {
    const publicCalendar = await source("../src/data/public-calendar.ts");
    expect(publicCalendar).toContain("isNull(publicCalendarLinks.revokedAt)");
    expect(publicCalendar).toContain("eq(publicCalendarLinkDayparts.linkId, link.id)");
    expect(publicCalendar).not.toContain("eq(publicCalendarLinkDayparts.residencyId, link.residencyId)");
  });

  it("exposes every approved management state in the Share Calendar dialog", async () => {
    const [manager, button, styles] = await Promise.all([
      source("../src/components/public-calendar-link-manager.tsx"),
      source("../src/components/calendar-share-button.tsx"),
      source("../src/components/public-calendar-link-manager.module.css"),
    ]);
    for (const label of [
      "Existing links",
      "Copy link",
      "Edit",
      "Stop",
      "Create new link",
      "View stopped links",
      "Create replacement",
      "Replace URL",
      "Include all Dayparts",
      "Select Dayparts",
      "Included Dayparts",
    ]) expect(manager).toContain(label);
    expect(manager).not.toContain("Regenerate link");
    expect(manager).not.toContain("Copy again");
    expect(manager).toContain("Copied to clipboard");
    expect(manager).toContain("manualCopyFallback");
    expect(button).toContain('role="dialog"');
    expect(button).toContain('aria-modal="true"');
    expect(button).toContain('event.key === "Escape"');
    expect(button).toContain('event.key !== "Tab"');
    expect(button).toContain('aria-describedby="calendar-share-description"');
    expect(button).toContain("createPortal");
    expect(styles).toContain(".daypartChildPanel");
    expect(styles).toContain(".modalBackdrop");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });
});
