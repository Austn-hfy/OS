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

  it("keeps the client-safe roster in the shared Residency calendar assignment path", async () => {
    const source = await readFile(new URL("../src/app/residency/calendar/page.tsx", import.meta.url), "utf8");
    expect(source).toContain("getResidencyClientSafeRoster(actor.residencyId)");
    expect(source).toContain("talent={roster.map");
  });

  it("keeps company modes out of Residency workspaces and Dayparts out of Setup", async () => {
    const [shell, setup] = await Promise.all([
      readFile(new URL("../src/components/internal-shell.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/app/setup/page.tsx", import.meta.url), "utf8"),
    ]);
    expect(shell).toContain("{!inResidency ? <div className=\"mode-switch\"");
    expect(setup).not.toContain("DaypartManager");
    expect(setup).not.toContain("standing hours");
  });
});
