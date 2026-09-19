import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { pruneGraph } from "@/lib/knowledge/graph-extract";
import { invalidateBookVectors } from "@/lib/vector";

/** One book with the text of its chapters, for the reader. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireSessionUserId();
    const bookId = parseInt((await params).id);
    if (!Number.isInteger(bookId)) return NextResponse.json({ error: "invalid book id" }, { status: 400 });
    const chapters = await prisma.chapter.findMany({
      where: { bookId, book: { userId } },
      orderBy: { index: "asc" },
      select: { id: true, index: true, title: true, content: true, wordCount: true },
    });
    if (chapters.length === 0) return NextResponse.json({ error: "book not found" }, { status: 404 });
    return NextResponse.json({
      chapters: chapters.map((ch) => ({
        id: String(ch.id), index: ch.index, title: ch.title || `第${ch.index + 1}章`, plainText: ch.content, wordCount: ch.wordCount,
      })),
    });
  } catch (error) {
    return sessionError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const bookId = parseInt(id);
  if (!Number.isInteger(bookId)) return NextResponse.json({ error: "invalid book id" }, { status: 400 });
  const result = await prisma.book.deleteMany({ where: { id: bookId, userId } });
  if (!result.count) return NextResponse.json({ error: "book not found" }, { status: 404 });
  // The cascade removed this book's graph mentions; drop the nodes nothing supports any more.
  await pruneGraph(userId, "BOOK");
  invalidateBookVectors(bookId);
  return NextResponse.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireSessionUserId();
    const { id } = await params;
    const bookId = parseInt(id);
    const { coverUrl } = await req.json();
    if (!Number.isInteger(bookId) || (coverUrl !== null && typeof coverUrl !== "string")) {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
    if (typeof coverUrl === "string" && coverUrl.length > 5_000_000) {
      return NextResponse.json({ error: "封面图片过大" }, { status: 413 });
    }
    const result = await prisma.book.updateMany({ where: { id: bookId, userId }, data: { coverUrl } });
    if (!result.count) return NextResponse.json({ error: "book not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
