import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  supabaseProjectRefFromDatabaseUrl,
} from "./staging-structure-sync";

export const DEPLOYMENT_MIGRATION_LOCK_ID = 2_026_091_501;
export const DEPLOYMENT_MIGRATION_LOCK_TIMEOUT_MS = 60_000;

type DeploymentMigrationEnvironment = {
  [key: string]: string | undefined;
  MIGRATION_DATABASE_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERCEL_TARGET_ENV?: string;
};

export type DeploymentMigrationTarget = "production" | "staging";

export type DeploymentMigrationPlan =
  | {
      action: "skip";
      reason: string;
    }
  | {
      action: "run";
      databaseUrl: string;
      expectedProjectRef: string;
      sessionDatabaseUrl: string;
      target: DeploymentMigrationTarget;
    };

export type MigrationConnectionMode = "direct" | "session-pooler";

export type MigrationConnectionCandidate = {
  databaseUrl: string;
  mode: MigrationConnectionMode;
};

const SESSION_POOLER_HOST_BY_PROJECT_REF: Readonly<Record<string, string>> = {
  [PRODUCTION_SUPABASE_PROJECT_REF]: "aws-0-us-west-2.pooler.supabase.com",
  [STAGING_SUPABASE_PROJECT_REF]: "aws-0-us-west-2.pooler.supabase.com",
};

export type DestructiveMigrationFinding = {
  operation:
    | "ALTER COLUMN TYPE"
    | "DROP COLUMN"
    | "DROP TABLE"
    | "RENAME COLUMN"
    | "RENAME TABLE"
    | "TRUNCATE";
  statement: string;
};

export type MigrationSafetyResult = {
  explicitlyAllowed: boolean;
  findings: DestructiveMigrationFinding[];
};

type AdvisoryLockTransaction = {
  release: () => void;
  unsafe: (query: string) => Promise<unknown>;
};

export type AdvisoryLockClient<TTransaction extends AdvisoryLockTransaction> = {
  reserve: () => Promise<TTransaction>;
};

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function invalidDeploymentEnvironment(message: string): never {
  throw new Error(`Database migration deployment guard rejected this deployment: ${message}`);
}

function assertMigrationProject(
  databaseUrl: string | undefined,
  variableName: "MIGRATION_DATABASE_URL",
  expectedProjectRef: string,
  target: DeploymentMigrationTarget,
  expectedMode: MigrationConnectionMode,
): string {
  if (!databaseUrl) {
    return invalidDeploymentEnvironment(`${variableName} is missing for ${target}.`);
  }

  const projectRef = supabaseProjectRefFromDatabaseUrl(databaseUrl);
  if (!projectRef) {
    return invalidDeploymentEnvironment(`${variableName} is malformed or is not a recognized Supabase connection for ${target}.`);
  }
  if (projectRef !== expectedProjectRef) {
    return invalidDeploymentEnvironment(
      `${variableName} resolves to Supabase project ${projectRef}, not the approved ${target} project ${expectedProjectRef}.`,
    );
  }
  if (connectionMode(databaseUrl) !== expectedMode) {
    return invalidDeploymentEnvironment(
      `${variableName} must use the Supabase ${expectedMode === "direct" ? "direct endpoint" : "shared session pooler on port 5432"} for ${target}.`,
    );
  }

  return databaseUrl;
}

export function resolveDeploymentMigrationPlan(
  environment: DeploymentMigrationEnvironment,
): DeploymentMigrationPlan {
  const vercelEnvironment = normalized(environment.VERCEL_ENV);
  const targetEnvironment = normalized(environment.VERCEL_TARGET_ENV);
  const branch = environment.VERCEL_GIT_COMMIT_REF?.trim() ?? "";

  if (vercelEnvironment === "production" || targetEnvironment === "production" || branch === "main") {
    if (vercelEnvironment !== "production" || targetEnvironment !== "production" || branch !== "main") {
      return invalidDeploymentEnvironment(
        `production requires VERCEL_ENV=production, VERCEL_TARGET_ENV=production, and VERCEL_GIT_COMMIT_REF=main; received ${vercelEnvironment || "<missing>"}/${targetEnvironment || "<missing>"}/${branch || "<missing>"}.`,
      );
    }

    const expectedProjectRef = PRODUCTION_SUPABASE_PROJECT_REF;
    const databaseUrl = assertMigrationProject(
      environment.MIGRATION_DATABASE_URL,
      "MIGRATION_DATABASE_URL",
      expectedProjectRef,
      "production",
      "direct",
    );
    const sessionDatabaseUrl = migrationSessionDatabaseUrl(databaseUrl);
    return {
      action: "run",
      databaseUrl,
      expectedProjectRef,
      sessionDatabaseUrl,
      target: "production",
    };
  }

  if (branch === "staging" || targetEnvironment === "staging") {
    if (
      vercelEnvironment !== "preview"
      || (targetEnvironment !== "preview" && targetEnvironment !== "staging")
      || branch !== "staging"
    ) {
      return invalidDeploymentEnvironment(
        `staging requires VERCEL_ENV=preview, a preview/staging target, and VERCEL_GIT_COMMIT_REF=staging; received ${vercelEnvironment || "<missing>"}/${targetEnvironment || "<missing>"}/${branch || "<missing>"}.`,
      );
    }

    const expectedProjectRef = STAGING_SUPABASE_PROJECT_REF;
    const databaseUrl = assertMigrationProject(
      environment.MIGRATION_DATABASE_URL,
      "MIGRATION_DATABASE_URL",
      expectedProjectRef,
      "staging",
      "direct",
    );
    const sessionDatabaseUrl = migrationSessionDatabaseUrl(databaseUrl);
    return {
      action: "run",
      databaseUrl,
      expectedProjectRef,
      sessionDatabaseUrl,
      target: "staging",
    };
  }

  if (vercelEnvironment === "preview" && branch) {
    return {
      action: "skip",
      reason: `Preview branch ${branch} is not the isolated staging branch.`,
    };
  }

  return invalidDeploymentEnvironment(
    `the environment is ambiguous; received ${vercelEnvironment || "<missing>"}/${targetEnvironment || "<missing>"}/${branch || "<missing>"}.`,
  );
}

export async function executeDeploymentMigration<T>(
  environment: DeploymentMigrationEnvironment,
  migrate: (plan: Extract<DeploymentMigrationPlan, { action: "run" }>) => Promise<T>,
): Promise<{ action: "run"; result: T } | { action: "skip"; reason: string }> {
  const plan = resolveDeploymentMigrationPlan(environment);
  if (plan.action === "skip") return plan;
  return { action: "run", result: await migrate(plan) };
}

function connectionMode(databaseUrl: string): "direct" | "session-pooler" | "transaction-pooler" | "unknown" {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return "unknown";
  }

  const port = parsed.port || "5432";
  if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(parsed.hostname) && port === "5432") return "direct";
  if (/\.pooler\.supabase\.com$/i.test(parsed.hostname) && port === "5432") return "session-pooler";
  if (port === "6543") return "transaction-pooler";
  return "unknown";
}

function decodedUrlComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function directDatabaseRole(databaseUrl: string) {
  return decodedUrlComponent(new URL(databaseUrl).username);
}

export function migrationSessionDatabaseUrl(migrationDatabaseUrl: string): string {
  if (connectionMode(migrationDatabaseUrl) !== "direct") {
    throw new Error("MIGRATION_DATABASE_URL must use the Supabase direct endpoint on port 5432.");
  }

  const projectRef = supabaseProjectRefFromDatabaseUrl(migrationDatabaseUrl);
  const poolerHost = projectRef ? SESSION_POOLER_HOST_BY_PROJECT_REF[projectRef] : undefined;
  if (!projectRef || !poolerHost) {
    throw new Error("MIGRATION_DATABASE_URL does not have an allowlisted session-pooler host.");
  }

  const sessionUrl = new URL(migrationDatabaseUrl);
  const role = directDatabaseRole(migrationDatabaseUrl);
  if (!role) throw new Error("MIGRATION_DATABASE_URL must include a Postgres role.");

  sessionUrl.hostname = poolerHost;
  sessionUrl.port = "5432";
  sessionUrl.username = `${role}.${projectRef}`;
  return sessionUrl.toString();
}

export function migrationConnectionCandidates(
  migrationDatabaseUrl: string,
): MigrationConnectionCandidate[] {
  const sessionDatabaseUrl = migrationSessionDatabaseUrl(migrationDatabaseUrl);
  return [
    { databaseUrl: migrationDatabaseUrl, mode: "direct" },
    { databaseUrl: sessionDatabaseUrl, mode: "session-pooler" },
  ];
}

export function isConnectionAvailabilityError(error: unknown): boolean {
  const codes = new Set(["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ENOTFOUND", "ETIMEDOUT"]);
  let current: unknown = error;
  while (current instanceof Error) {
    const code = (current as Error & { code?: string }).code;
    if (code && codes.has(code)) return true;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return false;
}

function sqlStatements(source: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let index = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockCommentDepth = 0;
  let dollarQuote: string | null = null;

  while (index < source.length) {
    const current = source[index]!;
    const next = source[index + 1];

    if (lineComment) {
      if (current === "\n") lineComment = false;
      index += 1;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (current === "/" && next === "*") {
        blockCommentDepth += 1;
        index += 2;
      } else if (current === "*" && next === "/") {
        blockCommentDepth -= 1;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (dollarQuote) {
      if (source.startsWith(dollarQuote, index)) {
        index += dollarQuote.length;
        dollarQuote = null;
      } else {
        index += 1;
      }
      continue;
    }
    if (singleQuoted) {
      if (current === "'" && next === "'") index += 2;
      else if (current === "'") {
        singleQuoted = false;
        index += 1;
      } else index += 1;
      continue;
    }
    if (doubleQuoted) {
      if (current === '"' && next === '"') index += 2;
      else if (current === '"') {
        doubleQuoted = false;
        index += 1;
      } else index += 1;
      continue;
    }

    if (current === "-" && next === "-") {
      lineComment = true;
      index += 2;
      continue;
    }
    if (current === "/" && next === "*") {
      blockCommentDepth = 1;
      index += 2;
      continue;
    }
    if (current === "'") {
      singleQuoted = true;
      index += 1;
      continue;
    }
    if (current === '"') {
      doubleQuoted = true;
      index += 1;
      continue;
    }
    if (current === "$") {
      const match = source.slice(index).match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$|^\$\$/);
      if (match) {
        dollarQuote = match[0];
        index += dollarQuote.length;
        continue;
      }
    }
    if (current === ";") {
      const statement = source.slice(start, index + 1).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
    index += 1;
  }

  const remainder = source.slice(start).trim();
  if (remainder) statements.push(remainder);
  return statements;
}

function statementForMatching(statement: string) {
  return statement
    .replace(/--[^\n]*(?:\n|$)/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/\s+/g, " ")
    .trim();
}

function printableStatement(statement: string) {
  const compact = statement.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function hasAllowDestructiveMarker(source: string) {
  let index = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let blockCommentDepth = 0;
  let dollarQuote: string | null = null;

  while (index < source.length) {
    const current = source[index]!;
    const next = source[index + 1];

    if (blockCommentDepth > 0) {
      if (current === "/" && next === "*") {
        blockCommentDepth += 1;
        index += 2;
      } else if (current === "*" && next === "/") {
        blockCommentDepth -= 1;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (dollarQuote) {
      if (source.startsWith(dollarQuote, index)) {
        index += dollarQuote.length;
        dollarQuote = null;
      } else {
        index += 1;
      }
      continue;
    }
    if (singleQuoted) {
      if (current === "'" && next === "'") index += 2;
      else if (current === "'") {
        singleQuoted = false;
        index += 1;
      } else index += 1;
      continue;
    }
    if (doubleQuoted) {
      if (current === '"' && next === '"') index += 2;
      else if (current === '"') {
        doubleQuoted = false;
        index += 1;
      } else index += 1;
      continue;
    }

    if (current === "-" && next === "-") {
      const end = source.indexOf("\n", index + 2);
      const comment = source.slice(index + 2, end === -1 ? source.length : end).trim();
      if (comment === "ALLOW-DESTRUCTIVE") return true;
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (current === "/" && next === "*") {
      blockCommentDepth = 1;
      index += 2;
      continue;
    }
    if (current === "'") {
      singleQuoted = true;
      index += 1;
      continue;
    }
    if (current === '"') {
      doubleQuoted = true;
      index += 1;
      continue;
    }
    if (current === "$") {
      const match = source.slice(index).match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$|^\$\$/);
      if (match) {
        dollarQuote = match[0];
        index += dollarQuote.length;
        continue;
      }
    }
    index += 1;
  }

  return false;
}

export function inspectMigrationSafety(source: string): MigrationSafetyResult {
  const explicitlyAllowed = hasAllowDestructiveMarker(source);
  const findings: DestructiveMigrationFinding[] = [];

  for (const statement of sqlStatements(source)) {
    const comparable = statementForMatching(statement);
    const printable = printableStatement(statement);
    const checks: Array<[DestructiveMigrationFinding["operation"], RegExp]> = [
      ["DROP COLUMN", /\bDROP\s+COLUMN\b/i],
      ["DROP TABLE", /\bDROP\s+TABLE\b/i],
      ["ALTER COLUMN TYPE", /\bALTER\s+TABLE\b[\s\S]*?\bALTER\s+(?:COLUMN\s+)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+(?:SET\s+DATA\s+)?TYPE\b/i],
      ["RENAME COLUMN", /\bRENAME\s+COLUMN\b/i],
      ["RENAME TABLE", /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\s+TO\b/i],
      ["TRUNCATE", /\bTRUNCATE(?:\s+TABLE)?\b/i],
    ];

    for (const [operation, pattern] of checks) {
      if (pattern.test(comparable)) findings.push({ operation, statement: printable });
    }
  }

  return { explicitlyAllowed, findings };
}

export function assertMigrationIsSafe(filename: string, source: string): MigrationSafetyResult {
  const result = inspectMigrationSafety(source);
  if (result.findings.length && !result.explicitlyAllowed) {
    const finding = result.findings[0]!;
    throw new Error(
      `Destructive migration blocked in ${filename}: ${finding.operation} detected in statement "${finding.statement}". Add an explicit -- ALLOW-DESTRUCTIVE marker only after reviewing the live-schema impact.`,
    );
  }
  return result;
}

export async function runWithMigrationAdvisoryLock<T, TTransaction extends AdvisoryLockTransaction>(
  client: AdvisoryLockClient<TTransaction>,
  work: (transaction: TTransaction) => Promise<T>,
): Promise<T> {
  const connection = await client.reserve();
  let locked = false;
  try {
    await connection.unsafe(`SET lock_timeout = '${DEPLOYMENT_MIGRATION_LOCK_TIMEOUT_MS}ms'`);
    await connection.unsafe(`SELECT pg_advisory_lock(${DEPLOYMENT_MIGRATION_LOCK_ID})`);
    locked = true;
    return await work(connection);
  } finally {
    try {
      if (locked) await connection.unsafe(`SELECT pg_advisory_unlock(${DEPLOYMENT_MIGRATION_LOCK_ID})`);
      await connection.unsafe("RESET lock_timeout");
    } finally {
      connection.release();
    }
  }
}
