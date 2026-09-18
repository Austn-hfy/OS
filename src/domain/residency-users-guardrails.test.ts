import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

let database: PGlite;
const residencyId = "00000000-0000-4000-8000-000000000001";
const ids = Array.from({ length: 8 }, (_, index) => `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`);

beforeAll(async () => {
  database = await PGlite.create();
  await database.exec(`
    CREATE TABLE residencies (id uuid PRIMARY KEY);
    CREATE TABLE residency_memberships (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      residency_id uuid NOT NULL REFERENCES residencies(id) ON DELETE CASCADE,
      access_role text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE residency_contacts (
      id uuid PRIMARY KEY,
      residency_id uuid NOT NULL REFERENCES residencies(id) ON DELETE CASCADE,
      user_id uuid,
      invitation_status text NOT NULL,
      access_role text,
      active boolean NOT NULL DEFAULT true,
      is_primary boolean NOT NULL DEFAULT false
    );
  `);
  await database.exec(`INSERT INTO residencies (id) VALUES ('${residencyId}')`);
  const migration = await readFile(new URL("../../drizzle/0055_residency_users_self_service_billing.sql", import.meta.url), "utf8");
  await database.exec(migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION "hfy_enforce_residency_user_limit"')));
});

afterAll(async () => database.close());

describe("Residency user database guardrails", () => {
  it("rejects a fifth occupied seat when pending and active users are counted together", async () => {
    await database.exec(`INSERT INTO residency_memberships (id, user_id, residency_id, access_role) VALUES ('${ids[0]}', '${ids[1]}', '${residencyId}', 'manager')`);
    for (let index = 2; index < 5; index += 1) {
      await database.exec(`INSERT INTO residency_contacts (id, residency_id, invitation_status) VALUES ('${ids[index]}', '${residencyId}', 'invited')`);
    }
    await expect(database.exec(`INSERT INTO residency_contacts (id, residency_id, invitation_status) VALUES ('${ids[5]}', '${residencyId}', 'invited')`))
      .rejects.toThrow("at most four pending or active users");
  });

  it("rejects removal or demotion of the final active manager", async () => {
    await expect(database.exec(`UPDATE residency_memberships SET access_role = 'calendar_viewer' WHERE id = '${ids[0]}'`))
      .rejects.toThrow("final manager cannot be removed or demoted");
    await expect(database.exec(`DELETE FROM residency_memberships WHERE id = '${ids[0]}'`))
      .rejects.toThrow("final manager cannot be removed or demoted");
  });

  it("allows manager changes once another active manager exists", async () => {
    await database.exec(`DELETE FROM residency_contacts WHERE id IN ('${ids[2]}', '${ids[3]}', '${ids[4]}')`);
    await database.exec(`INSERT INTO residency_memberships (id, user_id, residency_id, access_role) VALUES ('${ids[6]}', '${ids[7]}', '${residencyId}', 'manager')`);
    await expect(database.exec(`UPDATE residency_memberships SET access_role = 'calendar_viewer' WHERE id = '${ids[0]}'`)).resolves.toBeDefined();
  });

  it("does not block an intentional parent Residency cascade", async () => {
    await expect(database.exec(`DELETE FROM residencies WHERE id = '${residencyId}'`)).resolves.toBeDefined();
  });
});
