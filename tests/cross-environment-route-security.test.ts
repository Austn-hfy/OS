import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("cross-environment route security", () => {
  it("uses a fresh audience-bound OIDC token without logging it", async () => {
    const source = await readFile(new URL("../src/app/api/internal/staging-sync/route.ts", import.meta.url), "utf8");
    expect(source).toContain("getVercelOidcToken({");
    expect(source).toContain("audience: HFY_PRODUCTION_EXPORT_AUDIENCE");
    expect(source).toContain("jti: exportRequest.requestId");
    expect(source).toContain("skipCache: true");
    expect(source).toContain("fetch(HFY_PRODUCTION_EXPORT_URL");
    expect(source).toContain('cache: "no-store"');
    expect(source).not.toMatch(/console\.(?:log|error)[^\n]*token/i);
    expect(source).not.toMatch(/alertCrossEnvironmentAccess\([^)]*token/i);
  });

  it("verifies exact signed identity claims and audits before reading production", async () => {
    const source = await readFile(new URL("../src/app/api/internal/production-structure-export/route.ts", import.meta.url), "utf8");
    expect(source).toContain("verifyVercelOidcToken(token");
    expect(source).toContain("audience: HFY_PRODUCTION_EXPORT_AUDIENCE");
    expect(source).toContain('environment: "preview"');
    expect(source).toContain("ownerId: HFY_VERCEL_OWNER_ID");
    expect(source).toContain("projectId: HFY_VERCEL_PROJECT_ID");
    expect(source).toContain('requiredClaims: ["jti"]');
    expect(source).toContain("subject: HFY_STAGING_OIDC_SUBJECT");
    expect(source.indexOf("await beginCrossEnvironmentAccess(identity)")).toBeLessThan(source.indexOf("await loadProductionStructureExport"));
    expect(source).not.toContain("PRODUCTION_SYNC_DATABASE_URL");
    expect(source).not.toMatch(/console\.(?:log|error)[^\n]*(?:token|snapshot|authorization)/i);
    expect(source).toContain('"Cache-Control": "no-store"');
  });

  it("records safe metadata and counts, never credentials or exported records", async () => {
    const source = await readFile(new URL("../src/lib/cross-environment-alert.ts", import.meta.url), "utf8");
    expect(source).toContain('security_stream: "cross_environment_access"');
    expect(source).toContain("Sentry.captureMessage");
    expect(source).not.toContain("Sentry.withScope");
    expect(source).toContain("actorUserId");
    expect(source).toContain("sourceDeployment");
    expect(source).toContain("sourceCommitSha");
    expect(source).toContain("recordCounts");
    expect(source).not.toMatch(/authorization|bearer|credential|database_url|snapshot/i);
  });
});
