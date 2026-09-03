import postgres from "postgres";
import { NextRequest, NextResponse } from "next/server";
import {
  applyResidencyPlan,
  loadExistingStagingState,
  loadRestrictedProductionSnapshot,
  verifyRequiredSchema,
} from "../../../../../scripts/sync-staging-structure";
import {
  assertSafeSyncEnvironment,
  buildStagingResidencyPlan,
  pooledProductionReaderUrl,
  type StagingResidencyPlan,
} from "@/domain/staging-structure-sync";
import {
  createStagingSyncConfirmation,
  isAllowedStagingSyncRequest,
  isSupportedStagingSyncResidency,
  stagingSyncPlanDigest,
  verifyStagingSyncConfirmation,
} from "@/domain/staging-sync-admin";
import { getInternalActor } from "@/lib/auth";

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
  };
}

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function assertRestrictedProductionReader(databaseUrl: string): void {
  const username = decodeURIComponent(new URL(databaseUrl).username);
  if (username !== "hfy_staging_structure_reader"
    && !username.startsWith("hfy_staging_structure_reader.")) {
    throw new Error("The dashboard sync requires the dedicated read-only production structure connection.");
  }
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

  const productionDatabaseUrl = pooledProductionReaderUrl(requiredSecret("PRODUCTION_SYNC_DATABASE_URL"));
  const stagingDatabaseUrl = requiredSecret("DATABASE_URL");
  const confirmationSecret = requiredSecret("STAGING_SYNC_CONFIRMATION_SECRET");
  assertRestrictedProductionReader(productionDatabaseUrl);
  assertSafeSyncEnvironment(productionDatabaseUrl, stagingDatabaseUrl);

  const production = postgres(productionDatabaseUrl, { prepare: false, max: 1, connect_timeout: 15, idle_timeout: 10 });
  const staging = postgres(stagingDatabaseUrl, { prepare: false, max: 1, connect_timeout: 15, idle_timeout: 10 });
  try {
    await verifyRequiredSchema(staging, "Staging");
    const snapshot = await production.begin("read only", (tx) => loadRestrictedProductionSnapshot(tx, [residencySlug]));
    if (snapshot.residencies.length !== 1) throw new Error("Production did not return exactly one approved Residency.");
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
    return json({
      action: "apply",
      completedAt: new Date().toISOString(),
      summary,
    });
  } catch (error) {
    console.error("Staging structure sync failed.", error);
    const message = error instanceof Error && (
      error.message.includes("already running")
      || error.message.includes("not configured")
    ) ? error.message : "HFY OS could not complete the staging sync. No partial changes were saved.";
    return json({ error: message }, 500);
  } finally {
    await Promise.all([
      production.end({ timeout: 5 }),
      staging.end({ timeout: 5 }),
    ]);
  }
}
