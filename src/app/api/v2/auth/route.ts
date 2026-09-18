import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { clearSession, createSession, getSessionUserId, getSessionUserIdAndRenew } from "@/lib/auth-session";
import { getAppSettings } from "@/lib/app-settings";
import { AttemptLimiter } from "@/lib/rate-limit";
import { normalizeEmail, normalizeName, passwordProblem } from "@/lib/user-validation";

const SESSION_USER_FIELDS = { id: true, email: true, name: true, role: true, disabled: true } as const;

// 10 wrong passwords per address+email per 15 minutes.
const loginLimiter = new AttemptLimiter(10, 15 * 60 * 1000);

function clientKey(req: NextRequest, email: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  return `${ip}|${email}`;
}

export async function GET() {
  try {
    // Hit on every page load, so this is where the 30-day session slides.
    const userId = await getSessionUserIdAndRenew();
    if (!userId) return NextResponse.json({ user: null }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: SESSION_USER_FIELDS });
    if (!user || user.disabled) {
      await clearSession();
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    // A database hiccup is not a logout: 503 tells the client to keep its
    // state and retry, where 401 means the session is really gone.
    console.error("Session check failed:", e);
    return NextResponse.json({ error: "认证服务暂时不可用" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "register") {
      // An empty instance lets its first visitor in as the admin; after that
      // registration is closed unless an admin opens it.
      const isFirstUser = (await prisma.user.count()) === 0;
      if (!isFirstUser && !(await getAppSettings()).allowRegistration) {
        return NextResponse.json({ error: "本站未开放注册，请联系管理员创建账号" }, { status: 403 });
      }
      const email = normalizeEmail(body.email);
      if (!email) return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
      const problem = passwordProblem(body.password);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return NextResponse.json({ error: "邮箱已注册" }, { status: 409 });
      const user = await prisma.user.create({
        data: {
          email,
          name: normalizeName(body.name, email),
          password: await bcrypt.hash(String(body.password), 10),
          role: isFirstUser ? "ADMIN" : "USER",
          lastLoginAt: new Date(),
        },
      });
      await createSession(user.id);
      return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    }

    if (action === "changePassword") {
      const userId = await getSessionUserId();
      const { oldPassword, newPassword } = body;
      if (!userId) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
      if (!oldPassword || !newPassword) return NextResponse.json({ error: "请填写旧密码和新密码" }, { status: 400 });
      const problem = passwordProblem(newPassword);
      if (problem) return NextResponse.json({ error: `新${problem}` }, { status: 400 });
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.disabled) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      if (!(await bcrypt.compare(String(oldPassword), user.password))) {
        return NextResponse.json({ error: "旧密码错误" }, { status: 400 });
      }
      await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(String(newPassword), 10) } });
      return NextResponse.json({ ok: true });
    }

    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });

      const key = clientKey(req, email);
      const wait = loginLimiter.retryAfter(key);
      if (wait) {
        return NextResponse.json(
          { error: `尝试次数过多，请 ${Math.ceil(wait / 60)} 分钟后再试` },
          { status: 429, headers: { "Retry-After": String(wait) } },
        );
      }

      const user = await prisma.user.findUnique({ where: { email } });
      // bcrypt.compare simply fails for anything that is not a bcrypt hash.
      if (!user || !(await bcrypt.compare(password, user.password))) {
        loginLimiter.fail(key);
        return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
      }
      if (user.disabled) return NextResponse.json({ error: "账号已被停用，请联系管理员" }, { status: 403 });

      loginLimiter.succeed(key);
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await createSession(user.id);
      return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    }

    if (action === "logout") {
      await clearSession();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) {
    console.error("Auth error:", e);
    return NextResponse.json({ error: "认证服务暂时不可用" }, { status: 500 });
  }
}
