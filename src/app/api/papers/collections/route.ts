import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

/** Creates a collection. Body: { name, parentId? }. */
export async function POST(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim().slice(0, 200);
    if (!name) return Response.json({ error: "请填写集合名称" }, { status: 400 });

    const parentId = Number(body.parentId) || null;
    if (parentId && !(await prisma.paperCollection.findFirst({ where: { id: parentId, userId }, select: { id: true } }))) {
      return Response.json({ error: "找不到上级集合" }, { status: 404 });
    }
    // MySQL treats NULLs as distinct in a unique index, so top-level names are checked here.
    if (await prisma.paperCollection.findFirst({ where: { userId, parentId, name }, select: { id: true } })) {
      return Response.json({ error: "已经有同名的集合了" }, { status: 409 });
    }
    const collection = await prisma.paperCollection.create({ data: { userId, name, parentId }, select: { id: true, name: true, parentId: true } });
    return Response.json({ collection: { ...collection, count: 0 } }, { status: 201 });
  } catch (error) {
    return sessionError(error);
  }
}

/** DELETE /api/papers/collections?id=… — removes the collection, never the papers in it. */
export async function DELETE(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "无效的集合" }, { status: 400 });
    const { count } = await prisma.paperCollection.deleteMany({ where: { id, userId } });
    if (!count) return Response.json({ error: "找不到该集合" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
