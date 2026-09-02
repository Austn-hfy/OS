export type InviteSessionTokens = {
  access_token: string;
  refresh_token: string;
};

export function inviteSessionTokensFromHash(hash: string): InviteSessionTokens | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const accessToken = params.get("access_token")?.trim();
  const refreshToken = params.get("refresh_token")?.trim();
  if (!accessToken || !refreshToken) return null;

  return { access_token: accessToken, refresh_token: refreshToken };
}

export function inviteCallbackUrl(origin: string, code: string) {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("code", code);
  callback.searchParams.set("next", "/reset-password");
  return callback.toString();
}
