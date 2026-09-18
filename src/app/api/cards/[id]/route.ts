import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireSessionUserId();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "无效的卡片" }, { status: 400 });
    // deleteMany so that the ownership check and the delete are one statement.
    const { count } = await prisma.knowledgeCard.deleteMany({ where: { id, userId } });
    if (!count) return Response.json({ error: "卡片不存在" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
