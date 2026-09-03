import type { ProductionStructureSnapshot } from "./staging-structure-sync";

export const HFY_VERCEL_OWNER_ID = "team_4DTFAkeSGp4pY8tlMPccx5is";
export const HFY_VERCEL_OWNER_SLUG = "austyn-7123";
export const HFY_VERCEL_PROJECT_ID = "prj_Mrmd3KFl13r9Tvor2QCzd7JbObpu";
export const HFY_VERCEL_PROJECT_SLUG = "hfy-os";
export const HFY_PRODUCTION_EXPORT_AUDIENCE = "https://hfy.app/api/internal/production-structure-export";
export const HFY_STAGING_OIDC_SUBJECT = `owner:${HFY_VERCEL_OWNER_SLUG}:project:${HFY_VERCEL_PROJECT_SLUG}:environment:preview`;
export const HFY_PRODUCTION_EXPORT_URL = HFY_PRODUCTION_EXPORT_AUDIENCE;

export type CrossEnvironmentAction = "preview" | "apply";
export type CrossEnvironmentLogLocation = "staging_caller" | "production_export";
export type CrossEnvironmentOutcome = "started" | "succeeded" | "failed" | "denied";

export type ProductionExportRequest = {
  requestId: string;
  action: CrossEnvironmentAction;
  residencySlug: "ace-hotel";
  actor: {
    userId: string;
    label: string;
  };
  source: {
    deployment: string | null;
    commitSha: string | null;
    gitRef: "staging";
  };
};

export type CrossEnvironmentRecordCounts = {
  clientAccounts: number;
  residencies: number;
  dayparts: number;
  dayRules: number;
  dateExceptions: number;
  talent: number;
  rosterAssignments: number;
};

type ProductionEnvironment = {
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_TARGET_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERCEL_PROJECT_ID?: string;
};

type StagingSourceEnvironment = ProductionEnvironment & {
  VERCEL_URL?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
};

type VerifiedVercelClaims = {
  aud?: string | string[];
  environment?: string;
  iss?: string;
  jti?: string;
  owner_id?: string;
  project_id?: string;
  sub?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[0-9a-f]{7,64}$/i;

function asNullableString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("The production export request contains invalid metadata.");
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error("The production export request contains invalid metadata.");
  return normalized;
}

export function parseProductionExportRequest(value: unknown): ProductionExportRequest {
  if (!value || typeof value !== "object") throw new Error("The production export request was not valid.");
  const input = value as Record<string, unknown>;
  if (typeof input.requestId !== "string" || !UUID_PATTERN.test(input.requestId)) {
    throw new Error("The production export request ID was not valid.");
  }
  if (input.action !== "preview" && input.action !== "apply") {
    throw new Error("The production export action was not valid.");
  }
  if (input.residencySlug !== "ace-hotel") {
    throw new Error("That Residency is not approved for production structure export.");
  }
  if (!input.actor || typeof input.actor !== "object" || !input.source || typeof input.source !== "object") {
    throw new Error("The production export request is missing its audit identity.");
  }
  const actor = input.actor as Record<string, unknown>;
  const source = input.source as Record<string, unknown>;
  if (typeof actor.userId !== "string" || !UUID_PATTERN.test(actor.userId)) {
    throw new Error("The production export actor was not valid.");
  }
  const actorLabel = asNullableString(actor.label, 160);
  if (!actorLabel) throw new Error("The production export actor was not valid.");
  const deployment = asNullableString(source.deployment, 255);
  if (deployment) {
    const url = new URL(deployment);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")) {
      throw new Error("The production export deployment identity was not valid.");
    }
  }
  const commitSha = asNullableString(source.commitSha, 64);
  if (commitSha && !SHA_PATTERN.test(commitSha)) {
    throw new Error("The production export commit identity was not valid.");
  }
  if (source.gitRef !== "staging") {
    throw new Error("Only the stable staging branch may request a production export.");
  }
  return {
    requestId: input.requestId,
    action: input.action,
    residencySlug: input.residencySlug,
    actor: { userId: actor.userId, label: actorLabel },
    source: { deployment, commitSha, gitRef: "staging" },
  };
}

export function productionExportRequestFromStaging(input: {
  requestId: string;
  action: CrossEnvironmentAction;
  residencySlug: "ace-hotel";
  actor: { userId: string; displayName: string };
  environment: StagingSourceEnvironment;
}): ProductionExportRequest {
  if (input.environment.VERCEL_PROJECT_ID !== HFY_VERCEL_PROJECT_ID
    || (input.environment.VERCEL_TARGET_ENV ?? input.environment.VERCEL_ENV) !== "preview"
    || input.environment.VERCEL_GIT_COMMIT_REF !== "staging") {
    throw new Error("The production structure export can only run from HFY's stable staging deployment.");
  }
  const deployment = input.environment.VERCEL_URL ? `https://${input.environment.VERCEL_URL}` : null;
  return parseProductionExportRequest({
    requestId: input.requestId,
    action: input.action,
    residencySlug: input.residencySlug,
    actor: { userId: input.actor.userId, label: input.actor.displayName },
    source: {
      deployment,
      commitSha: input.environment.VERCEL_GIT_COMMIT_SHA ?? null,
      gitRef: input.environment.VERCEL_GIT_COMMIT_REF,
    },
  });
}

export function isProductionExportEnvironment(hostname: string, environment: ProductionEnvironment): boolean {
  if (hostname.toLowerCase() !== "hfy.app") return false;
  if (environment.VERCEL_PROJECT_ID !== HFY_VERCEL_PROJECT_ID) return false;
  if (!environment.VERCEL) return false;
  const target = (environment.VERCEL_TARGET_ENV ?? environment.VERCEL_ENV ?? "").toLowerCase();
  return target === "production" && environment.VERCEL_GIT_COMMIT_REF === "main";
}

export function assertVerifiedStagingOidcClaims(claims: VerifiedVercelClaims, requestId: string): void {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(HFY_PRODUCTION_EXPORT_AUDIENCE)
    || claims.environment !== "preview"
    || claims.iss !== `https://oidc.vercel.com/${HFY_VERCEL_OWNER_SLUG}`
    || claims.owner_id !== HFY_VERCEL_OWNER_ID
    || claims.project_id !== HFY_VERCEL_PROJECT_ID
    || claims.sub !== HFY_STAGING_OIDC_SUBJECT
    || claims.jti !== requestId) {
    throw new Error("The Vercel deployment identity was not authorized for this export.");
  }
}

export function snapshotRecordCounts(snapshot: ProductionStructureSnapshot): CrossEnvironmentRecordCounts {
  return {
    clientAccounts: snapshot.clientAccounts.length,
    residencies: snapshot.residencies.length,
    dayparts: snapshot.dayparts.length,
    dayRules: snapshot.dayRules.length,
    dateExceptions: snapshot.dateExceptions.length,
    talent: snapshot.talent.length,
    rosterAssignments: snapshot.rosterAssignments.length,
  };
}
