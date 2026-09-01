type HeaderReader = Pick<Headers, "get">;

type PublicOriginEnvironment = Readonly<{
  NEXT_PUBLIC_APP_URL?: string;
}>;

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

/** Returns the canonical public origin configured for this deployment. */
export function requestOrigin(headers: HeaderReader, environment: PublicOriginEnvironment = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
}): string {
  const configuredOrigin = validOrigin(environment.NEXT_PUBLIC_APP_URL);
  if (configuredOrigin) return configuredOrigin;

  const host = firstHeaderValue(headers.get("x-forwarded-host") ?? headers.get("host"));
  if (!host) throw new Error("Unable to determine the application domain.");

  const forwardedProtocol = firstHeaderValue(headers.get("x-forwarded-proto"));
  const protocol = forwardedProtocol || (localHost(host) ? "http" : "https");
  if (protocol !== "http" && protocol !== "https") throw new Error("Unable to determine the application protocol.");

  const origin = new URL(`${protocol}://${host}`);
  if (origin.host !== host || origin.pathname !== "/" || origin.username || origin.password) {
    throw new Error("Unable to determine the application domain.");
  }
  return origin.origin;
}
