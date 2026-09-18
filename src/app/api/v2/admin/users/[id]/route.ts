import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminUserId, sessionError } from "@/lib/auth-session";
import { normalizeEmail, passwordProblem, PUBLIC_USER_FIELDS } from "@/lib/user-validation";

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** True when `userId` is the only account that can still administer the site. */
async function isLastActiveAdmin(userId: number) {
  const others = await prisma.user.count({
    where: { role: "ADMIN", disabled: false, id: { not: userId } },
  });
  return others === 0;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const adminId = await requireAdminUserId();
    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ error: "无效的用户 ID" }, { status: 400 });
    const body = await req.json().catch(() => ({}));

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, disabled: true } });
    if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    const data: Prisma.UserUpdateInput = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 100);
      if (!name) return NextResponse.json({ error: "显示名称不能为空" }, { status: 400 });
      data.name = name;
    }
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (!email) return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
      const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (clash && clash.id !== id) return NextResponse.json({ error: "邮箱已被其他账号使用" }, { status: 409 });
      data.email = email;
    }
    if (body.password !== undefined) {
      const problem = passwordProblem(body.password);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      data.password = await bcrypt.hash(String(body.password), 10);
    }

    const demoting = body.role !== undefined && body.role !== "ADMIN" && target.role === "ADMIN";
    const disabling = body.disabled === true && !target.disabled;
    if (demoting || disabling) {
      if (id === adminId) {
        return NextResponse.json({ error: "不能停用自己或取消自己的管理员权限" }, { status: 400 });
      }
      if (target.role === "ADMIN" && !target.disabled && (await isLastActiveAdmin(id))) {
        return NextResponse.json({ error: "至少需要保留一个可用的管理员" }, { status: 400 });
      }
    }
    if (body.role !== undefined) data.role = body.role === "ADMIN" ? "ADMIN" : "USER";
    if (body.disabled !== undefined) data.disabled = body.disabled === true;

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { ...PUBLIC_USER_FIELDS, _count: { select: { books: true } } },
    });
    const { _count, ...rest } = user;
    return NextResponse.json({ user: { ...rest, bookCount: _count.books } });
  } catch (error) {
    return sessionError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const adminId = await requireAdminUserId();
    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ error: "无效的用户 ID" }, { status: 400 });
    if (id === adminId) return NextResponse.json({ error: "不能删除自己的账号" }, { status: 400 });

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, disabled: true } });
    if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    if (target.role === "ADMIN" && !target.disabled && (await isLastActiveAdmin(id))) {
      return NextResponse.json({ error: "至少需要保留一个可用的管理员" }, { status: 400 });
    }

    // Cascades to the user's books, chapters, annotations, chats and review cards.
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
