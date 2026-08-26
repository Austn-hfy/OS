const HEALTHCHECK_TIMEOUT_MS = 5_000;

type HealthcheckRequest = typeof fetch;

export async function pingHealthcheck(url: string | undefined, request: HealthcheckRequest = fetch) {
  const endpoint = url?.trim();
  if (!endpoint) return;

  const response = await request(endpoint, {
    method: "GET",
    cache: "no-store",
    headers: { "User-Agent": "HFY-OS-Cron/1.0" },
    signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Healthchecks.io success ping failed with HTTP ${response.status}.`);
  }
}
