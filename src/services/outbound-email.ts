import "server-only";

import { Resend, type CreateEmailOptions, type CreateEmailRequestOptions } from "resend";
import { routeOutboundEmailForEnvironment } from "@/domain/outbound-email";
import { requiredEnv } from "@/lib/env";

export async function sendEmail(email: CreateEmailOptions, options?: CreateEmailRequestOptions) {
  const routedEmail = routeOutboundEmailForEnvironment(email, process.env);
  const resend = new Resend(requiredEnv("RESEND_API_KEY"));
  return resend.emails.send(routedEmail, options);
}
