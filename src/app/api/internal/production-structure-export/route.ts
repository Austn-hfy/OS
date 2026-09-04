import { randomUUID } from "node:crypto";
import { verifyVercelOidcToken } from "@vercel/oidc";
import { NextRequest, NextResponse } from "next/server";
import { loadProductionStructureExport } from "@/data/production-structure-export";
import {
  assertVerifiedStagingOidcClaims,
  HFY_PRODUCTION_EXPORT_AUDIENCE,
  HFY_STAGING_OIDC_SUBJECT,
  HFY_VERCEL_OWNER_ID,
  HFY_VERCEL_OWNER_SLUG,
  HFY_VERCEL_PROJECT_ID,
  isProductionExportEnvironment,
  parseProductionExportRequest,
  snapshotRecordCounts,
  type CrossEnvironmentAction,
  type ProductionExportRequest,
} from "@/domain/cross-environment-export";
import { alertCrossEnvironmentAccess } from "@/lib/cross-environment-alert";
import {
  beginCrossEnvironmentAccess,
  finishCrossEnvironmentAccess,
} from "@/services/cross-environment-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function bearerToken(request: NextRequest): string | null {
  const value = request.headers.get("authorization") ?? "";
  const match = value.match(/^Bearer ([^\s]+)$/);
  return match?.[1] ?? null;
}

function productionEnvironment() {
  return {
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
  };
}

function deniedAlert(input: {
  requestId: string;
  action: CrossEnvironmentAction | "unknown";
  residencySlug: string;
  reasonCode: string;
}) {
  alertCrossEnvironmentAccess({
    requestId: input.requestId,
    recordedBy: "production_export",
    actorUserId: null,
    actorLabel: "Unverified caller",
    action: input.action,
    residencySlug: input.residencySlug,
    sourceDeployment: null,
    sourceCommitSha: null,
    sourceGitRef: null,
    outcome: "denied",
    reasonCode: input.reasonCode,
  });
}

function safeExportError(error: unknown) {
  if (!(error instanceof Error)) return { name: "UnknownError", message: "Unknown production export failure." };
  const details = error as Error & { code?: unknown; cause?: unknown };
  const cause = details.cause instanceof Error ? details.cause : null;
  return {
    name: details.name.slice(0, 80),
    message: details.message.slice(0, 500),
    code: typeof details.code === "string" ? details.code.slice(0, 40) : null,
    causeName: cause?.name.slice(0, 80) ?? null,
    causeMessage: cause?.message.slice(0, 500) ?? null,
  };
}

export async function POST(request: NextRequest) {
  if (!isProductionExportEnvironment(request.nextUrl.hostname, productionEnvironment())) {
    return json({ error: "Not found." }, 404);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    const requestId = randomUUID();
    deniedAlert({ requestId, action: "unknown", residencySlug: "unknown", reasonCode: "invalid_json" });
    return json({ error: "Invalid request." }, 400);
  }

  let parsed: ProductionExportRequest;
  try {
    parsed = parseProductionExportRequest(rawBody);
  } catch {
    const input = rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {};
    deniedAlert({
      requestId: typeof input.requestId === "string" ? input.requestId : randomUUID(),
      action: input.action === "preview" || input.action === "apply" ? input.action : "unknown",
      residencySlug: typeof input.residencySlug === "string" ? input.residencySlug.slice(0, 80) : "unknown",
      reasonCode: "invalid_request",
    });
    return json({ error: "Invalid request." }, 400);
  }

  const token = bearerToken(request);
  if (!token) {
    deniedAlert({ ...parsed, reasonCode: "missing_oidc_token" });
    return json({ error: "Unauthorized." }, 401);
  }

  let claims;
  try {
    const verified = await verifyVercelOidcToken(token, {
      audience: HFY_PRODUCTION_EXPORT_AUDIENCE,
      environment: "preview",
      issuer: `https://oidc.vercel.com/${HFY_VERCEL_OWNER_SLUG}`,
      ownerId: HFY_VERCEL_OWNER_ID,
      projectId: HFY_VERCEL_PROJECT_ID,
      requiredClaims: ["jti"],
      subject: HFY_STAGING_OIDC_SUBJECT,
    });
    claims = verified.payload;
    assertVerifiedStagingOidcClaims(claims, parsed.requestId);
  } catch {
    deniedAlert({ ...parsed, reasonCode: "invalid_oidc_identity" });
    return json({ error: "Unauthorized." }, 401);
  }

  const identity = {
    requestId: parsed.requestId,
    recordedBy: "production_export" as const,
    actorUserId: parsed.actor.userId,
    actorLabel: parsed.actor.label,
    action: parsed.action,
    residencySlug: parsed.residencySlug,
    sourceProjectId: claims.project_id,
    sourceEnvironment: claims.environment,
    sourceSubject: claims.sub,
    sourceIssuer: claims.iss,
    sourceDeployment: parsed.source.deployment,
    sourceCommitSha: parsed.source.commitSha,
    sourceGitRef: parsed.source.gitRef,
  };

  try {
    await beginCrossEnvironmentAccess(identity);
  } catch {
    alertCrossEnvironmentAccess({ ...identity, outcome: "denied", reasonCode: "audit_start_failed_or_replayed" });
    return json({ error: "The export could not be authorized." }, 409);
  }

  try {
    const snapshot = await loadProductionStructureExport(parsed.residencySlug);
    const recordCounts = snapshotRecordCounts(snapshot);
    await finishCrossEnvironmentAccess({
      requestId: parsed.requestId,
      recordedBy: "production_export",
      outcome: "succeeded",
      httpStatus: 200,
      reasonCode: null,
      recordCounts,
    });
    alertCrossEnvironmentAccess({ ...identity, outcome: "succeeded", reasonCode: null, recordCounts });
    return json({ snapshot }, 200);
  } catch (error) {
    try {
      await finishCrossEnvironmentAccess({
        requestId: parsed.requestId,
        recordedBy: "production_export",
        outcome: "failed",
        httpStatus: 500,
        reasonCode: "export_failed",
      });
    } catch {
      // The response still fails closed when the terminal audit write is unavailable.
    }
    console.error("Production structure export failed.", JSON.stringify(safeExportError(error)));
    alertCrossEnvironmentAccess({ ...identity, outcome: "failed", reasonCode: "export_failed" });
    return json({ error: "The production structure export could not be completed." }, 500);
  }
}
