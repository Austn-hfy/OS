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

  it("runs guarded billing work in production", async () => {
    vi.mocked(reconcileAllPlatformUsage).mockResolvedValue([{ residencyId: "residency" }] as never);
    vi.mocked(queueMonthlyOverageHeadsUps).mockResolvedValue(["alert-1"]);
    vi.mocked(sendPendingPlatformBillingAlerts).mockResolvedValue([{ id: "alert-1", status: "sent" }]);

    const response = await GET(new Request("https://hfy.app/api/cron/platform-billing"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      usageReconciled: 1,
      headsUpsQueued: 1,
      alerts: [{ id: "alert-1", status: "sent" }],
    });
    expect(reconcileAllPlatformUsage).toHaveBeenCalledOnce();
    expect(queueMonthlyOverageHeadsUps).toHaveBeenCalledOnce();
    expect(sendPendingPlatformBillingAlerts).toHaveBeenCalledOnce();
  });
});
