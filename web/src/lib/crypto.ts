import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function secret(): Buffer {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET is not set");
  }
  return createHash("sha256").update(value).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string | null {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) return null;

  try {
    const decipher = createDecipheriv("aes-256-gcm", secret(), Buffer.from(ivPart, "base64"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function maskKey(key: string): string {
  if (key.length <= 12) return "••••";
  return `${key.slice(0, 7)}••••${key.slice(-4)}`;
}
