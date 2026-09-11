import { isAuthorizedCron } from "@/lib/cron";
import { runStandingDaypartMaterialization } from "@/services/daypart-materialization";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const results = await runStandingDaypartMaterialization();
    return Response.json({
      ok: true,
      residenciesProcessed: results.length,
      recordsCreated: results.reduce((total, result) => total + result.created.length, 0),
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Standing Daypart materialization failed",
    }, { status: 500 });
  }
}
