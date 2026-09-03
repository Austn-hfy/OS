import { describe, expect, it } from "vitest";
import {
  assertVerifiedStagingOidcClaims,
  HFY_PRODUCTION_EXPORT_AUDIENCE,
  HFY_STAGING_OIDC_SUBJECT,
  HFY_VERCEL_OWNER_ID,
  HFY_VERCEL_OWNER_SLUG,
  HFY_VERCEL_PROJECT_ID,
  isProductionExportEnvironment,
  parseProductionExportRequest,
  productionExportRequestFromStaging,
  snapshotRecordCounts,
} from "./cross-environment-export";

const requestId = "00000000-0000-4000-8000-000000000901";
const actorId = "00000000-0000-4000-8000-000000000902";

function request() {
  return {
    requestId,
    action: "preview" as const,
    residencySlug: "ace-hotel" as const,
    actor: { userId: actorId, label: "Austyn Moreno" },
    source: {
      deployment: "https://hfy-os-git-staging-austyn-7123.vercel.app",
      commitSha: "abcdef1234567890",
      gitRef: "staging" as const,
    },
  };
}

describe("cross-environment production export boundary", () => {
  it("enables the export endpoint only on HFY production main", () => {
    const environment = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_PROJECT_ID: HFY_VERCEL_PROJECT_ID,
    };
    expect(isProductionExportEnvironment("hfy.app", environment)).toBe(true);
    expect(isProductionExportEnvironment("staging.hfy.app", environment)).toBe(false);
    expect(isProductionExportEnvironment("hfy.app", { ...environment, VERCEL_GIT_COMMIT_REF: "staging" })).toBe(false);
    expect(isProductionExportEnvironment("hfy.app", { ...environment, VERCEL_TARGET_ENV: "preview" })).toBe(false);
    expect(isProductionExportEnvironment("hfy.app", { ...environment, VERCEL_PROJECT_ID: "prj_other" })).toBe(false);
  });

  it("builds requests only from the stable staging deployment", () => {
    const environment = {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_TARGET_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_GIT_COMMIT_SHA: "abcdef1234567890",
      VERCEL_PROJECT_ID: HFY_VERCEL_PROJECT_ID,
      VERCEL_URL: "hfy-os-git-staging-austyn-7123.vercel.app",
    };
    expect(productionExportRequestFromStaging({
      requestId,
      action: "preview",
      residencySlug: "ace-hotel",
      actor: { userId: actorId, displayName: "Austyn Moreno" },
      environment,
    })).toEqual(request());
    expect(() => productionExportRequestFromStaging({
      requestId,
      action: "preview",
      residencySlug: "ace-hotel",
      actor: { userId: actorId, displayName: "Austyn Moreno" },
      environment: { ...environment, VERCEL_GIT_COMMIT_REF: "feature" },
    })).toThrow(/stable staging deployment/);
  });

  it("allows only Ace, a valid actor, and audited staging metadata", () => {
    expect(parseProductionExportRequest(request())).toEqual(request());
    expect(() => parseProductionExportRequest({ ...request(), residencySlug: "test-1" })).toThrow(/not approved/);
    expect(() => parseProductionExportRequest({ ...request(), actor: { userId: "not-a-uuid", label: "Austyn" } })).toThrow(/actor/);
    expect(() => parseProductionExportRequest({ ...request(), source: { ...request().source, gitRef: "main" } })).toThrow(/stable staging branch/);
    expect(() => parseProductionExportRequest({ ...request(), source: { ...request().source, deployment: "https://example.com" } })).toThrow(/deployment identity/);
  });

  it("requires the exact signed Vercel identity and one-use request ID", () => {
    const claims = {
      aud: HFY_PRODUCTION_EXPORT_AUDIENCE,
      environment: "preview",
      iss: `https://oidc.vercel.com/${HFY_VERCEL_OWNER_SLUG}`,
      jti: requestId,
      owner_id: HFY_VERCEL_OWNER_ID,
      project_id: HFY_VERCEL_PROJECT_ID,
      sub: HFY_STAGING_OIDC_SUBJECT,
    };
    expect(() => assertVerifiedStagingOidcClaims(claims, requestId)).not.toThrow();
    expect(() => assertVerifiedStagingOidcClaims({ ...claims, jti: "00000000-0000-4000-8000-000000000999" }, requestId)).toThrow(/not authorized/);
    expect(() => assertVerifiedStagingOidcClaims({ ...claims, environment: "production" }, requestId)).toThrow(/not authorized/);
    expect(() => assertVerifiedStagingOidcClaims({ ...claims, project_id: "prj_other" }, requestId)).toThrow(/not authorized/);
  });

  it("reduces export auditing to safe record counts", () => {
    const counts = snapshotRecordCounts({
      clientAccounts: [{}],
      residencies: [{}, {}],
      dayparts: [{}, {}, {}],
      dayRules: [],
      dateExceptions: [{}],
      talent: [{}, {}],
      rosterAssignments: [{}, {}],
    } as never);
    expect(counts).toEqual({
      clientAccounts: 1,
      residencies: 2,
      dayparts: 3,
      dayRules: 0,
      dateExceptions: 1,
      talent: 2,
      rosterAssignments: 2,
    });
    expect(JSON.stringify(counts)).not.toMatch(/email|phone|routing|token|snapshot/i);
  });
});
