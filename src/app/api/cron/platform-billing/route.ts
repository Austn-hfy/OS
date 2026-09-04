import { isAuthorizedCron } from "@/lib/cron";
import { queueMonthlyOverageHeadsUps, sendPendingPlatformBillingAlerts } from "@/services/platform-billing-alerts";
import { reconcileAllPlatformUsage } from "@/services/platform-usage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const usage = await reconcileAllPlatformUsage();
    const headsUps = await queueMonthlyOverageHeadsUps();
    const alerts = await sendPendingPlatformBillingAlerts();
    return Response.json({ ok: true, usageReconciled: usage.length, headsUpsQueued: headsUps.length, alerts });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Platform billing automation failed" }, { status: 500 });
  }
}
