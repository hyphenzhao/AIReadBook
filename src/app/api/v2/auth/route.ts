import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { clearSession, createSession, getSessionUserId } from "@/lib/auth-session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ user: null }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    await clearSession();
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "register") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const name = String(body.name || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
      }
      if (password.length < 8 || password.length > 128) {
        return NextResponse.json({ error: "密码长度必须为 8–128 个字符" }, { status: 400 });
      }
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return NextResponse.json({ error: "邮箱已注册" }, { status: 409 });
      const hashed = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({ data: { email, name: name.slice(0, 100) || email.split("@")[0], password: hashed } });
      await createSession(user.id);
      return NextResponse.json({ id: user.id, email: user.email, name: user.name });
    }

    if (action === "changePassword") {
      const userId = await getSessionUserId();
      const { oldPassword, newPassword } = body;
      if (!userId || !oldPassword || !newPassword) return NextResponse.json({ error: "缺少参数或登录已过期" }, { status: 400 });
      if (String(newPassword).length < 8 || String(newPassword).length > 128) {
        return NextResponse.json({ error: "新密码长度必须为 8–128 个字符" }, { status: 400 });
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

      let valid = false;
      if (user.password.startsWith("$2")) {
        valid = await bcrypt.compare(oldPassword, user.password);
      } else {
        valid = user.password === oldPassword;
      }
      if (!valid) return NextResponse.json({ error: "旧密码错误" }, { status: 401 });

      const hashed = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
      return NextResponse.json({ ok: true });
    }

    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
      let valid = false;
      if (user.password.startsWith("$2")) {
        valid = await bcrypt.compare(password, user.password);
      } else {
        valid = user.password === password;
      }
      if (!valid) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
      if (!user.password.startsWith("$2")) {
        await prisma.user.update({
          where: { id: user.id },
          data: { password: await bcrypt.hash(password, 10) },
        });
      }
      await createSession(user.id);
      return NextResponse.json({ id: user.id, email: user.email, name: user.name });
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
