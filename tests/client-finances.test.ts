import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("client Finances boundaries", () => {
  it("keeps direct talent obligations separate from HFY talent invoices and puts them first", async () => {
    const [query, finances, clientTalentFinances, legacyPayouts, legacyInvoices] = await Promise.all([
      readFile(new URL("../src/data/residency-client.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/finances/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/finances/client-talent-finances.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/payouts/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/invoices/page.tsx", import.meta.url), "utf8"),
    ]);
    expect(query).toContain('eq(assignments.source, "client_owned")');
    expect(query).toContain("innerJoin(clientAssignmentTerms");
    expect(finances).toContain("Owed to HFY");
    expect(finances).toContain("Owed to Your Talent");
    expect(finances.indexOf("Owed to Your Talent")).toBeLessThan(finances.indexOf("Owed to HFY"));
    expect(finances).toContain("hasHfyManagedTalentActivity");
    expect(finances).toContain("<ClientTalentFinances");
    expect(clientTalentFinances).toContain('className="finance-rate-needed-button"');
    expect(clientTalentFinances).toContain("setSelectedAssignmentId(row.id)");
    expect(clientTalentFinances).toContain("ClientAssignmentRateDialog");
    expect(clientTalentFinances).toContain("RateNeededWarning");
    expect(finances).not.toContain("ClientRateForm");
    expect(finances).not.toContain("talentPaymentProfiles");
    expect(legacyPayouts).toContain('redirect("/residency/finances")');
    expect(legacyInvoices).toContain('redirect("/residency/finances")');
  });

  it("reuses the Residency-scoped client Assignment rate action from Finances", async () => {
    const [dialog, actions] = await Promise.all([
      readFile(new URL("../src/app/residency/talent/client-assignment-rate-dialog.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8"),
    ]);
    expect(dialog).toContain("updateClientOwnedRateAction");
    expect(dialog).toContain('name="assignmentId" value={assignment.id}');
    expect(dialog).toContain("Save rate");
    expect(actions).toContain("eq(shifts.residencyId, actor.residencyId)");
    expect(actions).toContain("eq(clientAssignmentTerms.residencyId, actor.residencyId)");
    expect(actions).toContain('revalidatePath("/residency/finances")');
  });

  it("keeps client Daypart defaults separate from HFY talent rates", async () => {
    const [schema, manager, bookings] = await Promise.all([
      readFile(new URL("../src/db/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/setup/daypart-manager.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/services/residency-bookings.ts", import.meta.url), "utf8"),
    ]);
    expect(schema).toContain('clientDefaultRateCents: integer("client_default_rate_cents")');
    expect(schema).toContain('defaultRateCents: integer("default_rate_cents")');
    expect(manager).toContain('const draftRateLabel = showHfyRate ? "Default talent rate" : "Default artist rate"');
    expect(manager).toContain("{draftRateLabel} ($/hr)");
    expect(bookings).toContain("defaultRateCents: rule.clientDefaultRateCents");
    expect(bookings).toContain("defaultRateCents: shift.clientTalentDefaultRateCents ?? shift.clientDaypartDefaultRateCents");
  });
});
