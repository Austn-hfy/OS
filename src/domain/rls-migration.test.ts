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

  it("keeps internal-test account metadata private and enforces one Residency for customer accounts", async () => {
    const sql = await readFile(new URL("../../drizzle/0020_supreme_dark_beast.sql", import.meta.url), "utf8");
    expect(sql).toContain('ADD COLUMN "is_internal_test"');
    expect(sql).toContain("private.enforce_single_customer_residency_membership()");
    expect(sql).toContain("Normal customer accounts may have only one active Residency membership.");
    expect(sql).toContain("private.prevent_invalid_internal_test_demotion()");
    expect(sql).not.toMatch(/GRANT[^;]+is_internal_test/);
  });

  it("requires an explicit Residency assignment for client-safe artist visibility", async () => {
    const sql = await readFile(new URL("../../drizzle/0025_explicit_residency_roster_visibility.sql", import.meta.url), "utf8");
    expect(sql).toContain('CREATE POLICY "talent_read_approved_safe_roster"');
    expect(sql).toContain("FROM public.residency_talent AS rt");
    expect(sql).toContain("rt.active = true");
    expect(sql).toContain("rt.residency_id IN (SELECT private.current_residency_ids())");
    expect(sql).toContain("validate_residency_talent_scope");
    expect(sql).toContain("validate_assignment_scope");
    expect(sql).toContain("validate_occurrence_talent_scope");
    expect(sql).not.toContain('"exclusive_residency_id" IS NULL OR "exclusive_residency_id" IN');
  });

  it("requires explicit client visibility without narrowing HFY booking eligibility", async () => {
    const sql = await readFile(new URL("../../drizzle/0032_fast_surge.sql", import.meta.url), "utf8");
    expect(sql).toContain('ADD COLUMN "client_visible" boolean DEFAULT false NOT NULL');
    expect(sql).toContain('AND "client_visible" = true');
    expect(sql).toContain("AND rt.client_visible = true");
    expect(sql).toContain("t.\"ownership\" = 'residency'");
    expect(sql).not.toContain("UPDATE \"residency_talent\" SET \"active\" = false");
  });

  it("grants clients the visibility flag referenced by the roster policies", async () => {
    const sql = await readFile(new URL("../../drizzle/0033_grant_client_visibility_policy.sql", import.meta.url), "utf8");

    expect(sql).toContain('GRANT SELECT ("client_visible") ON "residency_talent" TO authenticated');
  });
});
