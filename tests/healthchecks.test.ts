import { describe, expect, it, vi } from "vitest";
import { pingHealthcheck } from "../src/lib/healthchecks";

describe("Healthchecks.io success pings", () => {
  it("does nothing when a check URL is not configured", async () => {
    const request = vi.fn<typeof fetch>();

    await pingHealthcheck(undefined, request);

    expect(request).not.toHaveBeenCalled();
  });

  it("pings the configured check URL", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    await pingHealthcheck("https://hc-ping.com/check-id", request);

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("https://hc-ping.com/check-id", expect.objectContaining({
      method: "GET",
      cache: "no-store",
    }));
  });

  it("fails the handler when the success ping is rejected", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(pingHealthcheck("https://hc-ping.com/check-id", request)).rejects.toThrow(/HTTP 503/);
  });
});
