import { redirect } from "next/navigation";
import { requireResidencyActor } from "@/lib/auth";

export default async function ResidencyOverviewPage() {
  await requireResidencyActor();
  redirect("/residency/calendar");
}
