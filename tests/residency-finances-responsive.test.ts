import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency Finances responsive contract", () => {
  it("adopts the shared Residency page surface without changing the two-ledger boundary", async () => {
    const page = await readSource("../src/app/residency/finances/page.tsx");

    expect(page).toContain("ResidencyPageSurface");
    expect(page).toContain("ResidencyPageBody");
    expect(page).toContain("ResidencySurfaceCard");
    expect(page.match(/<ResidencySurfaceCard className="finance-disclosure-card">/g)).toHaveLength(2);
    expect(page).not.toContain('className="finance-accordion card"');
    expect(page).not.toContain("WorkspaceSurface");
    expect(page).toContain("Owed to Your Talent");
    expect(page).toContain("Owed to HFY");
  });

  it("contains both populated financial tables in dedicated responsive regions", async () => {
    const [page, directTable, styles] = await Promise.all([
      readSource("../src/app/residency/finances/page.tsx"),
      readSource("../src/app/residency/finances/client-talent-finances.tsx"),
      readSource("../src/app/hfy-style-pilot.css"),
    ]);

    expect(page).toContain('className="table-wrap finance-table-wrap finance-table-wrap--invoice"');
    expect(page).toContain('className="finance-invoice-period"');
    expect(directTable).toContain('className="table-wrap finance-table-wrap finance-table-wrap--direct"');
    expect(page).toContain('role="region" aria-label="HFY talent invoices" tabIndex={0}');
    expect(directTable).toContain('role="region" aria-label="Direct talent obligations" tabIndex={0}');
    expect(styles).toContain("container-name: residency-finance-table");
    expect(styles).toContain("@container residency-finance-table (max-width: 860px)");
    expect(styles).toMatch(/\.finance-table-wrap \{[\s\S]*?min-width: 0;[\s\S]*?overflow-x: auto;/);
    expect(styles).toMatch(/\.finance-table--invoice \.finance-invoice-period \{[\s\S]*?display: grid;/);
    expect(styles).toMatch(/\.workspace-surface-finances \{[\s\S]*?overflow: visible;/);
  });

  it("keeps the Finances rate editor viewport-anchored and keyboard-contained without changing Talent's invocation", async () => {
    const [finances, dialog, styles] = await Promise.all([
      readSource("../src/app/residency/finances/client-talent-finances.tsx"),
      readSource("../src/app/residency/talent/client-assignment-rate-dialog.tsx"),
      readSource("../src/app/hfy-style-pilot.css"),
    ]);

    expect(finances).toContain("viewportAnchored");
    expect(dialog).toContain("createPortal(dialog, document.body)");
    expect(dialog).toContain('event.key === "Escape"');
    expect(dialog).toContain('event.key !== "Tab"');
    expect(dialog).toContain("returnFocusTarget?.focus()");
    expect(styles).toContain("container-name: finances-rate-dialog");
    expect(styles).toContain("@container finances-rate-dialog (max-width: 520px)");
    expect(styles).toContain("@container finances-rate-dialog (max-width: 420px)");
  });
});
