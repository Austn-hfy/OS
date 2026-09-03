import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

import { alertCrossEnvironmentAccess, type CrossEnvironmentAlert } from "./cross-environment-alert";

const event: CrossEnvironmentAlert = {
  requestId: "request-123",
  recordedBy: "staging_caller",
  actorUserId: "user-456",
  actorLabel: "Developer via staging dashboard",
  action: "preview",
  residencySlug: "ace-hotel",
  sourceDeployment: "https://staging.hfy.app",
  sourceCommitSha: "abcdef123456",
  sourceGitRef: "staging",
  outcome: "succeeded",
  reasonCode: null,
  recordCounts: {
    clientAccounts: 1,
    residencies: 1,
    dayparts: 4,
    dayRules: 7,
    dateExceptions: 2,
    talent: 10,
    rosterAssignments: 10,
  },
};

describe("cross-environment Sentry alerts", () => {
  beforeEach(() => {
    sentry.captureMessage.mockReset();
  });

  it("attaches security metadata only to the captured event", () => {
    alertCrossEnvironmentAccess(event);

    expect(sentry.captureMessage).toHaveBeenCalledWith(
      "Cross-environment preview succeeded",
      {
        level: "warning",
        tags: {
          security_stream: "cross_environment_access",
          "cross_environment.location": "staging_caller",
          "cross_environment.action": "preview",
          "cross_environment.outcome": "succeeded",
          "cross_environment.residency": "ace-hotel",
        },
        contexts: {
          cross_environment_access: {
            requestId: "request-123",
            actorUserId: "user-456",
            actorLabel: "Developer via staging dashboard",
            sourceDeployment: "https://staging.hfy.app",
            sourceCommitSha: "abcdef123456",
            sourceGitRef: "staging",
            reasonCode: null,
            recordCounts: event.recordCounts,
          },
        },
      },
    );
  });

  it("does not let a telemetry failure break the protected operation", () => {
    sentry.captureMessage.mockImplementationOnce(() => {
      throw new TypeError("captureMessage is not a function");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => alertCrossEnvironmentAccess({
      ...event,
      outcome: "failed",
      reasonCode: "export_failed",
    })).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith("Failed to emit cross-environment security event to Sentry.");

    consoleError.mockRestore();
  });
});
