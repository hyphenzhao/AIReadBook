import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { getAISettingsView } from "@/lib/ai/user-llm";
import { enqueueGraphExtraction } from "@/lib/knowledge/graph-extract";
import { jobView } from "@/lib/jobs/queue";

/** Queues "add this chapter to my knowledge graph". Body: { chapterId }. Poll /api/jobs/:id. */
export async function POST(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const body = await req.json().catch(() => ({}));
    const chapterId = Number(body.chapterId);
    const chapter = Number.isInteger(chapterId) && chapterId > 0
      ? await prisma.chapter.findFirst({ where: { id: chapterId, book: { userId } }, select: { id: true, content: true } })
      : null;
    if (!chapter) return Response.json({ error: "找不到该章节" }, { status: 404 });
    if (chapter.content.trim().length < 80) return Response.json({ error: "本章内容太短，没有可抽取的知识" }, { status: 422 });
    // Fail now rather than inside the job, where the reader would not see why.
    if (!(await getAISettingsView(userId)).ready) {
      return Response.json({ error: "请先在「设置 → AI 设置」中填写 API Key" }, { status: 412 });
    }
    return Response.json({ job: jobView(await enqueueGraphExtraction(chapter.id, userId)) }, { status: 202 });
  } catch (error) {
    return sessionError(error);
  }
}
