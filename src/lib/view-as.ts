import { cookies } from "next/headers";

export const VIEW_AS_RESIDENCY_COOKIE = "hfy-view-as-residency";

export async function viewAsResidencyId(): Promise<string | null> {
  return (await cookies()).get(VIEW_AS_RESIDENCY_COOKIE)?.value ?? null;
}
