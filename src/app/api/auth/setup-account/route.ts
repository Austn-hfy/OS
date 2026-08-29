import { z } from "zod";
import { completeAccountSetup } from "@/services/account-setup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(200),
  confirmation: z.string().min(12).max(200),
}).refine((value) => value.password === value.confirmation, {
  message: "The two passwords do not match.",
  path: ["confirmation"],
});

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  if (request.headers.get("origin") !== requestUrl.origin) {
    return json({ error: "This setup request must come from the HFY OS setup page." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Invalid setup request." }, 415);
  }

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Check the password and try again." }, 400);
    }
    const result = await completeAccountSetup(parsed.data);
    if (result.status === "invalid") {
      return json({ error: "This setup link is invalid, expired, revoked, or has already been used." }, 410);
    }
    return json({ status: "success", email: result.email }, 200);
  } catch (error) {
    console.error("Account setup failed", error);
    return json({ error: "HFY OS could not save this password. The link has not been used; please try again." }, 500);
  }
}
