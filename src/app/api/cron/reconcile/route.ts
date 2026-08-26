import { isAuthorizedCron } from "@/lib/cron";
import { pingHealthcheck } from "@/lib/healthchecks";
import { runReconciliation } from "@/services/automations";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const results = await runReconciliation();
    await pingHealthcheck(process.env.HEALTHCHECKS_RECONCILE_URL);
    return Response.json({ ok: true, results });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Reconciliation failed" }, { status: 500 });
  }
}
