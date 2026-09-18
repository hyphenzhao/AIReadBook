/**
 * Session token format shared by the Node route handlers (auth-session.ts)
 * and the Edge middleware. Only Web Crypto is used here so the file is safe
 * to import from either runtime.
 *
 *   <userId>.<unixExpiry>.<HMAC-SHA256 base64url>
 */

export const COOKIE_NAME = "aireadbook_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 30;
/** Re-issue the cookie once less than this much lifetime is left. */
export const RENEW_BELOW_SECONDS = SESSION_SECONDS / 2;

export interface SessionClaims {
  userId: number;
  expires: number;
}

function toBase64Url(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: KeyUsage) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signSessionToken(userId: number, secret: string, now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = `${userId}.${expires}`;
  const key = await hmacKey(secret, "sign");
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return { token: `${payload}.${toBase64Url(signature)}`, expires };
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<SessionClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawId, rawExpires, rawSignature] = parts;
  const userId = Number(rawId);
  const expires = Number(rawExpires);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(expires)) return null;
  if (expires <= Math.floor(now / 1000)) return null;

  const signature = fromBase64Url(rawSignature);
  if (!signature) return null;
  const key = await hmacKey(secret, "verify");
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(`${rawId}.${rawExpires}`),
  );
  return valid ? { userId, expires } : null;
}

export function shouldRenew(claims: SessionClaims, now = Date.now()) {
  return claims.expires - Math.floor(now / 1000) < RENEW_BELOW_SECONDS;
}
