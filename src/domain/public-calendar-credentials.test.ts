import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptPublicCalendarToken, encryptPublicCalendarToken } from "./public-calendar-credentials";
import { issuePublicCalendarToken } from "./public-calendar";

describe("reusable public calendar credentials", () => {
  it("round-trips a token with a domain-separated key without storing plaintext", () => {
    const rootKey = randomBytes(32).toString("base64");
    const issued = issuePublicCalendarToken();
    const ciphertext = encryptPublicCalendarToken(issued.token, rootKey);
    expect(ciphertext).toMatch(/^v1:/);
    expect(ciphertext).not.toContain(issued.token);
    expect(decryptPublicCalendarToken(ciphertext, issued.tokenHash, rootKey)).toBe(issued.token);
  });

  it("rejects a mismatched hash, wrong key, malformed token, and missing configuration", () => {
    const rootKey = randomBytes(32).toString("base64");
    const issued = issuePublicCalendarToken();
    const ciphertext = encryptPublicCalendarToken(issued.token, rootKey);
    expect(() => decryptPublicCalendarToken(ciphertext, "f".repeat(64), rootKey)).toThrow(/verified/);
    expect(() => decryptPublicCalendarToken(ciphertext, issued.tokenHash, randomBytes(32).toString("base64"))).toThrow();
    expect(() => encryptPublicCalendarToken("not-a-token", rootKey)).toThrow(/Invalid public calendar token/);
    expect(() => encryptPublicCalendarToken(issued.token, "invalid")).toThrow(/configured correctly/);
    expect(() => encryptPublicCalendarToken(issued.token, "")).toThrow(/not configured/);
  });
});
