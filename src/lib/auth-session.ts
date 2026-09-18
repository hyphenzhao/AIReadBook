import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { authSecret } from "@/lib/auth-secret";
import {
  COOKIE_NAME,
  SESSION_SECONDS,
  shouldRenew,
  signSessionToken,
  verifySessionToken,
  type SessionClaims,
} from "@/lib/session-token";

export { authSecret };

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

/** The id in a validly signed cookie. Does not check the account still exists. */
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

function deny(status: number, error: string): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A signed cookie stays valid for 30 days, so the account is looked up on
 * each request: deleting or disabling a user takes effect immediately.
 */
async function requireActiveUser() {
  const userId = await getSessionUserId();
  if (!userId) deny(401, "请先登录");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, disabled: true },
  });
  if (!user || user.disabled) deny(401, "账号不存在或已被停用");
  return user;
}

export async function requireSessionUserId(): Promise<number> {
  return (await requireActiveUser()).id;
}

export async function requireAdminUserId(): Promise<number> {
  const user = await requireActiveUser();
  if (user.role !== "ADMIN") deny(403, "需要管理员权限");
  return user.id;
}

export function sessionError(error: unknown) {
  if (error instanceof Response) return error;
  console.error(error);
  return Response.json({ error: "服务器处理请求失败" }, { status: 500 });
}
