import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function encryptionKey(encoded = process.env.TALENT_PAYMENT_ENCRYPTION_KEY) {
  if (!encoded) throw new Error("TALENT_PAYMENT_ENCRYPTION_KEY is required to import ACH details.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("TALENT_PAYMENT_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptSensitiveField(plaintext: string, encodedKey?: string) {
  if (!plaintext) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encodedKey), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSensitiveField(payload: string, encodedKey?: string) {
  if (!payload) return "";
  const [version, ivValue, tagValue, encryptedValue] = payload.split(":");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) throw new Error("Unsupported encrypted field payload.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(encodedKey), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]).toString("utf8");
}
