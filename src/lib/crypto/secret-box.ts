import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";
import { authSecret } from "@/lib/auth-session";

/**
 * Encrypts small secrets (provider API keys) before they are stored in MySQL.
 * AES-256-GCM with a key derived from AUTH_SECRET, so a database dump alone
 * does not expose them. Rotating AUTH_SECRET makes stored values unreadable;
 * `openSecret` then returns null and the user is asked to enter the key again.
 */

const PREFIX = "enc:v1:";

function key(purpose: string) {
  return Buffer.from(hkdfSync("sha256", authSecret(), "aireadbook", purpose, 32));
}

export function isSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function sealSecret(plain: string, purpose: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(":");
}

export function openSecret(sealed: string, purpose: string): string | null {
  if (!isSealed(sealed)) return null;
  try {
    const [iv, tag, body] = sealed.slice(PREFIX.length).split(":").map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key(purpose), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** "sk-abc…wxyz": enough to recognise a key, useless to anyone who sees it. */
export function maskSecret(plain: string) {
  if (plain.length <= 8) return "••••";
  return `${plain.slice(0, 3)}…${plain.slice(-4)}`;
}
