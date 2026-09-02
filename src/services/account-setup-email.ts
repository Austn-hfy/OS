import { Resend } from "resend";
import { requiredEnv } from "@/lib/env";

type ResidencyAccountSetupEmailInput = {
  to: string;
  contactName: string;
  residencyName: string;
  setupUrl: string;
  idempotencyKey: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildResidencyAccountSetupEmail(input: Omit<ResidencyAccountSetupEmailInput, "to" | "idempotencyKey">) {
  const contactName = escapeHtml(input.contactName);
  const residencyName = escapeHtml(input.residencyName);
  const setupUrl = escapeHtml(input.setupUrl);

  return {
    subject: `Set up your ${input.residencyName} HFY OS account`,
    html: [
      `<p>Hi ${contactName},</p>`,
      `<p>Your HFY OS access for <strong>${residencyName}</strong> is ready.</p>`,
      `<p><a href="${setupUrl}">Set up your account</a></p>`,
      "<p>This private, one-time link expires in 7 days. If you were not expecting it, you can ignore this email.</p>",
      "<p>Hear For You</p>",
    ].join(""),
  };
}

export async function sendResidencyAccountSetupEmail(input: ResidencyAccountSetupEmailInput) {
  const resend = new Resend(requiredEnv("RESEND_API_KEY"));
  const content = buildResidencyAccountSetupEmail(input);
  const result = await resend.emails.send({
    from: process.env.ACCOUNT_ACCESS_FROM_EMAIL || requiredEnv("INVOICE_FROM_EMAIL"),
    to: input.to,
    replyTo: process.env.ACCOUNT_ACCESS_REPLY_TO || process.env.INVOICE_REPLY_TO || "support@hearforyou.group",
    subject: content.subject,
    html: content.html,
  }, { idempotencyKey: input.idempotencyKey });

  if (result.error) throw new Error(result.error.message);
  return { providerMessageId: result.data?.id ?? null };
}
