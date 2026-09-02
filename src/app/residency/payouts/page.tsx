import { requireResidencyActor } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LegacyResidencyPayoutRedirectPage() {
  await requireResidencyActor();
  redirect("/residency/finances");
}
