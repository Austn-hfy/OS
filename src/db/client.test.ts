import { describe, expect, it } from "vitest";
import { classifyDatabaseConnection, databasePoolConfig } from "./client";

describe("database connection lifecycle", () => {
  it("recognizes Supavisor transaction mode without exposing connection details", () => {
    expect(classifyDatabaseConnection(
      "postgresql://postgres.project-ref:secret@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
    )).toEqual({
      hostType: "supavisor-shared",
      port: "6543",
      transactionMode: true,
      databaseRegion: "us-west-2",
      preparedStatements: false,
    });
  });

  it("does not misclassify Supavisor session mode or a direct database host", () => {
    expect(classifyDatabaseConnection(
      "postgresql://postgres.project-ref:secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres",
    ).transactionMode).toBe(false);
    expect(classifyDatabaseConnection(
      "postgresql://postgres:secret@db.project-ref.supabase.co:5432/postgres",
    ).hostType).toBe("supabase-database");
  });

  it("keeps a small concurrent pool and closes idle clients promptly", () => {
    expect(databasePoolConfig).toMatchObject({
      max: 5,
      min: 0,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
      maxLifetimeSeconds: 1_800,
      allowExitOnIdle: true,
    });
  });
});
