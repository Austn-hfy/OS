import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = (name: string) => readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8");

describe("Shift change request migrations", () => {
  it("keeps direct client access read-and-create only", async () => {
    const sql = await migration("0043_shift_change_requests.sql");

    expect(sql).toContain("GRANT SELECT ON TABLE \"shift_change_requests\" TO authenticated");
    expect(sql).toContain("GRANT INSERT (");
    expect(sql).toContain("private.current_managed_residency_ids()");
    expect(sql).toContain("private.current_user_is_internal_admin()");
    expect(sql).not.toMatch(/GRANT\s+(UPDATE|DELETE)/);
  });

  it("enforces one valid pending request per Shift and audits both lifecycle events", async () => {
    const [base, uniqueness] = await Promise.all([
      migration("0043_shift_change_requests.sql"),
      migration("0044_shift_change_request_pending_unique.sql"),
    ]);

    expect(base).toContain("shift_change_request_created");
    expect(base).toContain("shift_change_request_resolved");
    expect(base).toContain("shift_change_requests_proposed_time_valid");
    expect(base).toContain("shift_change_requests_resolution_valid");
    expect(uniqueness).toContain("shift_change_requests_one_pending_per_shift_unique");
    expect(uniqueness).toContain("WHERE \"status\" = 'pending'");
  });

  it("preserves approved cancellation history after the underlying Shift is removed", async () => {
    const sql = await migration("0045_preserve_resolved_shift_requests.sql");

    expect(sql).toContain("ALTER COLUMN \"shift_id\" DROP NOT NULL");
    expect(sql).toContain("ON DELETE set null");
    expect(sql).toContain("shift_change_requests_pending_shift_required");
    expect(sql).toContain("IF NEW.status = 'pending'");
  });
});
