import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("site-wide workspace surface consistency", () => {
  it("uses the shared frame across Developer, HFY Programming, and Residency detail routes", async () => {
    const [component, dashboard, pipeline, payouts, invoices, invoiceManager, setup, talent, roster, clientTalent, clientRoster, clientPayouts, clientInvoices, clientSettings] = await Promise.all([
      readSource("../src/components/workspace-surface.tsx"),
      readSource("../src/app/app/page.tsx"),
      readSource("../src/app/app/leads/leads-workspace.tsx"),
      readSource("../src/app/app/payouts/page.tsx"),
      readSource("../src/app/app/invoices/page.tsx"),
      readSource("../src/app/app/invoices/invoice-workspace.tsx"),
      readSource("../src/app/app/setup/page.tsx"),
      readSource("../src/app/app/talent/page.tsx"),
      readSource("../src/app/app/talent/roster/page.tsx"),
      readSource("../src/app/residency/talent/page.tsx"),
      readSource("../src/app/residency/talent/roster/page.tsx"),
      readSource("../src/app/residency/payouts/page.tsx"),
      readSource("../src/app/residency/invoices/page.tsx"),
      readSource("../src/app/residency/settings/page.tsx"),
    ]);

    expect(component).toContain("workspace-surface");
    for (const source of [dashboard, pipeline, payouts, invoices, invoiceManager, setup, talent, roster, clientTalent, clientRoster, clientPayouts, clientInvoices, clientSettings]) {
      expect(source).toContain("<WorkspaceSurface");
    }
  });

  it("keeps Calendar and Day Parts on their purpose-built integrated layouts", async () => {
    const [ownerCalendar, ownerDayparts, clientCalendar, clientDayparts] = await Promise.all([
      readSource("../src/app/app/calendar/page.tsx"),
      readSource("../src/app/app/dayparts/page.tsx"),
      readSource("../src/app/residency/calendar/page.tsx"),
      readSource("../src/app/residency/dayparts/page.tsx"),
    ]);

    for (const source of [ownerCalendar, ownerDayparts, clientCalendar, clientDayparts]) {
      expect(source).not.toContain("<WorkspaceSurface");
    }
    expect(ownerDayparts).not.toContain('<header className="page-header');
    expect(clientDayparts).not.toContain('<header className="page-header');
  });

  it("removes nested page chrome without flattening record and metric cards", async () => {
    const styles = await readSource("../src/app/hfy-style-pilot.css");
    expect(styles).toContain("Shared workspace hierarchy");
    expect(styles).toContain(".workspace-surface-talent :is(.artist-roster-panel, .artist-detail-panel)");
    expect(styles).toContain(".workspace-surface-payouts > .payout-filter-bar");
    expect(styles).toContain(".workspace-surface-pipeline > .lead-list-shell");
    expect(styles).toContain(".workspace-surface-invoices > .table-wrap");
    expect(styles).toContain(".workspace-surface-dashboard > .owner-mode-summary");
  });

  it("uses the icon-led navigation in owner modes and removes duplicate or non-actionable headings", async () => {
    const [ownerShell, workspaceNav, dashboard, dayparts, artistLookup, clientArtistLookup, styles] = await Promise.all([
      readSource("../src/components/internal-shell.tsx"),
      readSource("../src/components/workspace-nav.tsx"),
      readSource("../src/app/app/page.tsx"),
      readSource("../src/app/app/dayparts/page.tsx"),
      readSource("../src/app/app/talent/artist-lookup.tsx"),
      readSource("../src/app/residency/talent/client-artist-lookup.tsx"),
      readSource("../src/app/hfy-style-pilot.css"),
    ]);

    expect(ownerShell).toContain("WorkspaceNavLink");
    expect(ownerShell).toContain('className="sidebar owner-sidebar"');
    expect(ownerShell).toContain("WorkspaceNavIcon");
    expect(workspaceNav).toContain("residency-nav-icon");
    expect(dashboard).not.toContain("Live Dayparts");
    expect(dashboard).not.toContain('<h1>Operations</h1>');
    expect(dashboard).toContain("<h2>Active Residencies</h2>");
    expect(dayparts).not.toContain('<header className="page-header');
    expect(artistLookup).not.toContain("Find an artist");
    expect(clientArtistLookup).not.toContain("Find an artist");
    expect(styles).toContain(".workspace-surface-talent .artist-roster-toolbar-heading");
    expect(styles).toContain(".owner-sidebar .owner-workspace-nav .residency-nav-item");
  });
});
