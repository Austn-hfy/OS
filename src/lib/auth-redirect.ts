export function safeAuthRedirect(value: string | null, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function passwordRecoveryRedirectUrl(origin: string) {
  return new URL("/auth/callback", origin).toString();
}
