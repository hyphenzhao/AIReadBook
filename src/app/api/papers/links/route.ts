import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { LINK_TYPES } from "@/lib/papers/links";

/**
 * The library as a graph of papers: every paper, and every (not dismissed)
 * relation between two of them. `?collectionId=` narrows it to one collection.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const collectionId = Number(new URL(req.url).searchParams.get("collectionId"));
    const inCollection = Number.isInteger(collectionId) && collectionId > 0;

    const papers = await prisma.paper.findMany({
      where: { userId, ...(inCollection ? { collections: { some: { collectionId } } } : {}) },
      select: { id: true, title: true, year: true, authors: true, status: true },
      orderBy: { year: "desc" },
    });
    const ids = papers.map((paper) => paper.id);
    const links = await prisma.paperLink.findMany({
      where: { userId, dismissed: false, paperAId: { in: ids }, paperBId: { in: ids } },
      select: { id: true, paperAId: true, paperBId: true, type: true, score: true, origin: true, evidence: true },
    });
    const collections = await prisma.paperCollection.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } });

    return Response.json({
      papers: papers.map((p) => ({ ...p, authors: Array.isArray(p.authors) ? (p.authors as string[]) : [] })),
      links,
      collections,
    });
  } catch (error) {
    return sessionError(error);
  }
}

/** A relation the reader asserts by hand. Body: { paperAId, paperBId, type, note? }. */
export async function POST(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const body = await req.json().catch(() => ({}));
    const a = Number(body.paperAId);
    const b = Number(body.paperBId);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || !LINK_TYPES.includes(body.type)) {
      return Response.json({ error: "无效的关联" }, { status: 400 });
    }
    const owned = await prisma.paper.count({ where: { userId, id: { in: [a, b] } } });
    if (owned !== 2) return Response.json({ error: "找不到要关联的文献" }, { status: 404 });

    const [paperAId, paperBId] = a < b ? [a, b] : [b, a];
    const evidence = { note: String(body.note ?? "").trim().slice(0, 2000) };
    const link = await prisma.paperLink.upsert({
      where: { paperAId_paperBId_type: { paperAId, paperBId, type: body.type } },
      create: { userId, paperAId, paperBId, type: body.type, score: 3, origin: "USER", evidence },
      update: { origin: "USER", dismissed: false, score: 3, evidence },
    });
    return Response.json({ link }, { status: 201 });
  } catch (error) {
    return sessionError(error);
  }
}
