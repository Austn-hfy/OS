import "server-only";

import { getDb } from "@/db/client";
import { platformSettings } from "@/db/schema";
import { routeOutboundEmailForLiveBillingApproval } from "@/domain/outbound-email";
import { getResidencyLiveBillingApproval, logLiveBillingBlock } from "@/services/live-billing-safety";
import { sendEmail, type OutboundEmail } from "@/services/outbound-email";

export async function getOwnerBillingEmail() {
  if (process.env.PLATFORM_BILLING_OWNER_EMAIL?.trim()) return process.env.PLATFORM_BILLING_OWNER_EMAIL.trim();
  const [settings] = await getDb().select({ billingEmail: platformSettings.billingEmail }).from(platformSettings).limit(1);
  return settings?.billingEmail || process.env.INVOICE_REPLY_TO || "billing@hearforyou.group";
}

export async function sendPlatformBillingEmail(input: {
  residencyId: string;
  email: OutboundEmail;
  idempotencyKey: string;
  emailKind: string;
  entityId?: string;
}) {
  const [residency, ownerBillingEmail] = await Promise.all([
    getResidencyLiveBillingApproval(input.residencyId),
    getOwnerBillingEmail(),
  ]);
  const routedEmail = routeOutboundEmailForLiveBillingApproval(input.email, {
    liveBillingApproved: residency.liveBillingApproved,
    ownerBillingEmail,
  });
  if (!residency.liveBillingApproved) {
    await logLiveBillingBlock({
      residencyId: input.residencyId,
      action: "platform_billing_email",
      entityType: "platform_billing_alert",
      entityId: input.entityId ?? input.residencyId,
      details: {
        emailKind: input.emailKind,
        intendedRecipient: input.email.to,
        reroutedTo: ownerBillingEmail,
      },
    });
  }
  return sendEmail(routedEmail, { idempotencyKey: input.idempotencyKey });
}
