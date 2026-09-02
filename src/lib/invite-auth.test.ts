import { describe, expect, it } from "vitest";
import { inviteCallbackUrl, inviteSessionTokensFromHash } from "@/lib/invite-auth";

describe("Residency invitation authentication", () => {
  it("reads the one-time Supabase session from an invitation URL fragment", () => {
    expect(inviteSessionTokensFromHash("#access_token=access-value&refresh_token=refresh-value&type=invite"))
      .toEqual({ access_token: "access-value", refresh_token: "refresh-value" });
  });

  it("rejects incomplete invitation fragments", () => {
    expect(inviteSessionTokensFromHash("#access_token=access-value&type=invite")).toBeNull();
    expect(inviteSessionTokensFromHash("")).toBeNull();
  });

  it("sends PKCE invitations through the server callback before password setup", () => {
    expect(inviteCallbackUrl("https://hfy.app", "one-time-code"))
      .toBe("https://hfy.app/auth/callback?code=one-time-code&next=%2Freset-password");
  });
});
