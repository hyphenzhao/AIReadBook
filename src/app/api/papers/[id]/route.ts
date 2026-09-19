import type { PaperStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { removeStored } from "@/lib/papers/storage";
import { PAPER_SELECT, paperView } from "@/lib/papers/view";
import { invalidatePaperVectors } from "@/lib/vector/papers";

type Params = { params: Promise<{ id: string }> };
const STATUSES: PaperStatus[] = ["UNREAD", "READING", "READ"];

async function ownedId(userId: number, raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return (await prisma.paper.findFirst({ where: { id, userId }, select: { id: true } }))?.id ?? null;
}

const text = (value: unknown, max: number) => {
  const trimmed = String(value ?? "").trim().slice(0, max);
  return trimmed || null;
};

export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const id = await ownedId(userId, (await params).id);
    if (!id) return Response.json({ error: "找不到该文献" }, { status: 404 });
    const paper = await prisma.paper.findUniqueOrThrow({ where: { id }, select: PAPER_SELECT });
    const outline = await prisma.chunk.findMany({
      where: { paperId: id, section: { not: null } },
      distinct: ["section"],
      orderBy: { ordinal: "asc" },
      select: { section: true, pageStart: true },
    });
    return Response.json({
      paper: paperView(paper),
      outline: outline.map((o) => ({ title: o.section!, page: o.pageStart ?? 1 })),
    });
  } catch (error) {
    return sessionError(error);
  }
}

/** Edits metadata, reading status, tags (by name) and collection membership. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const id = await ownedId(userId, (await params).id);
    if (!id) return Response.json({ error: "找不到该文献" }, { status: 404 });
    const body = await req.json().catch(() => ({}));

    const data: Prisma.PaperUpdateInput = {};
    if (body.title !== undefined) {
      const title = text(body.title, 1000);
      if (!title) return Response.json({ error: "标题不能为空" }, { status: 400 });
      data.title = title;
    }
    if (body.authors !== undefined) {
      data.authors = (Array.isArray(body.authors) ? body.authors : String(body.authors).split(/[;；\n]/))
        .map((name: unknown) => String(name).trim().slice(0, 200)).filter(Boolean).slice(0, 100);
    }
    if (body.year !== undefined) {
      const year = Number(body.year);
      data.year = Number.isInteger(year) && year > 1000 && year < 3000 ? year : null;
    }
    if (body.venue !== undefined) data.venue = text(body.venue, 500);
    if (body.doi !== undefined) data.doi = text(body.doi, 255)?.toLowerCase() ?? null;
    if (body.arxivId !== undefined) data.arxivId = text(body.arxivId, 50);
    if (body.abstract !== undefined) data.abstract = text(body.abstract, 20_000);
    if (body.notes !== undefined) data.notes = text(body.notes, 50_000);
    if (body.status !== undefined && STATUSES.includes(body.status)) data.status = body.status;
    if (body.rating !== undefined) {
      const rating = Number(body.rating);
      data.rating = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.paper.update({ where: { id }, data });

      if (Array.isArray(body.tags)) {
        const names = [...new Set(body.tags.map((t: unknown) => String(t).trim().slice(0, 100)).filter(Boolean))].slice(0, 30) as string[];
        const tags = await Promise.all(
          names.map((name) => tx.tag.upsert({ where: { userId_name: { userId, name } }, create: { userId, name }, update: {} })),
        );
        await tx.paperTag.deleteMany({ where: { paperId: id } });
        if (tags.length) await tx.paperTag.createMany({ data: tags.map((tag) => ({ paperId: id, tagId: tag.id })) });
        // A tag nothing uses any more is clutter.
        await tx.tag.deleteMany({ where: { userId, papers: { none: {} } } });
      }

      if (Array.isArray(body.collectionIds)) {
        const wanted = body.collectionIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
        const owned = await tx.paperCollection.findMany({ where: { userId, id: { in: wanted } }, select: { id: true } });
        await tx.paperCollectionItem.deleteMany({ where: { paperId: id } });
        if (owned.length) await tx.paperCollectionItem.createMany({ data: owned.map((c) => ({ collectionId: c.id, paperId: id })) });
      }
    });

    const paper = await prisma.paper.findUniqueOrThrow({ where: { id }, select: PAPER_SELECT });
    return Response.json({ paper: paperView(paper) });
  } catch (error) {
    return sessionError(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const id = await ownedId(userId, (await params).id);
    if (!id) return Response.json({ error: "找不到该文献" }, { status: 404 });

    const file = await prisma.paperFile.findUnique({ where: { paperId: id }, select: { path: true } });
    // Cascades to pages, chunks, embeddings, chats, annotations, links and graph mentions.
    await prisma.paper.delete({ where: { id } });
    if (file) await removeStored(file.path).catch((error) => console.error("Could not remove PDF", error));
    await prisma.tag.deleteMany({ where: { userId, papers: { none: {} } } });
    invalidatePaperVectors(userId);
    return Response.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
