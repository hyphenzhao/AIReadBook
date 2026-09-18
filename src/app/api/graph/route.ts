import type { GraphScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

const MAX_NODES = 600;

/**
 * The user's knowledge graph. `?scope=BOOK|PAPER` (default BOOK); `?bookId=`
 * narrows it to what one book contributed. Large graphs are cut to the
 * best-supported nodes, since nobody can read 5000 labels at once.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const params = new URL(req.url).searchParams;
    const scope: GraphScope = params.get("scope") === "PAPER" ? "PAPER" : "BOOK";
    const bookId = Number(params.get("bookId"));
    const byBook = Number.isInteger(bookId) && bookId > 0;

    const nodes = await prisma.graphNode.findMany({
      where: { userId, scope, ...(byBook ? { mentions: { some: { bookId } } } : {}) },
      select: {
        id: true, type: true, name: true, description: true,
        _count: { select: { mentions: true, outEdges: true, inEdges: true } },
        mentions: { select: { bookId: true }, distinct: ["bookId"] },
      },
    });
    const ranked = nodes
      .map((node) => ({ node, weight: node._count.mentions + node._count.outEdges + node._count.inEdges }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_NODES);
    const kept = new Set(ranked.map(({ node }) => node.id));

    const edges = await prisma.graphEdge.findMany({
      where: { userId, scope, srcId: { in: [...kept] }, dstId: { in: [...kept] } },
      select: { id: true, srcId: true, dstId: true, relation: true, weight: true },
    });
    const books = await prisma.book.findMany({
      where: { userId, graphMentions: { some: {} } },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    });

    return Response.json({
      nodes: ranked.map(({ node }) => ({
        id: node.id, type: node.type, name: node.name, description: node.description,
        mentions: node._count.mentions,
        bookIds: node.mentions.map((m) => m.bookId).filter((id): id is number => id !== null),
      })),
      edges,
      books: books.map((book) => ({ id: book.id, title: book.title })),
      truncated: nodes.length > kept.size,
      total: nodes.length,
    });
  } catch (error) {
    return sessionError(error);
  }
}
