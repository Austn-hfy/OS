import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { crossEnvironmentAccessLog } from "@/db/schema";
import type {
  CrossEnvironmentAction,
  CrossEnvironmentLogLocation,
  CrossEnvironmentOutcome,
  CrossEnvironmentRecordCounts,
} from "@/domain/cross-environment-export";

export type CrossEnvironmentAccessIdentity = {
  requestId: string;
  recordedBy: CrossEnvironmentLogLocation;
  actorUserId: string | null;
  actorLabel: string;
  action: CrossEnvironmentAction;
  residencySlug: string;
  sourceProjectId: string;
  sourceEnvironment: string;
  sourceSubject: string;
  sourceIssuer: string;
  sourceDeployment: string | null;
  sourceCommitSha: string | null;
  sourceGitRef: string | null;
};

export async function beginCrossEnvironmentAccess(input: CrossEnvironmentAccessIdentity): Promise<void> {
  await getDb().insert(crossEnvironmentAccessLog).values({
    ...input,
    outcome: "started",
  });
}

export async function finishCrossEnvironmentAccess(input: {
  requestId: string;
  recordedBy: CrossEnvironmentLogLocation;
  outcome: Exclude<CrossEnvironmentOutcome, "started">;
  httpStatus: number;
  reasonCode: string | null;
  recordCounts?: CrossEnvironmentRecordCounts;
}): Promise<void> {
  const completed = await getDb().update(crossEnvironmentAccessLog).set({
    outcome: input.outcome,
    httpStatus: input.httpStatus,
    reasonCode: input.reasonCode,
    recordCounts: input.recordCounts ?? {},
    completedAt: new Date(),
  }).where(and(
    eq(crossEnvironmentAccessLog.requestId, input.requestId),
    eq(crossEnvironmentAccessLog.recordedBy, input.recordedBy),
    eq(crossEnvironmentAccessLog.outcome, "started"),
  )).returning({ id: crossEnvironmentAccessLog.id });
  if (completed.length !== 1) {
    throw new Error("The cross-environment security record could not be finalized.");
  }
}
