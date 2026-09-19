import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { getAISettingsView } from "@/lib/ai/user-llm";
import { enqueuePaperAnalysis } from "@/lib/papers/ingest";
import { jobView } from "@/lib/jobs/queue";

type Params = { params: Promise<{ id: string }> };

async function owned(userId: number, raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.paper.findFirst({ where: { id, userId }, select: { id: true, pipelineStage: true } });
}

/** The structured reading of a paper, and how it relates to the rest of the library. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const paper = await owned(userId, (await params).id);
    if (!paper) return Response.json({ error: "找不到该文献" }, { status: 404 });

    const [analysis, links] = await Promise.all([
      prisma.paperAnalysis.findUnique({ where: { paperId: paper.id } }),
      prisma.paperLink.findMany({
        where: { userId, dismissed: false, OR: [{ paperAId: paper.id }, { paperBId: paper.id }] },
        orderBy: { score: "desc" },
        include: {
          paperA: { select: { id: true, title: true, year: true, authors: true } },
          paperB: { select: { id: true, title: true, year: true, authors: true } },
        },
      }),
    ]);

    return Response.json({
      analysis: analysis ? { data: analysis.data, model: analysis.model, createdAt: analysis.createdAt } : null,
      links: links.map((link) => {
        const other = link.paperAId === paper.id ? link.paperB : link.paperA;
        return {
          id: link.id, type: link.type, score: link.score, origin: link.origin, evidence: link.evidence,
          other: { id: other.id, title: other.title, year: other.year, authors: Array.isArray(other.authors) ? other.authors : [] },
        };
      }),
    });
  } catch (error) {
    return sessionError(error);
  }
}

/** Re-reads the paper with the AI and refreshes its links. Poll /api/jobs/:id. */
export async function POST(_req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const paper = await owned(userId, (await params).id);
    if (!paper) return Response.json({ error: "找不到该文献" }, { status: 404 });
    if ((await prisma.chunk.count({ where: { paperId: paper.id }, take: 1 })) === 0) {
      return Response.json({ error: "这篇文献的文字还没有提取出来，暂时无法精读" }, { status: 409 });
    }
    if (!(await getAISettingsView(userId)).ready) {
      return Response.json({ error: "请先在「设置 → AI 设置」中填写 API Key" }, { status: 412 });
    }
    return Response.json({ job: jobView(await enqueuePaperAnalysis(paper.id, userId)) }, { status: 202 });
  } catch (error) {
    return sessionError(error);
  }
}
