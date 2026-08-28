import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Ace Residency RLS migration", () => {
  it("installs membership-scoped policies and withholds sensitive Data API grants", async () => {
    const sql = await readFile(new URL("../../drizzle/0019_sudden_lucky_pierre.sql", import.meta.url), "utf8");
    expect(sql).toContain("private.current_residency_ids()");
    expect(sql).toContain('CREATE POLICY "residencies_read_membership"');
    expect(sql).toContain('CREATE POLICY "dayparts_read_membership"');
    expect(sql).toContain('CREATE POLICY "assignments_read_membership"');
    expect(sql).toContain('REVOKE ALL ON TABLE "users"');
    expect(sql).not.toMatch(/GRANT SELECT[^;]+talent_payment_profiles/);
    expect(sql).not.toMatch(/GRANT SELECT[^;]+invoices/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)/);
  });
});
