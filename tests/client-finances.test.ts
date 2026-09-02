import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("client Finances boundaries", () => {
  it("keeps direct talent obligations read-only and separate from HFY talent invoices", async () => {
    const [query, finances, legacyPayouts, legacyInvoices] = await Promise.all([
      readFile(new URL("../src/data/residency-client.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/finances/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/payouts/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/invoices/page.tsx", import.meta.url), "utf8"),
    ]);
    expect(query).toContain('eq(assignments.source, "client_owned")');
    expect(query).toContain("innerJoin(clientAssignmentTerms");
    expect(finances).toContain("Owed to HFY");
    expect(finances).toContain("Owed to Your Talent");
    expect(finances).toContain("hasHfyManagedTalentActivity");
    expect(finances).not.toContain("ClientRateForm");
    expect(finances).not.toContain("talentPaymentProfiles");
    expect(legacyPayouts).toContain('redirect("/residency/finances")');
    expect(legacyInvoices).toContain('redirect("/residency/finances")');
  });

  it("keeps client Daypart defaults separate from HFY talent rates", async () => {
    const [schema, manager, bookings] = await Promise.all([
      readFile(new URL("../src/db/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/services/residency-bookings.ts", import.meta.url), "utf8"),
    ]);
    expect(schema).toContain('clientDefaultRateCents: integer("client_default_rate_cents")');
    expect(schema).toContain('defaultRateCents: integer("default_rate_cents")');
    expect(manager).toContain("Default artist rate ($/hr)");
    expect(bookings).toContain("defaultRateCents: rule.clientDefaultRateCents");
    expect(bookings).toContain("defaultRateCents: shift.clientTalentDefaultRateCents ?? shift.clientDaypartDefaultRateCents");
  });
});
