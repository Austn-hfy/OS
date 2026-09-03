import { describe, expect, it } from "vitest";
import {
  createStagingSyncConfirmation,
  isAllowedStagingSyncRequest,
  isStableStagingSyncEnvironment,
  isSupportedStagingSyncResidency,
  verifyStagingSyncConfirmation,
} from "./staging-sync-admin";

const stagingEnvironment = {
  NEXT_PUBLIC_APP_URL: "https://staging.hfy.app",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "staging",
};

describe("staging sync dashboard authorization", () => {
  it("is enabled only for the stable staging host on the staging branch", () => {
    expect(isStableStagingSyncEnvironment(stagingEnvironment)).toBe(true);
    expect(isAllowedStagingSyncRequest("staging.hfy.app", stagingEnvironment)).toBe(true);
    expect(isAllowedStagingSyncRequest("hfy.app", stagingEnvironment)).toBe(false);
    expect(isStableStagingSyncEnvironment({ ...stagingEnvironment, NEXT_PUBLIC_APP_URL: "https://hfy.app" })).toBe(false);
    expect(isStableStagingSyncEnvironment({ ...stagingEnvironment, VERCEL_GIT_COMMIT_REF: "feature-branch" })).toBe(false);
    expect(isStableStagingSyncEnvironment({ ...stagingEnvironment, VERCEL_TARGET_ENV: "production" })).toBe(false);
  });

  it("keeps the first dashboard release Ace-only", () => {
    expect(isSupportedStagingSyncResidency("ace-hotel")).toBe(true);
    expect(isSupportedStagingSyncResidency("test-1")).toBe(false);
  });

  it("requires an unexpired preview for the same actor, Residency, and plan", () => {
    const secret = "a-secure-staging-only-confirmation-secret";
    const preview = createStagingSyncConfirmation({ actorId: "owner-1", digest: "plan-a", secret, slug: "ace-hotel", now: 1_000 });
    const base = { actorId: "owner-1", digest: "plan-a", secret, slug: "ace-hotel" as const, token: preview.token };
    expect(verifyStagingSyncConfirmation({ ...base, now: 2_000 })).toBe(true);
    expect(verifyStagingSyncConfirmation({ ...base, actorId: "owner-2", now: 2_000 })).toBe(false);
    expect(verifyStagingSyncConfirmation({ ...base, digest: "plan-b", now: 2_000 })).toBe(false);
    expect(verifyStagingSyncConfirmation({ ...base, now: 1_000 + 10 * 60 * 1_000 + 1 })).toBe(false);
    expect(verifyStagingSyncConfirmation({ ...base, token: `${preview.token}tampered`, now: 2_000 })).toBe(false);
  });
});
