import { hkdfSync } from "node:crypto";
import { hashPublicCalendarToken } from "@/domain/public-calendar";
import { decryptSensitiveField, encryptSensitiveField } from "@/lib/field-encryption";

const KEY_CONTEXT = "hfy-os/public-calendar-links/v1";

function calendarTokenKey(encodedRootKey = process.env.TALENT_PAYMENT_ENCRYPTION_KEY): string {
  if (!encodedRootKey) throw new Error("Calendar link encryption is not configured.");
  const rootKey = Buffer.from(encodedRootKey, "base64");
  if (rootKey.length !== 32) throw new Error("Calendar link encryption is not configured correctly.");
  return Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), KEY_CONTEXT, 32)).toString("base64");
}

export function encryptPublicCalendarToken(token: string, encodedRootKey?: string): string {
  hashPublicCalendarToken(token);
  return encryptSensitiveField(token, calendarTokenKey(encodedRootKey));
}

export function decryptPublicCalendarToken(ciphertext: string, expectedHash: string, encodedRootKey?: string): string {
  const token = decryptSensitiveField(ciphertext, calendarTokenKey(encodedRootKey));
  if (hashPublicCalendarToken(token) !== expectedHash) throw new Error("The stored calendar link could not be verified.");
  return token;
}
