import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Residency workspace boundaries", () => {
  it("scopes Invoice PDF downloads to the signed-in Residency and client-visible statuses", async () => {
    const source = await readFile(new URL("../src/app/residency/invoices/[invoiceId]/pdf/route.ts", import.meta.url), "utf8");
    expect(source).toContain("eq(invoices.residencyId, actor.residencyId)");
    expect(source).toContain('inArray(invoices.status, ["approved", "sent"])');
    expect(source).not.toContain("talentCost");
    expect(source).not.toContain("grossMargin");
  });

  it("defaults calendars to All Slots without restoring a stale status filter", async () => {
    const source = await readFile(new URL("../src/app/app/calendar/residency-calendar.tsx", import.meta.url), "utf8");
    expect(source).toContain('useState<StatusFilter>("all")');
    expect(source).not.toContain('getItem("hfy-calendar-status-filter")');
  });

  it("keeps Settings updates tied to the authenticated actor instead of a submitted Residency id", async () => {
    const source = await readFile(new URL("../src/app/residency/actions.ts", import.meta.url), "utf8");
    expect(source).toContain("eq(residencies.id, actor.residencyId)");
    expect(source).not.toContain('formData.get("residencyId")');
  });
});
