import { redirect } from "next/navigation";
import { getSignedInDestination } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  redirect(await getSignedInDestination());
}
