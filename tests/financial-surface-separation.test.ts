import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("financial surface separation", () => {
  it("puts Platform billing only in Settings and talent obligations only in Finances", async () => {
    const [billingPage, financesPage, data] = await Promise.all([
      readSource("../src/app/residency/settings/billing/page.tsx"),
      readSource("../src/app/residency/finances/page.tsx"),
      readSource("../src/data/residency-client.ts"),
    ]);
    expect(billingPage).toContain("Platform subscription");
    expect(billingPage).not.toContain("Owed to HFY");
    expect(financesPage).toContain("Owed to HFY");
    expect(financesPage).toContain("Owed to Your Talent");
    expect(financesPage).not.toContain("platformSubscriptions");
    const platformQuery = data.slice(data.indexOf("export async function getResidencyPlatformBilling"), data.indexOf("export async function getResidencyClientSettings"));
    expect(platformQuery).toContain("platformSubscriptions");
    expect(platformQuery).not.toContain("talentInvoiceAdjustments");
    expect(platformQuery).not.toContain("clientAssignmentTerms");
  });

  it("keeps financial data off the Developer Residency directory and HFY on talent receivables and payouts", async () => {
    const [dashboard, shell, invoicePage, internalData] = await Promise.all([
      readSource("../src/app/app/page.tsx"),
      readSource("../src/components/internal-shell.tsx"),
      readSource("../src/app/app/invoices/page.tsx"),
      readSource("../src/data/internal.ts"),
    ]);
    expect(dashboard).not.toContain("Committed Plans");
    expect(dashboard).not.toContain("Platform revenue only");
    expect(dashboard).not.toContain("getPlatformRevenueDashboard");
    expect(shell).not.toContain('label: "Committed Plans"');
    expect(shell).toContain('label: "Owed to Us"');
    expect(shell).toContain('label: "Payouts"');
    expect(invoicePage).toContain("HFY Talent Invoices");
    const platformQuery = internalData.slice(internalData.indexOf("export async function getPlatformRevenueDashboard"), internalData.indexOf("export async function getBilledByHfyWorkQueue"));
    expect(platformQuery).toContain("platformSubscriptions");
    expect(platformQuery).not.toContain("invoices.");
    expect(platformQuery).not.toContain("assignments.");
  });

  it("keeps Platform subscription and talent invoice records structurally separate", async () => {
    const [schema, migration] = await Promise.all([
      readSource("../src/db/schema.ts"),
      readSource("../drizzle/0031_dazzling_jack_power.sql"),
    ]);
    expect(schema).toContain('pgTable("platform_subscriptions"');
    expect(schema).toContain('pgTable("platform_subscription_invoices"');
    expect(schema).toContain('pgTable("invoices"');
    expect(migration).toContain('REVOKE ALL ON TABLE "platform_subscriptions"');
    expect(migration).toContain('ALTER TABLE "talent_invoice_adjustments" ENABLE ROW LEVEL SECURITY');
  });
});
