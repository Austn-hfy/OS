export const PRIVACY_MODE_COOKIE = "hfy-privacy-mode";

export function privacyModeEnabled(value: string | undefined) {
  return value === "1";
}
