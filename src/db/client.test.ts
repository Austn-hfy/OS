import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: { kind: "database" },
  sqlClient: { kind: "sql-client" },
  drizzle: vi.fn(),
  postgres: vi.fn(),
}));

vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: mocks.drizzle }));

type DatabaseGlobals = typeof globalThis & {
  hfyDb?: unknown;
  hfySql?: unknown;
};

const databaseGlobals = globalThis as DatabaseGlobals;
const originalDatabaseUrl = process.env.DATABASE_URL;

describe("database client lifecycle", () => {
  beforeEach(() => {
    delete databaseGlobals.hfyDb;
    delete databaseGlobals.hfySql;
    process.env.DATABASE_URL = "postgresql://example.test/hfy";
    mocks.postgres.mockReset().mockReturnValue(mocks.sqlClient);
    mocks.drizzle.mockReset().mockReturnValue(mocks.database);
    vi.resetModules();
  });

  afterEach(() => {
    delete databaseGlobals.hfyDb;
    delete databaseGlobals.hfySql;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("reuses one client and database wrapper across warm module evaluations", async () => {
    const firstModule = await import("./client");
    const first = firstModule.getDb();
    const second = firstModule.getDb();

    vi.resetModules();
    const reloadedModule = await import("./client");
    const third = reloadedModule.getDb();

    expect(first).toBe(mocks.database);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(mocks.postgres).toHaveBeenCalledTimes(1);
    expect(mocks.postgres).toHaveBeenCalledWith("postgresql://example.test/hfy", {
      prepare: false,
      max: 2,
    });
    expect(mocks.drizzle).toHaveBeenCalledTimes(1);
  });
});
