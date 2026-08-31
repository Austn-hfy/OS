type DeploymentEnvironment = {
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_TARGET_ENV?: string;
};

export function isStagingEnvironment(environment?: DeploymentEnvironment) {
  const current = environment ?? {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
  };
  const target = (current.VERCEL_TARGET_ENV ?? current.VERCEL_ENV ?? "").toLowerCase();
  if (target === "preview" || target === "staging") return true;

  try {
    return new URL(current.NEXT_PUBLIC_APP_URL ?? "").hostname === "staging.hfy.app";
  } catch {
    return false;
  }
}
