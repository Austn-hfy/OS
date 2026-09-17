import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("Residency Billing intermediate widths", () => {
  it("uses container-responsive plan facts and stacked compact invoice periods", async () => {
    const [page, styles, audit] = await Promise.all([
      readSource("../src/app/residency/settings/billing/page.tsx"),
      readSource("../src/app/hfy-style-pilot.css"),
      readSource("../docs/UI_UX_DESKTOP_AUDIT_CLIENT_RESIDENCY.md"),
    ]);

    expect(page).toContain('className="platform-invoice-period"');
    expect(page).toContain("dateTime={invoice.billingPeriodStart}");
    expect(page).toContain("dateTime={invoice.billingPeriodEnd}");
    expect(styles).toContain("@container billing-plan-details (max-width: 900px)");
    expect(styles).toContain("@container billing-invoice-history (max-width: 860px)");
    expect(styles).toContain("table-layout: fixed;");
    expect(styles).toContain(".platform-invoice-period-separator { display: none; }");
    expect(audit).toContain("Billing breaks down between full desktop and mobile layouts");
  });
});
