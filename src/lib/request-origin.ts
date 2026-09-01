type HeaderReader = Pick<Headers, "get">;

function firstHeaderValue(value: string | null): string {
  return value?.split(",", 1)[0]?.trim() ?? "";
}

function localHost(host: string): boolean {
  const hostname = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":", 1)[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/** Returns the public origin used to reach the current deployment. */
export function requestOrigin(headers: HeaderReader): string {
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
