import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedCron } from "@/lib/cron";
import { queueMonthlyOverageHeadsUps, sendPendingPlatformBillingAlerts } from "@/services/platform-billing-alerts";
import { reconcileAllPlatformUsage } from "@/services/platform-usage";
import { GET } from "./route";

vi.mock("@/lib/cron", () => ({ isAuthorizedCron: vi.fn() }));
vi.mock("@/services/platform-billing-alerts", () => ({
  queueMonthlyOverageHeadsUps: vi.fn(),
  sendPendingPlatformBillingAlerts: vi.fn(),
}));
vi.mock("@/services/platform-usage", () => ({ reconcileAllPlatformUsage: vi.fn() }));

describe("GET /api/cron/platform-billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(isAuthorizedCron).mockReturnValue(true);
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hfy.app");
  });

  it("returns 200 on hold before running billing work", async () => {
    const response = await GET(new Request("https://hfy.app/api/cron/platform-billing"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      onHold: true,
      message: "Platform billing is staging-only and is disabled in the production deployment.",
    });
    expect(reconcileAllPlatformUsage).not.toHaveBeenCalled();
    expect(queueMonthlyOverageHeadsUps).not.toHaveBeenCalled();
    expect(sendPendingPlatformBillingAlerts).not.toHaveBeenCalled();
  });
});
