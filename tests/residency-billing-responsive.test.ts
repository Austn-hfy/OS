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
    expect(page).toContain("<dt>Talent capacity</dt>");
    expect(page).toContain("<dt>House capacity</dt>");
    expect(page).toContain("<dt>Billing term</dt>");
    expect(page).toContain("<dt>Base monthly plan</dt>");
    expect(page).not.toContain("<dt>Plan dates</dt>");
    expect(page).not.toContain("<dt>Annual upfront total</dt>");
    expect(styles).toContain(".workspace-surface-platform-billing .platform-plan-facts { grid-template-columns: repeat(4, minmax(0, 1fr)); }");
    expect(styles).toContain("@container billing-plan-details (max-width: 680px)");
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
