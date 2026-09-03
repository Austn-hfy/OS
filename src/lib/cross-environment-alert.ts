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
  Sentry.withScope((scope) => {
    scope.setLevel(event.outcome === "succeeded" ? "warning" : "error");
    scope.setTag("security_stream", "cross_environment_access");
    scope.setTag("cross_environment.location", event.recordedBy);
    scope.setTag("cross_environment.action", event.action);
    scope.setTag("cross_environment.outcome", event.outcome);
    scope.setTag("cross_environment.residency", event.residencySlug);
    scope.setContext("cross_environment_access", {
      requestId: event.requestId,
      actorUserId: event.actorUserId,
      actorLabel: event.actorLabel,
      sourceDeployment: event.sourceDeployment,
      sourceCommitSha: event.sourceCommitSha,
      sourceGitRef: event.sourceGitRef,
      reasonCode: event.reasonCode,
      recordCounts: event.recordCounts ?? null,
    });
    Sentry.captureMessage(`Cross-environment ${event.action} ${event.outcome}`);
  });
}
