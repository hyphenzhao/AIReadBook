import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { pruneGraph } from "@/lib/knowledge/graph-extract";

type Params = { params: Promise<{ id: string }> };

const parseId = (raw: string) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** A node with the passages that mention it and the relations it takes part in. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const id = parseId((await params).id);
    const node = id
      ? await prisma.graphNode.findFirst({
          where: { id, userId },
          select: {
            id: true, type: true, name: true, description: true, scope: true,
            aliases: { select: { normAlias: true } },
            mentions: {
              orderBy: [{ bookId: "asc" }, { chapterId: "asc" }],
              take: 200,
              select: {
                id: true, quote: true, confidence: true, page: true,
                paper: { select: { id: true, title: true } },
                book: { select: { id: true, title: true } },
                chapter: { select: { id: true, index: true, title: true } },
                chunk: { select: { charStart: true, charEnd: true } },
              },
            },
            outEdges: { select: { id: true, relation: true, weight: true, dst: { select: { id: true, name: true, type: true } } } },
            inEdges: { select: { id: true, relation: true, weight: true, src: { select: { id: true, name: true, type: true } } } },
          },
        })
      : null;
    if (!node) return Response.json({ error: "节点不存在" }, { status: 404 });

    return Response.json({
      node: {
        id: node.id, type: node.type, name: node.name, description: node.description,
        aliases: node.aliases.map((a) => a.normAlias),
        mentions: node.mentions.map((m) => ({
          id: m.id,
          quote: m.quote,
          verified: m.confidence >= 1,
          bookId: m.book?.id ?? null,
          bookTitle: m.book?.title ?? null,
          paperId: m.paper?.id ?? null,
          paperTitle: m.paper?.title ?? null,
          page: m.page,
          chapterId: m.chapter?.id ?? null,
          chapterLabel: m.chapter ? m.chapter.title?.trim() || `第${m.chapter.index + 1}章` : null,
          charStart: m.chunk?.charStart ?? null,
          charEnd: m.chunk?.charEnd ?? null,
        })),
        relations: [
          ...node.outEdges.map((e) => ({ edgeId: e.id, direction: "out" as const, relation: e.relation, weight: e.weight, other: e.dst })),
          ...node.inEdges.map((e) => ({ edgeId: e.id, direction: "in" as const, relation: e.relation, weight: e.weight, other: e.src })),
        ],
      },
    });
  } catch (error) {
    return sessionError(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const id = parseId((await params).id);
    const node = id ? await prisma.graphNode.findFirst({ where: { id, userId }, select: { scope: true } }) : null;
    if (!node) return Response.json({ error: "节点不存在" }, { status: 404 });
    await prisma.graphNode.delete({ where: { id: id! } }); // cascades to its edges, aliases and mentions
    await pruneGraph(userId, node.scope);
    return Response.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
