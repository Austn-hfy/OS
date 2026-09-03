import { randomUUID } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import postgres from "postgres";
import { NextRequest, NextResponse } from "next/server";
import {
  applyResidencyPlan,
  loadExistingStagingState,
  verifyRequiredSchema,
} from "../../../../../scripts/sync-staging-structure";
import {
  assertSafeStagingDestination,
  buildStagingResidencyPlan,
  parseProductionStructureSnapshot,
  type ProductionStructureSnapshot,
  type StagingResidencyPlan,
} from "@/domain/staging-structure-sync";
import {
  HFY_PRODUCTION_EXPORT_AUDIENCE,
  HFY_PRODUCTION_EXPORT_URL,
  HFY_STAGING_OIDC_SUBJECT,
  HFY_VERCEL_OWNER_SLUG,
  HFY_VERCEL_PROJECT_ID,
  productionExportRequestFromStaging,
  snapshotRecordCounts,
  type CrossEnvironmentOutcome,
  type ProductionExportRequest,
} from "@/domain/cross-environment-export";
import {
  createStagingSyncConfirmation,
  isAllowedStagingSyncRequest,
  isSupportedStagingSyncResidency,
  stagingSyncPlanDigest,
  verifyStagingSyncConfirmation,
} from "@/domain/staging-sync-admin";
import { getInternalActor } from "@/lib/auth";
import { alertCrossEnvironmentAccess } from "@/lib/cross-environment-alert";
import {
  beginCrossEnvironmentAccess,
  finishCrossEnvironmentAccess,
  type CrossEnvironmentAccessIdentity,
} from "@/services/cross-environment-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SyncRequest = {
  action?: unknown;
  confirmationToken?: unknown;
  residencySlug?: unknown;
};

function serverEnvironment() {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
    VERCEL_URL: process.env.VERCEL_URL,
  };
}

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function requestOriginHostname(value: string | null): string | null {
  try {
    return value ? new URL(value).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

function safePlanSummary(plan: StagingResidencyPlan) {
  return {
    residencyName: plan.report.residencyName,
    residencyWillBeCreated: plan.report.residencyWillBeCreated,
    dayparts: plan.dayparts.length,
    daypartsToCreate: plan.report.daypartsToCreate,
    daypartsToRefresh: plan.report.daypartsToRefresh,
    stagingOnlyDaypartsToDeactivate: plan.report.stagingOnlyDaypartsToDeactivate,
    weeklyDayRules: plan.dayRules.length,
    singleDateExceptions: plan.dateExceptions.length,
    assignedArtists: plan.talent.length,
    artistsToCreate: plan.report.artistsToCreate,
    artistsToRefresh: plan.report.artistsToRefresh,
    rosterAssignments: plan.rosterAssignments.length,
    stagingOnlyRosterAssignmentsToDeactivate: plan.report.stagingOnlyRosterAssignmentsToDeactivate,
    syntheticPaymentProfiles: plan.report.syntheticPaymentProfiles,
    productionTaxDocumentsDetectedByPresence: plan.talent.filter((artist) => artist.hadProductionTaxDocument).length,
    productionTaxFilesRead: 0,
    operationalRecordsCopied: 0,
    nonSelectedResidenciesTouched: 0,
  };
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function loadProductionSnapshotOverOidc(exportRequest: ProductionExportRequest): Promise<ProductionStructureSnapshot> {
  const token = await getVercelOidcToken({
    audience: HFY_PRODUCTION_EXPORT_AUDIENCE,
    jti: exportRequest.requestId,
    skipCache: true,
  });
  const response = await fetch(HFY_PRODUCTION_EXPORT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(exportRequest),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Production export endpoint rejected the request with HTTP ${response.status}.`);
  const body = await response.json() as { snapshot?: Record<string, unknown> };
  if (!body.snapshot) throw new Error("Production export endpoint returned no snapshot.");
  return parseProductionStructureSnapshot(body.snapshot, [exportRequest.residencySlug]);
}

async function finishCallerAudit(input: {
  identity: CrossEnvironmentAccessIdentity;
  outcome: Exclude<CrossEnvironmentOutcome, "started">;
  httpStatus: number;
  reasonCode: string | null;
  recordCounts?: ReturnType<typeof snapshotRecordCounts>;
}) {
  await finishCrossEnvironmentAccess({
    requestId: input.identity.requestId,
    recordedBy: "staging_caller",
    outcome: input.outcome,
    httpStatus: input.httpStatus,
    reasonCode: input.reasonCode,
    recordCounts: input.recordCounts,
  });
  alertCrossEnvironmentAccess({
    ...input.identity,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    recordCounts: input.recordCounts,
  });
}

export async function POST(request: NextRequest) {
  if (!isAllowedStagingSyncRequest(request.nextUrl.hostname, serverEnvironment())) {
    return json({ error: "Not found." }, 404);
  }
  const origin = request.headers.get("origin");
  if (requestOriginHostname(origin) !== "staging.hfy.app") {
    return json({ error: "This action must be started from the staging dashboard." }, 403);
  }
  const actor = await getInternalActor();
  if (!actor) return json({ error: "Sign in with a Developer account to continue." }, 401);

  let body: SyncRequest;
  try {
    body = await request.json() as SyncRequest;
  } catch {
    return json({ error: "The sync request was not valid." }, 400);
  }
  const action = body.action;
  const residencySlug = body.residencySlug;
  if ((action !== "preview" && action !== "apply") || typeof residencySlug !== "string") {
    return json({ error: "Choose whether to preview or apply the sync." }, 400);
  }
  if (!isSupportedStagingSyncResidency(residencySlug)) {
    return json({ error: "That Residency is not approved for dashboard synchronization." }, 403);
  }

  const stagingDatabaseUrl = requiredSecret("DATABASE_URL");
  const confirmationSecret = requiredSecret("STAGING_SYNC_CONFIRMATION_SECRET");
  assertSafeStagingDestination(stagingDatabaseUrl);

  const staging = postgres(stagingDatabaseUrl, { prepare: false, max: 1, connect_timeout: 15, idle_timeout: 10 });
  let callerAudit: CrossEnvironmentAccessIdentity | null = null;
  try {
    await verifyRequiredSchema(staging, "Staging");
    const exportRequest = productionExportRequestFromStaging({
      requestId: randomUUID(),
      action,
      residencySlug,
      actor,
      environment: serverEnvironment(),
    });
    callerAudit = {
      requestId: exportRequest.requestId,
      recordedBy: "staging_caller",
      actorUserId: exportRequest.actor.userId,
      actorLabel: exportRequest.actor.label,
      action: exportRequest.action,
      residencySlug: exportRequest.residencySlug,
      sourceProjectId: HFY_VERCEL_PROJECT_ID,
      sourceEnvironment: "preview",
      sourceSubject: HFY_STAGING_OIDC_SUBJECT,
      sourceIssuer: `https://oidc.vercel.com/${HFY_VERCEL_OWNER_SLUG}`,
      sourceDeployment: exportRequest.source.deployment,
      sourceCommitSha: exportRequest.source.commitSha,
      sourceGitRef: exportRequest.source.gitRef,
    };
    await beginCrossEnvironmentAccess(callerAudit);
    const snapshot = await loadProductionSnapshotOverOidc(exportRequest);
    if (snapshot.residencies.length !== 1) throw new Error("Production did not return exactly one approved Residency.");
    const recordCounts = snapshotRecordCounts(snapshot);
    const plans: StagingResidencyPlan[] = [];
    for (const sourceResidency of snapshot.residencies) {
      const target = await loadExistingStagingState(staging, snapshot, sourceResidency);
      plans.push(buildStagingResidencyPlan(snapshot, sourceResidency.id, target));
    }
    const digest = stagingSyncPlanDigest(plans);
    const summary = plans.map(safePlanSummary);
    if (action === "preview") {
      const confirmation = createStagingSyncConfirmation({
        actorId: actor.userId,
        digest,
        secret: confirmationSecret,
        slug: residencySlug,
      });
      await finishCallerAudit({ identity: callerAudit, outcome: "succeeded", httpStatus: 200, reasonCode: null, recordCounts });
      return json({
        action: "preview",
        confirmationToken: confirmation.token,
        expiresAt: confirmation.expiresAt,
        summary,
      });
    }
    if (typeof body.confirmationToken !== "string" || !verifyStagingSyncConfirmation({
      actorId: actor.userId,
      digest,
      secret: confirmationSecret,
      slug: residencySlug,
      token: body.confirmationToken,
    })) {
      await finishCallerAudit({ identity: callerAudit, outcome: "denied", httpStatus: 409, reasonCode: "preview_confirmation_invalid", recordCounts });
      return json({ error: "The preview expired or production changed. Preview the sync again before applying it." }, 409);
    }
    const stagingEncryptionKey = plans.some((plan) => plan.report.syntheticPaymentProfiles > 0)
      ? requiredSecret("TALENT_PAYMENT_ENCRYPTION_KEY")
      : "";
    await staging.begin(async (tx) => {
      const [lock] = await tx<Array<{ acquired: boolean }>>`select pg_try_advisory_xact_lock(2026090201) as acquired`;
      if (!lock?.acquired) throw new Error("Another staging structure sync is already running.");
      for (const plan of plans) {
        await applyResidencyPlan(tx, plan, stagingEncryptionKey, {
          userId: actor.userId,
          label: `${actor.displayName} via staging dashboard`,
        });
      }
    });
    await finishCallerAudit({ identity: callerAudit, outcome: "succeeded", httpStatus: 200, reasonCode: null, recordCounts });
    return json({
      action: "apply",
      completedAt: new Date().toISOString(),
      summary,
    });
  } catch (error) {
    console.error("Staging structure sync failed.", error instanceof Error ? error.message : "unknown_error");
    if (callerAudit) {
      try {
        await finishCallerAudit({
          identity: callerAudit,
          outcome: "failed",
          httpStatus: 500,
          reasonCode: "staging_sync_failed",
        });
      } catch {
        alertCrossEnvironmentAccess({ ...callerAudit, outcome: "failed", reasonCode: "audit_finalization_failed" });
      }
    }
    const message = error instanceof Error && (
      error.message.includes("already running")
      || error.message.includes("not configured")
    ) ? error.message : "HFY OS could not complete the staging sync. No partial changes were saved.";
    return json({ error: message }, 500);
  } finally {
    await staging.end({ timeout: 5 });
  }
}
