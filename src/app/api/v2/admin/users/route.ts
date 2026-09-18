import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdminUserId, sessionError } from "@/lib/auth-session";
import { normalizeEmail, normalizeName, passwordProblem, PUBLIC_USER_FIELDS } from "@/lib/user-validation";

export async function GET() {
  try {
    await requireAdminUserId();
    const users = await prisma.user.findMany({
      select: { ...PUBLIC_USER_FIELDS, _count: { select: { books: true } } },
      orderBy: { id: "asc" },
    });
    return NextResponse.json({
      users: users.map(({ _count, ...user }) => ({ ...user, bookCount: _count.books })),
    });
  } catch (error) {
    return sessionError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = await req.json().catch(() => ({}));

    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
    const problem = passwordProblem(body.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (await prisma.user.findUnique({ where: { email } })) {
      return NextResponse.json({ error: "邮箱已注册" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: normalizeName(body.name, email),
        password: await bcrypt.hash(String(body.password), 10),
        role: body.role === "ADMIN" ? "ADMIN" : "USER",
      },
      select: PUBLIC_USER_FIELDS,
    });
    return NextResponse.json({ user: { ...user, bookCount: 0 } }, { status: 201 });
  } catch (error) {
    return sessionError(error);
  }
}
