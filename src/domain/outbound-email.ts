export type OutboundEmailEnvironment = Readonly<Record<string, string | undefined>>;

export type RoutableEmail = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
};

function recipientList(value?: string | string[]) {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

export function routeOutboundEmailForLiveBillingApproval<T extends RoutableEmail>(
  email: T,
  input: { liveBillingApproved: boolean; ownerBillingEmail: string },
): T {
  if (input.liveBillingApproved) return email;

  const ownerBillingEmail = input.ownerBillingEmail.trim();
  if (!/^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(ownerBillingEmail)) {
    throw new Error("A valid owner billing email is required while live billing is on hold.");
  }

  const intendedRecipients = [
    ...recipientList(email.to),
    ...recipientList(email.cc),
    ...recipientList(email.bcc),
  ];
  return {
    ...email,
    to: ownerBillingEmail,
    cc: undefined,
    bcc: undefined,
    subject: `[LIVE-BILLING HOLD for ${intendedRecipients.join(", ")}]${email.subject ? ` ${email.subject}` : ""}`,
  };
}

function appHostname(value?: string) {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isStagingEmailEnvironment(environment: OutboundEmailEnvironment) {
  return appHostname(environment.NEXT_PUBLIC_APP_URL) === "staging.hfy.app"
    || (environment.VERCEL_ENV === "preview" && environment.VERCEL_GIT_COMMIT_REF === "staging");
}

export function routeOutboundEmailForEnvironment<T extends RoutableEmail>(
  email: T,
  environment: OutboundEmailEnvironment,
): T {
  if (!isStagingEmailEnvironment(environment)) return email;

  const override = environment.STAGING_EMAIL_RECIPIENT_OVERRIDE?.trim();
  if (!override || !/^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(override)) {
    throw new Error(
      "STAGING_EMAIL_RECIPIENT_OVERRIDE must be one valid email address before staging can send email.",
    );
  }

  const intendedRecipients = [
    ...recipientList(email.to),
    ...recipientList(email.cc),
    ...recipientList(email.bcc),
  ];
  const routed = {
    ...email,
    to: override,
    cc: undefined,
    bcc: undefined,
  };
  if (email.subject) {
    routed.subject = `[STAGING for ${intendedRecipients.join(", ")}] ${email.subject}`;
  }
  return routed;
}
