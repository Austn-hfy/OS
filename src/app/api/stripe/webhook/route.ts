import { getStripe, stripeWebhookSecret } from "@/lib/stripe";
import { processStripeTestEvent, recordStripeWebhookAudit } from "@/services/platform-stripe-webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  let event;
  try {
    const rawBody = await request.text();
    event = getStripe().webhooks.constructEvent(rawBody, signature, stripeWebhookSecret());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid Stripe webhook." }, { status: 400 });
  }
  if (event.livemode) return Response.json({ error: "Live-mode events are not accepted." }, { status: 400 });
  try {
    const result = await processStripeTestEvent(event);
    if (!result.duplicate) await recordStripeWebhookAudit(event);
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Stripe webhook processing failed." }, { status: 500 });
  }
}
