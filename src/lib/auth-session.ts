import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  SESSION_SECONDS,
  shouldRenew,
  signSessionToken,
  verifySessionToken,
  type SessionClaims,
} from "@/lib/session-token";

/**
 * The signing secret must be its own value. It used to fall back to
 * DATABASE_URL, which meant any change to the connection string silently
 * logged every user out.
 */
export function authSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET is required (at least 16 characters)");
  }
  return value;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge,
  };
}

export async function createSession(userId: number) {
  const { token } = await signSessionToken(userId, authSecret());
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, cookieOptions(SESSION_SECONDS));
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", cookieOptions(0));
}

async function getSessionClaims(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(COOKIE_NAME)?.value, authSecret());
}

export async function getSessionUserId(): Promise<number | null> {
  return (await getSessionClaims())?.userId ?? null;
}

/**
 * Sliding expiry: call from a route handler that is hit on every page load.
 * Returns the user id, re-issuing the cookie when it is past half its life.
 */
export async function getSessionUserIdAndRenew(): Promise<number | null> {
  const claims = await getSessionClaims();
  if (!claims) return null;
  if (shouldRenew(claims)) await createSession(claims.userId);
  return claims.userId;
}

export async function requireSessionUserId(): Promise<number> {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new Response(JSON.stringify({ error: "请先登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return userId;
}

export function sessionError(error: unknown) {
  if (error instanceof Response) return error;
  console.error(error);
  return Response.json({ error: "服务器处理请求失败" }, { status: 500 });
}
