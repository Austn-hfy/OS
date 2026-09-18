import "server-only";

import { cookies } from "next/headers";

export const CLIENT_VIEW_AS_MEMBERSHIP_COOKIE = "hfy-client-view-as-membership";

export async function clientViewAsMembershipId() {
  return (await cookies()).get(CLIENT_VIEW_AS_MEMBERSHIP_COOKIE)?.value ?? null;
}

