import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "aireadbook_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function secret() {
  const value = process.env.AUTH_SECRET || process.env.DATABASE_URL;
  if (!value) {
    throw new Error("AUTH_SECRET is required");
  }
  return value;
}

function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export async function createSession(userId: number) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${userId}.${expires}`;
  const token = `${payload}.${signature(payload)}`;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUserId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [rawId, rawExpires, suppliedSignature] = token.split(".");
  const userId = Number(rawId);
  const expires = Number(rawExpires);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isFinite(expires)) return null;
  if (expires <= Math.floor(Date.now() / 1000) || !suppliedSignature) return null;

  const expected = signature(`${rawId}.${rawExpires}`);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length) return null;
  return timingSafeEqual(suppliedBuffer, expectedBuffer) ? userId : null;
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
