import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency Billing intermediate widths", () => {
  it("uses an exact four-to-two-to-one fact grid and stacked compact invoice periods", async () => {
    const [page, styles, audit] = await Promise.all([
      readSource("../src/app/residency/settings/billing/page.tsx"),
      readSource("../src/app/hfy-style-pilot.css"),
      readSource("../docs/UI_UX_DESKTOP_AUDIT_CLIENT_RESIDENCY.md"),
    ]);

    expect(page).toContain('className="platform-invoice-period"');
    expect(page).toContain("dateTime={invoice.billingPeriodStart}");
    expect(page).toContain("dateTime={invoice.billingPeriodEnd}");
    expect(page).toContain('label: "Talent capacity"');
    expect(page).toContain('label: "House capacity"');
    expect(page).toContain('label: "Billing term"');
    expect(page).toContain('label: "Base monthly plan"');
    expect(page).not.toContain('label: "Plan dates"');
    expect(page).not.toContain('label: "Annual upfront total"');
    expect(styles).toContain(".residency-fact-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(styles).toContain("@container residency-fact-grid (max-width: 680px)");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(styles).toContain("@media (max-width: 700px)");
    expect(styles).toContain("grid-template-columns: 1fr;");
    expect(styles).toContain("@container billing-invoice-history (max-width: 860px)");
    expect(styles).toContain("table-layout: fixed;");
    expect(styles).toContain(".platform-invoice-period-separator { display: none; }");
    expect(audit).toContain("Billing breaks down between full desktop and mobile layouts");
    expect(audit).toContain("Responsive field-grid structure — locked sitewide rule");
  });
});
