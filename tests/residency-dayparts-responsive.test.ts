import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency Day Parts responsive contract", () => {
  it("adopts the shared Residency frame only on the client-facing route", async () => {
    const [clientRoute, ownerRoute, manager] = await Promise.all([
      readSource("../src/app/residency/dayparts/page.tsx"),
      readSource("../src/app/app/dayparts/page.tsx"),
      readSource("../src/app/app/setup/daypart-manager.tsx"),
    ]);

    expect(clientRoute).toContain("residencySurface");
    expect(ownerRoute).not.toContain("residencySurface");
    expect(manager).toContain("ResidencyPageSurface");
    expect(manager).toContain("ResidencyPageHeader");
    expect(manager).toContain("ResidencyPageBody");
    expect(manager).toContain('eyebrow="Day Parts · Schedule setup"');
    expect(manager).not.toContain("ResidencyCollectionPanel");
  });

  it("contains the board and overlay states with component-aware contracts", async () => {
    const [manager, tokens, styles, docs, audit] = await Promise.all([
      readSource("../src/app/app/setup/daypart-manager.tsx"),
      readSource("../src/app/hfy-design-tokens.css"),
      readSource("../src/app/hfy-style-pilot.css"),
      readSource("../docs/DESIGN_SYSTEM_V1.md"),
      readSource("../docs/UI_UX_DESKTOP_AUDIT_CLIENT_RESIDENCY.md"),
    ]);

    for (const token of [
      "--hfy-dayparts-board-min-width: 840px",
      "--hfy-dayparts-room-track: 112px",
      "--hfy-dayparts-day-track-min: 104px",
      "--hfy-dayparts-event-title-size: 11px",
      "--hfy-dayparts-event-meta-size: 10px",
      "--hfy-dayparts-event-min-height: 42px",
      "--hfy-dayparts-editor-day-min-width: 124px",
    ]) expect(tokens).toContain(token);

    expect(manager).toContain('className="daypart-week-scroll"');
    expect(manager).toContain("draftDialogRef");
    expect(manager).toContain("roomDialogRef");
    expect(manager).toContain("focusableElements");
    expect(manager).toContain("roomDraft ? createPortal");
    expect(manager).toContain("draft ? createPortal");
    expect(manager).toContain("editorActionsTriggerRef.current?.focus()");
    expect(manager).toContain("handleEditorMenuKeyDown");
    expect(manager).not.toContain("}, [draft, editorActionsOpen]);");
    expect(styles).toContain("container-name: residency-dayparts-workspace");
    expect(styles).toContain("container-name: residency-daypart-editor");
    expect(styles).toContain("container-name: residency-room-editor");
    expect(styles).toContain("container-name: residency-room-template-popover");
    expect(styles).toContain("@container residency-daypart-editor (max-width: 520px)");
    expect(docs).toContain("## Day Parts Implementation Profile");
    expect(docs).toContain("The Compact Collection Panel does not apply.");
    expect(audit).toContain("CR-017 — Day Parts weekly grid collapses at compact widths");
    expect(audit).toContain("CR-019 — Day Parts editors and popovers have undefined intermediate states");
  });
});
