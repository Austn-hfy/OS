import { redirect } from "next/navigation";
import { requireResidencyActor } from "@/lib/auth";

export default async function ResidencyInvoicesPage() {
  await requireResidencyActor();
  redirect("/residency/finances");
}
