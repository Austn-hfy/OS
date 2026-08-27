import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSensitiveField, encryptSensitiveField } from "./field-encryption";

describe("sensitive field encryption", () => {
  it("round-trips an ACH value without embedding plaintext", () => {
    const key = randomBytes(32).toString("base64");
    const encrypted = encryptSensitiveField("123456789", key);
    expect(encrypted).not.toContain("123456789");
    expect(decryptSensitiveField(encrypted, key)).toBe("123456789");
  });

  it("rejects the wrong key", () => {
    const encrypted = encryptSensitiveField("123456789", randomBytes(32).toString("base64"));
    expect(() => decryptSensitiveField(encrypted, randomBytes(32).toString("base64"))).toThrow();
  });
});
