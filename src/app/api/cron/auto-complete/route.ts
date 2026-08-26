import { isAuthorizedCron } from "@/lib/cron";
import { runAutoComplete } from "@/services/automations";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, results: await runAutoComplete() });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Automation failed" }, { status: 500 });
  }
}
