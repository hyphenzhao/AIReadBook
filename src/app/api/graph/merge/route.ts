import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { mergeNodes } from "@/lib/knowledge/graph-extract";

/** Folds one node into another of the same type. Body: { fromId, intoId }. */
export async function POST(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const body = await req.json().catch(() => ({}));
    const fromId = Number(body.fromId);
    const intoId = Number(body.intoId);
    if (![fromId, intoId].every((id) => Number.isInteger(id) && id > 0)) {
      return Response.json({ error: "缺少节点" }, { status: 400 });
    }
    const result = await mergeNodes(userId, fromId, intoId);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
