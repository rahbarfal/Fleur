import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/*
 * AES-256-GCM for Google tokens at rest (and the short-lived OAuth cookie).
 * Key: GMAIL_TOKEN_KEY, 32 random bytes in base64 (`openssl rand -base64 32`).
 * Format: "v1.<iv>.<tag>.<ciphertext>" (base64url). GCM also detects tampering.
 */

function key(): Buffer {
  const raw = process.env.GMAIL_TOKEN_KEY;
  if (!raw) throw new Error("GMAIL_TOKEN_KEY is not set (see .env.example).");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("GMAIL_TOKEN_KEY must be 32 bytes in base64 (openssl rand -base64 32).");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Throws when the value was tampered with or encrypted with another key. */
export function decrypt(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || data === undefined) throw new Error("Unreadable encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
