import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { StagingResidencyPlan } from "./staging-structure-sync";

export const STAGING_SYNC_RESIDENCIES = [
  { slug: "ace-hotel", name: "Ace Hotel." },
] as const;

export type StagingSyncResidencySlug = (typeof STAGING_SYNC_RESIDENCIES)[number]["slug"];

type StagingSyncEnvironment = {
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_TARGET_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
};

type ConfirmationPayload = {
  actor: string;
  digest: string;
  expiresAt: number;
  slug: StagingSyncResidencySlug;
};

function applicationHostname(value: string | undefined): string | null {
  try {
    return new URL(value ?? "").hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isStableStagingSyncEnvironment(environment: StagingSyncEnvironment): boolean {
  if (applicationHostname(environment.NEXT_PUBLIC_APP_URL) !== "staging.hfy.app") return false;
  if (!environment.VERCEL) return true;
  const target = (environment.VERCEL_TARGET_ENV ?? environment.VERCEL_ENV ?? "").toLowerCase();
  return target === "preview" && environment.VERCEL_GIT_COMMIT_REF === "staging";
}

export function isAllowedStagingSyncRequest(
  requestHostname: string,
  environment: StagingSyncEnvironment,
): boolean {
  return requestHostname.toLowerCase() === "staging.hfy.app"
    && isStableStagingSyncEnvironment(environment);
}

export function isSupportedStagingSyncResidency(value: string): value is StagingSyncResidencySlug {
  return STAGING_SYNC_RESIDENCIES.some((residency) => residency.slug === value);
}

export function stagingSyncPlanDigest(plans: StagingResidencyPlan[]): string {
  return createHash("sha256").update(JSON.stringify(plans)).digest("base64url");
}

function actorFingerprint(actorId: string): string {
  return createHash("sha256").update(actorId).digest("base64url");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createStagingSyncConfirmation(input: {
  actorId: string;
  digest: string;
  secret: string;
  slug: StagingSyncResidencySlug;
  now?: number;
}): { token: string; expiresAt: string } {
  if (input.secret.length < 32) throw new Error("STAGING_SYNC_CONFIRMATION_SECRET must contain at least 32 characters.");
  const expiresAt = (input.now ?? Date.now()) + 10 * 60 * 1_000;
  const payload: ConfirmationPayload = {
    actor: actorFingerprint(input.actorId),
    digest: input.digest,
    expiresAt,
    slug: input.slug,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    token: `${encodedPayload}.${sign(encodedPayload, input.secret)}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function verifyStagingSyncConfirmation(input: {
  actorId: string;
  digest: string;
  secret: string;
  slug: StagingSyncResidencySlug;
  token: string;
  now?: number;
}): boolean {
  const [encodedPayload, suppliedSignature, extra] = input.token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return false;
  const expectedSignature = sign(encodedPayload, input.secret);
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  let payload: ConfirmationPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as ConfirmationPayload;
  } catch {
    return false;
  }
  return payload.actor === actorFingerprint(input.actorId)
    && payload.digest === input.digest
    && payload.slug === input.slug
    && payload.expiresAt >= (input.now ?? Date.now());
}
