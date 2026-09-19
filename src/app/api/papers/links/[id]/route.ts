import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

/**
 * Rejects a suggested relation. The row is kept and marked dismissed, so that
 * recomputing links does not bring the same suggestion back.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireSessionUserId();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "无效的关联" }, { status: 400 });
    const { count } = await prisma.paperLink.updateMany({ where: { id, userId }, data: { dismissed: true } });
    if (!count) return Response.json({ error: "找不到该关联" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
