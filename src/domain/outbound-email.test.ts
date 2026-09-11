import { describe, expect, it } from "vitest";
import { isStagingEmailEnvironment, routeOutboundEmailForEnvironment } from "@/domain/outbound-email";

const staging = {
  NEXT_PUBLIC_APP_URL: "https://staging.hfy.app",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "staging",
  STAGING_EMAIL_RECIPIENT_OVERRIDE: "billing@hearforyou.group",
};

describe("staging-wide outbound email safety", () => {
  it("recognizes the staging hostname or Vercel staging branch", () => {
    expect(isStagingEmailEnvironment(staging)).toBe(true);
    expect(isStagingEmailEnvironment({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
    })).toBe(true);
    expect(isStagingEmailEnvironment({
      NEXT_PUBLIC_APP_URL: "https://hfy.app",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
    })).toBe(false);
  });

  it("routes to, cc, and bcc recipients to the one staging inbox", () => {
    const routed = routeOutboundEmailForEnvironment({
      from: "HFY <billing@hearforyou.group>",
      to: ["hotel@example.com", "second@example.com"],
      cc: "copy@example.com",
      bcc: ["blind@example.com"],
      subject: "Test delivery",
      html: "<p>Test</p>",
    }, staging);

    expect(routed.to).toBe("billing@hearforyou.group");
    expect(routed.cc).toBeUndefined();
    expect(routed.bcc).toBeUndefined();
    expect(routed.subject).toBe(
      "[STAGING for hotel@example.com, second@example.com, copy@example.com, blind@example.com] Test delivery",
    );
  });

  it("fails closed on staging when the override is missing or is not one email address", () => {
    const email = { to: "hotel@example.com", subject: "Test", html: "<p>Test</p>" };
    expect(() => routeOutboundEmailForEnvironment(email, {
      NEXT_PUBLIC_APP_URL: "https://staging.hfy.app",
    })).toThrow(/STAGING_EMAIL_RECIPIENT_OVERRIDE/);
    expect(() => routeOutboundEmailForEnvironment(email, {
      ...staging,
      STAGING_EMAIL_RECIPIENT_OVERRIDE: "one@example.com,two@example.com",
    })).toThrow(/one valid email address/);
  });

  it("leaves non-staging delivery unchanged", () => {
    const email = { to: "hotel@example.com", subject: "Invoice", html: "<p>Invoice</p>" };
    expect(routeOutboundEmailForEnvironment(email, {
      NEXT_PUBLIC_APP_URL: "https://hfy.app",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
    })).toBe(email);
  });
});
