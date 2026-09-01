type HeaderReader = Pick<Headers, "get">;

type PublicOriginEnvironment = Readonly<{
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_TARGET_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
}>;

const productionOrigin = "https://hfy.app";

function firstHeaderValue(value: string | null): string {
  return value?.split(",", 1)[0]?.trim() ?? "";
}

function localHost(host: string): boolean {
  const hostname = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":", 1)[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function validOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!(["http:", "https:"] as const).includes(url.protocol as "http:" | "https:")
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isVercelOrigin(origin: string): boolean {
  return new URL(origin).hostname.endsWith(".vercel.app");
}

function deploymentOrigin(environment: PublicOriginEnvironment): string | null {
  const branch = environment.VERCEL_GIT_COMMIT_REF?.toLowerCase();
  const target = environment.VERCEL_TARGET_ENV?.toLowerCase();
  const vercelEnvironment = environment.VERCEL_ENV?.toLowerCase();
  if (branch === "staging" || target === "staging") {
    const production = new URL(productionOrigin);
    production.hostname = `staging.${production.hostname}`;
    return production.origin;
  }
  if (target === "production" || vercelEnvironment === "production") return productionOrigin;
  return null;
}

function requestHeaderOrigin(headers: HeaderReader): string | null {
  const host = firstHeaderValue(headers.get("x-forwarded-host") ?? headers.get("host"));
  if (!host) return null;

  const forwardedProtocol = firstHeaderValue(headers.get("x-forwarded-proto"));
  const protocol = forwardedProtocol || (localHost(host) ? "http" : "https");
  if (protocol !== "http" && protocol !== "https") throw new Error("Unable to determine the application protocol.");

  const origin = new URL(`${protocol}://${host}`);
  if (origin.host !== host || origin.pathname !== "/" || origin.username || origin.password) {
    throw new Error("Unable to determine the application domain.");
  }
  return origin.origin;
}

/** Returns the canonical public origin configured for this deployment. */
export function requestOrigin(headers: HeaderReader, environment: PublicOriginEnvironment = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
  VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
}): string {
  const configuredOrigin = validOrigin(environment.NEXT_PUBLIC_APP_URL);
  if (configuredOrigin && !isVercelOrigin(configuredOrigin)) return configuredOrigin;

  const requestOrigin = requestHeaderOrigin(headers);
  if (requestOrigin && !isVercelOrigin(requestOrigin)) return requestOrigin;

  const resolvedOrigin = deploymentOrigin(environment) ?? configuredOrigin ?? requestOrigin;
  if (!resolvedOrigin) throw new Error("Unable to determine the application domain.");
  return resolvedOrigin;
}
