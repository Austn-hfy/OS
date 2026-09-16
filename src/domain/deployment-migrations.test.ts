import { describe, expect, it, vi } from "vitest";
import {
  DEPLOYMENT_MIGRATION_LOCK_ID,
  assertMigrationIsSafe,
  executeDeploymentMigration,
  inspectMigrationSafety,
  isConnectionAvailabilityError,
  migrationConnectionCandidates,
  resolveDeploymentMigrationPlan,
  runWithMigrationAdvisoryLock,
} from "./deployment-migrations";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "./staging-structure-sync";

const productionDirect = `postgresql://postgres:secret@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`;
const productionSession = `postgresql://postgres.${PRODUCTION_SUPABASE_PROJECT_REF}:secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
const stagingDirect = `postgresql://postgres:secret@db.${STAGING_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`;
const stagingSession = `postgresql://postgres.${STAGING_SUPABASE_PROJECT_REF}:secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
const stagingTransaction = `postgresql://postgres.${STAGING_SUPABASE_PROJECT_REF}:secret@aws-0-us-west-2.pooler.supabase.com:6543/postgres`;
const runtimeDatabaseUrl = `postgresql://hfy_app.${PRODUCTION_SUPABASE_PROJECT_REF}:runtime-secret@aws-0-us-west-2.pooler.supabase.com:6543/postgres`;

describe("deployment migration environment guard", () => {
  it("accepts only the production target, main branch, and production project together", () => {
    expect(resolveDeploymentMigrationPlan({
      DATABASE_URL: runtimeDatabaseUrl,
      MIGRATION_DATABASE_URL: productionDirect,
      MIGRATION_DATABASE_SESSION_URL: productionSession,
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_TARGET_ENV: "production",
    })).toEqual({
      action: "run",
      databaseUrl: productionDirect,
      expectedProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      sessionDatabaseUrl: productionSession,
      target: "production",
    });
  });

  it("accepts the preview staging branch only with the staging project", () => {
    expect(resolveDeploymentMigrationPlan({
      DATABASE_URL: runtimeDatabaseUrl,
      MIGRATION_DATABASE_URL: stagingDirect,
      MIGRATION_DATABASE_SESSION_URL: stagingSession,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    })).toMatchObject({
      action: "run",
      expectedProjectRef: STAGING_SUPABASE_PROJECT_REF,
      sessionDatabaseUrl: stagingSession,
      target: "staging",
    });
  });

  it("never reads DATABASE_URL while resolving a migration plan", () => {
    expect(resolveDeploymentMigrationPlan({
      DATABASE_URL: "not-even-a-url",
      MIGRATION_DATABASE_URL: stagingDirect,
      MIGRATION_DATABASE_SESSION_URL: stagingSession,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    })).toMatchObject({
      databaseUrl: stagingDirect,
      sessionDatabaseUrl: stagingSession,
    });
  });

  it("allows a direct-only plan but leaves no non-migration fallback", () => {
    expect(resolveDeploymentMigrationPlan({
      DATABASE_URL: runtimeDatabaseUrl,
      MIGRATION_DATABASE_URL: stagingDirect,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    })).toMatchObject({
      databaseUrl: stagingDirect,
      sessionDatabaseUrl: null,
    });
  });

  it("also accepts a named staging target when it remains a preview deployment", () => {
    expect(resolveDeploymentMigrationPlan({
      MIGRATION_DATABASE_URL: stagingDirect,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "staging",
    })).toMatchObject({ action: "run", target: "staging" });
  });

  it.each([
    ["production branch mismatch", {
      MIGRATION_DATABASE_URL: productionDirect,
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "production",
    }],
    ["production project mismatch", {
      MIGRATION_DATABASE_URL: stagingDirect,
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_TARGET_ENV: "production",
    }],
    ["staging environment mismatch", {
      MIGRATION_DATABASE_URL: stagingDirect,
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    }],
    ["staging project mismatch", {
      MIGRATION_DATABASE_URL: productionDirect,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    }],
    ["cross-project migration session fallback", {
      MIGRATION_DATABASE_URL: stagingDirect,
      MIGRATION_DATABASE_SESSION_URL: productionSession,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    }],
    ["missing credential", {
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    }],
    ["malformed credential", {
      MIGRATION_DATABASE_URL: "not-a-url",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    }],
    ["malformed migration session credential", {
      MIGRATION_DATABASE_URL: stagingDirect,
      MIGRATION_DATABASE_SESSION_URL: "not-a-url",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    }],
    ["transaction-mode migration session credential", {
      MIGRATION_DATABASE_URL: stagingDirect,
      MIGRATION_DATABASE_SESSION_URL: stagingTransaction,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    }],
    ["different migration session role", {
      MIGRATION_DATABASE_URL: stagingDirect,
      MIGRATION_DATABASE_SESSION_URL: stagingSession.replace("postgres.", "hfy_app."),
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    }],
    ["different migration session password", {
      MIGRATION_DATABASE_URL: stagingDirect,
      MIGRATION_DATABASE_SESSION_URL: stagingSession.replace(":secret@", ":other-secret@"),
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    }],
    ["ambiguous environment", {
      MIGRATION_DATABASE_URL: stagingDirect,
      VERCEL_ENV: "",
      VERCEL_GIT_COMMIT_REF: "",
      VERCEL_TARGET_ENV: "",
    }],
  ])("rejects %s before invoking the connector", async (_name, environment) => {
    const connector = vi.fn();
    await expect(executeDeploymentMigration(environment, connector)).rejects.toThrow(/deployment guard rejected/i);
    expect(connector).not.toHaveBeenCalled();
  });

  it("skips every other Preview branch without invoking the connector", async () => {
    const connector = vi.fn();
    await expect(executeDeploymentMigration({
      MIGRATION_DATABASE_URL: productionDirect,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature/example",
      VERCEL_TARGET_ENV: "preview",
    }, connector)).resolves.toEqual({
      action: "skip",
      reason: "Preview branch feature/example is not the isolated staging branch.",
    });
    expect(connector).not.toHaveBeenCalled();
  });

  it("skips non-staging Preview branches in custom targets without invoking the connector", async () => {
    const connector = vi.fn();
    await expect(executeDeploymentMigration({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature/custom-preview",
      VERCEL_TARGET_ENV: "qa",
    }, connector)).resolves.toMatchObject({ action: "skip" });
    expect(connector).not.toHaveBeenCalled();
  });

  it("invokes the connector only after a valid deployment plan is resolved", async () => {
    const connector = vi.fn().mockResolvedValue("migrated");
    await expect(executeDeploymentMigration({
      MIGRATION_DATABASE_URL: stagingDirect,
      MIGRATION_DATABASE_SESSION_URL: stagingSession,
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_TARGET_ENV: "preview",
    }, connector)).resolves.toEqual({ action: "run", result: "migrated" });
    expect(connector).toHaveBeenCalledOnce();
  });
});

describe("migration connection selection", () => {
  it("prefers direct Postgres and uses only the explicit same-role migration session fallback", () => {
    const candidates = migrationConnectionCandidates(stagingDirect, stagingSession);
    expect(candidates.map(({ mode }) => mode)).toEqual(["direct", "session-pooler"]);
    expect(candidates[1]!.databaseUrl).toBe(stagingSession);
    expect(new URL(candidates[1]!.databaseUrl).port).toBe("5432");
  });

  it("has no fallback when the dedicated migration session credential is absent", () => {
    const candidates = migrationConnectionCandidates(stagingDirect, null);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.mode).toBe("direct");
  });

  it.each([
    ["transaction-mode primary", stagingTransaction, null, /MIGRATION_DATABASE_URL must use the Supabase direct endpoint/],
    ["transaction-mode fallback", stagingDirect, stagingTransaction, /shared session pooler on port 5432/],
    ["cross-project fallback", stagingDirect, productionSession, /same Supabase project/],
    ["different-role fallback", stagingDirect, stagingSession.replace("postgres.", "hfy_app."), /same Postgres role/],
    ["different-password fallback", stagingDirect, stagingSession.replace(":secret@", ":other@"), /same dedicated migration credential/],
    ["different-database fallback", stagingDirect, stagingSession.replace(/\/postgres$/, "/template1"), /same database/],
  ])("rejects %s", (_name, direct, session, message) => {
    expect(() => migrationConnectionCandidates(direct, session)).toThrow(message);
  });

  it("recognizes only network availability failures as eligible for fallback", () => {
    expect(isConnectionAvailabilityError(Object.assign(new Error("unreachable"), { code: "ENETUNREACH" }))).toBe(true);
    expect(isConnectionAvailabilityError(new Error("authentication failed"))).toBe(false);
  });
});

describe("destructive migration guard", () => {
  it.each([
    ["DROP COLUMN", "alter table invoices drop column legacy_total;"],
    ["DROP TABLE", "drop table if exists old_invoices;"],
    ["ALTER COLUMN TYPE", "alter table invoices alter column total type integer using total::integer;"],
    ["RENAME COLUMN", "alter table invoices rename column total to amount;"],
    ["RENAME TABLE", "alter table invoices rename to archived_invoices;"],
    ["TRUNCATE", "truncate table invoices;"],
  ])("blocks %s and names the offending statement", (operation, source) => {
    expect(() => assertMigrationIsSafe("0052_unsafe.sql", source)).toThrow(
      new RegExp(`0052_unsafe\\.sql.*${operation}.*${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
    );
  });

  it("permits destructive SQL only with the explicit marker and reports the operation", () => {
    expect(assertMigrationIsSafe("0052_reviewed.sql", "-- ALLOW-DESTRUCTIVE\nDROP TABLE old_invoices;")).toEqual({
      explicitlyAllowed: true,
      findings: [{ operation: "DROP TABLE", statement: "-- ALLOW-DESTRUCTIVE DROP TABLE old_invoices;" }],
    });
  });

  it("does not accept marker-like text inside SQL strings, dollar-quoted bodies, or longer comments", () => {
    for (const markerImitation of [
      "select '-- ALLOW-DESTRUCTIVE';",
      "do $$ begin raise notice '-- ALLOW-DESTRUCTIVE'; end $$;",
      "-- ALLOW-DESTRUCTIVE after additional text",
    ]) {
      expect(() => assertMigrationIsSafe("0052_unsafe.sql", `${markerImitation}\nDROP TABLE old_invoices;`)).toThrow(
        /Destructive migration blocked/,
      );
    }
  });

  it("does not treat ordinary additions, comments, or string literals as destructive", () => {
    const result = inspectMigrationSafety(`
      -- DROP TABLE is documentation, not SQL.
      alter table invoices add column note text default 'DROP COLUMN';
      create table safe_copy (id bigint primary key);
    `);
    expect(result).toEqual({ explicitlyAllowed: false, findings: [] });
  });
});

describe("migration advisory lock", () => {
  it("makes a contending migration wait until the first transaction releases the lock", async () => {
    let locked = false;
    const waiters: Array<() => void> = [];
    const queries: string[] = [];
    const acquire = async () => {
      if (locked) await new Promise<void>((resolve) => waiters.push(resolve));
      locked = true;
      return () => {
        locked = false;
        waiters.shift()?.();
      };
    };
    const client = {
      async reserve() {
        let releaseLock: () => void = () => {};
        return {
          async unsafe(query: string) {
            queries.push(query);
            if (query.includes("pg_advisory_lock")) {
              releaseLock = await acquire();
            }
            if (query.includes("pg_advisory_unlock")) releaseLock();
            return [];
          },
          release() {},
        };
      },
    };

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const order: string[] = [];
    const first = runWithMigrationAdvisoryLock(client, async () => {
      order.push("first-entered");
      await firstGate;
      order.push("first-leaving");
    });
    await vi.waitFor(() => expect(order).toContain("first-entered"));

    const second = runWithMigrationAdvisoryLock(client, async () => {
      order.push("second-entered");
    });
    await Promise.resolve();
    expect(order).not.toContain("second-entered");

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-entered", "first-leaving", "second-entered"]);
    expect(queries.filter((query) => query.includes(`pg_advisory_lock(${DEPLOYMENT_MIGRATION_LOCK_ID})`))).toHaveLength(2);
    expect(queries.filter((query) => query.includes(`pg_advisory_unlock(${DEPLOYMENT_MIGRATION_LOCK_ID})`))).toHaveLength(2);
  });
});
