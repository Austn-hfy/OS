import * as Sentry from "@sentry/nextjs";
import type {
  CrossEnvironmentAction,
  CrossEnvironmentLogLocation,
  CrossEnvironmentOutcome,
  CrossEnvironmentRecordCounts,
} from "@/domain/cross-environment-export";

export type CrossEnvironmentAlert = {
  requestId: string;
  recordedBy: CrossEnvironmentLogLocation;
  actorUserId: string | null;
  actorLabel: string;
  action: CrossEnvironmentAction | "unknown";
  residencySlug: string;
  sourceDeployment: string | null;
  sourceCommitSha: string | null;
  sourceGitRef: string | null;
  outcome: CrossEnvironmentOutcome;
  reasonCode: string | null;
  recordCounts?: CrossEnvironmentRecordCounts;
};

export function alertCrossEnvironmentAccess(event: CrossEnvironmentAlert): void {
  try {
    Sentry.captureMessage(`Cross-environment ${event.action} ${event.outcome}`, {
      level: event.outcome === "succeeded" ? "warning" : "error",
      tags: {
        security_stream: "cross_environment_access",
        "cross_environment.location": event.recordedBy,
        "cross_environment.action": event.action,
        "cross_environment.outcome": event.outcome,
        "cross_environment.residency": event.residencySlug,
      },
      contexts: {
        cross_environment_access: {
          requestId: event.requestId,
          actorUserId: event.actorUserId,
          actorLabel: event.actorLabel,
          sourceDeployment: event.sourceDeployment,
          sourceCommitSha: event.sourceCommitSha,
          sourceGitRef: event.sourceGitRef,
          reasonCode: event.reasonCode,
          recordCounts: event.recordCounts ?? null,
        },
      },
    });
  } catch {
    console.error("Failed to emit cross-environment security event to Sentry.");
  }
}
