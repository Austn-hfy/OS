import { createHash, randomBytes } from "node:crypto";

export const ACCOUNT_SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export function hashAccountSetupToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueAccountSetupToken(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashAccountSetupToken(token),
    expiresAt: new Date(now.getTime() + ACCOUNT_SETUP_TOKEN_TTL_MS),
  };
}

export function buildAccountSetupUrl(siteUrl: string, token: string): string {
  const url = new URL("/setup-account", siteUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
