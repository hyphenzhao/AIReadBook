import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "register") {
      const { email, password, name } = body;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return NextResponse.json({ error: "邮箱已注册" }, { status: 409 });
      const hashed = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({ data: { email, name: name || email.split("@")[0], password: hashed } });
      return NextResponse.json({ id: user.id, email: user.email, name: user.name });
    }

    if (action === "changePassword") {
      const { userId, oldPassword, newPassword } = body;
      if (!userId || !oldPassword || !newPassword) return NextResponse.json({ error: "缺少参数" }, { status: 400 });
      const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
      if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

      let valid = false;
      if (user.password.startsWith("$2")) {
        valid = await bcrypt.compare(oldPassword, user.password);
      } else {
        valid = user.password === oldPassword;
      }
      if (!valid) return NextResponse.json({ error: "旧密码错误" }, { status: 401 });

      const hashed = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { id: parseInt(userId) }, data: { password: hashed } });
      return NextResponse.json({ ok: true });
    }

    if (action === "login") {
      const { email, password } = body;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 401 });
      let valid = false;
      if (user.password.startsWith("$2")) {
        valid = await bcrypt.compare(password, user.password);
      } else {
        valid = user.password === password;
      }
      if (!valid) return NextResponse.json({ error: "密码错误" }, { status: 401 });
      return NextResponse.json({ id: user.id, email: user.email, name: user.name });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) {
    console.error("Auth error:", e);
    return NextResponse.json({ error: e?.message || "Auth service error" }, { status: 500 });
  }
}
