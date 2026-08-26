import { isAuthorizedCron } from "@/lib/cron";
import { runReconciliation } from "@/services/automations";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, results: await runReconciliation() });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Reconciliation failed" }, { status: 500 });
  }
}
