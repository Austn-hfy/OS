import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = () => readFile(new URL("../../drizzle/0055_residency_users_self_service_billing.sql", import.meta.url), "utf8");

describe("Residency users and self-service billing migration", () => {
  it("counts pending and active users together and rejects a fifth seat", async () => {
    const sql = await source();
    expect(sql).toContain("hfy_enforce_residency_user_limit");
    expect(sql).toContain("membership.active = true");
    expect(sql).toContain("contact.invitation_status = 'invited'");
    expect(sql).toContain("IF seat_count > 4");
    expect(sql).toContain("A Residency can have at most four pending or active users.");
  });

  it("enforces the last-manager and enrolled-primary-contact invariants in Postgres", async () => {
    const sql = await source();
    expect(sql).toContain("hfy_enforce_last_residency_manager");
    expect(sql).toContain("The final manager cannot be removed or demoted.");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON \"residency_memberships\"");
    expect(sql).toContain("The primary contact must be an active enrolled user.");
    expect(sql).toContain("residency_contacts_one_active_primary");
  });

  it("stores the 14-day lifecycle fields and constrains pause choices to one, two, or three periods", async () => {
    const sql = await source();
    expect(sql).toContain('"payment_grace_ends_at"');
    expect(sql).toContain('"access_restricted_at"');
    expect(sql).toContain('"pause_periods" IS NULL OR "pause_periods" IN (1, 2, 3)');
    expect(sql).toContain("'downgrade', 'term_change', 'cancel', 'pause'");
  });
});
