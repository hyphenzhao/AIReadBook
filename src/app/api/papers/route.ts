import type { PaperStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { PAPER_SELECT, paperView } from "@/lib/papers/view";

const STATUSES: PaperStatus[] = ["UNREAD", "READING", "READ"];

/**
 * The user's papers. Filters: `q` (title, author, venue, abstract), `status`,
 * `collectionId`, `tagId`, `year`. Also returns the collections and tags that
 * exist, so the library page needs one request.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const params = new URL(req.url).searchParams;
    const q = params.get("q")?.trim();
    const status = params.get("status") as PaperStatus | null;
    const collectionId = Number(params.get("collectionId"));
    const tagId = Number(params.get("tagId"));
    const year = Number(params.get("year"));

    const where: Prisma.PaperWhereInput = { userId };
    if (status && STATUSES.includes(status)) where.status = status;
    if (Number.isInteger(collectionId) && collectionId > 0) where.collections = { some: { collectionId } };
    if (Number.isInteger(tagId) && tagId > 0) where.tags = { some: { tagId } };
    if (Number.isInteger(year) && year > 0) where.year = year;
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { abstract: { contains: q } },
        { venue: { contains: q } },
        { doi: { contains: q } },
        // authors is a JSON array of strings
        { authors: { string_contains: q } },
      ];
    }

    const [papers, collections, tags] = await Promise.all([
      prisma.paper.findMany({ where, orderBy: { createdAt: "desc" }, take: 1000, select: PAPER_SELECT }),
      prisma.paperCollection.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, parentId: true, _count: { select: { items: true } } },
      }),
      prisma.tag.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, _count: { select: { papers: true } } },
      }),
    ]);

    return Response.json({
      papers: papers.map(paperView),
      collections: collections.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, count: c._count.items })),
      tags: tags.map((t) => ({ id: t.id, name: t.name, count: t._count.papers })),
    });
  } catch (error) {
    return sessionError(error);
  }
}
