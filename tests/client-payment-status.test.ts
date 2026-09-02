import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("client Payment Status boundaries", () => {
  it("queries and displays only client-owned assignments", async () => {
    const [query, page] = await Promise.all([
      readFile(new URL("../src/data/residency-client.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/payouts/page.tsx", import.meta.url), "utf8"),
    ]);
    expect(query).toContain('eq(assignments.source, "client_owned")');
    expect(query).toContain("innerJoin(clientAssignmentTerms");
    expect(page).not.toContain("HFY-provided artists");
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
    expect(bookings).toContain("defaultRateCents: shift.clientDaypartDefaultRateCents");
  });
});
