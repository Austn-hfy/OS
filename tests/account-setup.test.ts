import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import * as setupRoute from "@/app/api/auth/setup-account/route";
import {
  buildAccountSetupUrl,
  hashAccountSetupToken,
  issueAccountSetupToken,
} from "@/domain/account-setup";
import { completeAccountSetup } from "@/services/account-setup";

describe("account setup credentials", () => {
  it("keeps the credential in the URL fragment so GET requests and scanners never receive it", () => {
    const issued = issueAccountSetupToken(new Date("2026-08-29T12:00:00Z"));
    const url = new URL(buildAccountSetupUrl("https://hfy.app", issued.token));

    expect(url.pathname).toBe("/setup-account");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe(issued.token);
    expect(issued.tokenHash).toBe(hashAccountSetupToken(issued.token));
    expect(issued.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("exposes no GET mutation handler; only POST can attempt token consumption", () => {
    expect("GET" in setupRoute).toBe(false);
    expect(typeof setupRoute.POST).toBe("function");
  });

  it("does not reach into Supabase's protected auth schema during setup", async () => {
    const source = await readFile(new URL("../src/services/account-setup.ts", import.meta.url), "utf8");
    expect(source).not.toContain("auth.sessions");
  });

  it("consumes a valid token exactly once during successful password completion", async () => {
    const issued = issueAccountSetupToken();
    let available = true;
    const consume = vi.fn(async (tokenHash: string) => {
      expect(tokenHash).toBe(issued.tokenHash);
      if (!available) return null;
      available = false;
      return { email: "manager@example.test" };
    });

    await expect(completeAccountSetup(
      { token: issued.token, password: "a-secure-password" },
      { consume },
    )).resolves.toEqual({ status: "success", email: "manager@example.test" });
    await expect(completeAccountSetup(
      { token: issued.token, password: "another-secure-password" },
      { consume },
    )).resolves.toEqual({ status: "invalid" });
    expect(consume).toHaveBeenCalledTimes(2);
  });
});
