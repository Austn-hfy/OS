import { NextResponse } from "next/server";
import { getPublicCalendarByToken } from "@/data/public-calendar";
import { enforcePublicCalendarResponse } from "@/domain/public-calendar";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const result = await getPublicCalendarByToken((await params).token);
  if (!result) return NextResponse.json({ error: "Calendar not found." }, { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } });
  return NextResponse.json(enforcePublicCalendarResponse(result), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
