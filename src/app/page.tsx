import { redirect } from "next/navigation";
import { getSignedInDestination } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (process.env.HFY_DEMO_MODE === "1") redirect("/preview");
  redirect(await getSignedInDestination());
}
