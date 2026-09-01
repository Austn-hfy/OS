import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCalendarView } from "@/components/public-calendar-view";
import { getPublicCalendarByToken } from "@/data/public-calendar";
import { enforcePublicCalendarResponse } from "@/domain/public-calendar";
import { normalizeMonthKey } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Programming Calendar · HFY",
  description: "Read-only programming calendar",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function PublicCalendarPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ month?: string }> }) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const result = await getPublicCalendarByToken(token);
  if (!result) notFound();
  const calendar = enforcePublicCalendarResponse(result);
  const monthKey = normalizeMonthKey(query.month);
  return <PublicCalendarView token={token} monthKey={monthKey} calendar={calendar} />;
}
