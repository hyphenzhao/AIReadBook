import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

const COLORS = new Set(["yellow", "green", "blue", "pink", "orange"]);

export async function GET() {
  try {
  const userId = await requireSessionUserId();
  const list = await prisma.annotation.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(list.map(a => ({
    id: String(a.id), bookId: String(a.bookId), chapterId: a.chapterId ? String(a.chapterId) : null,
    selectedText: a.selectedText, note: a.note || "", color: a.color, tags: [] as string[],
    aiCategory: a.aiCategory, aiSummary: a.aiSummary, createdAt: a.createdAt.toISOString(),
  })));
  } catch (error) {
    return sessionError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
  const userId = await requireSessionUserId();
  const { bookId, chapterId, selectedText, note, color } = await req.json();
  const parsedBookId = parseInt(bookId);
  const parsedChapterId = chapterId ? parseInt(chapterId) : null;
  if (!Number.isInteger(parsedBookId) || !String(selectedText || "").trim()) return NextResponse.json({ error: "required fields missing" }, { status: 400 });
  const book = await prisma.book.findFirst({ where: { id: parsedBookId, userId }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "book not found" }, { status: 404 });
  if (parsedChapterId) {
    const chapter = await prisma.chapter.findFirst({ where: { id: parsedChapterId, bookId: parsedBookId }, select: { id: true } });
    if (!chapter) return NextResponse.json({ error: "chapter not found" }, { status: 404 });
  }
  const a = await prisma.annotation.create({
    data: { userId, bookId: parsedBookId, chapterId: parsedChapterId, selectedText: String(selectedText).trim(), note: String(note || ""), color: COLORS.has(color) ? color : "yellow" },
  });
  return NextResponse.json({ id: String(a.id) });
  } catch (error) {
    return sessionError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
  const userId = await requireSessionUserId();
  const { id, note, color, aiCategory, aiSummary } = await req.json();
  const annotationId = parseInt(id);
  if (!Number.isInteger(annotationId)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const result = await prisma.annotation.updateMany({
    where: { id: annotationId, userId },
    data: {
      ...(typeof note === "string" ? { note } : {}),
      ...(COLORS.has(color) ? { color } : {}),
      ...(typeof aiCategory === "string" || aiCategory === null ? { aiCategory } : {}),
      ...(typeof aiSummary === "string" || aiSummary === null ? { aiSummary } : {}),
    },
  });
  if (!result.count) return NextResponse.json({ error: "annotation not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}

// DELETE by id or by text search
export async function DELETE(req: NextRequest) {
  try {
  const userId = await requireSessionUserId();
  const { id, bookId, selectedText } = await req.json();
  if (id) {
    await prisma.annotation.deleteMany({ where: { id: parseInt(id), userId } });
  } else if (bookId && selectedText) {
    await prisma.annotation.deleteMany({ where: { bookId: parseInt(bookId), selectedText, userId } });
  }
  return NextResponse.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}

// POST /api/v2/annotations/tool — AI-callable: create annotation by searching text content
// The AI says "highlight the sentence about X" → this API finds and highlights it
export async function PUT(req: NextRequest) {
  try {
  const userId = await requireSessionUserId();
  const { bookId, searchText, color, note } = await req.json();
  if (!bookId || !searchText) return NextResponse.json({ error: "bookId, searchText required" }, { status: 400 });
  const ownedBook = await prisma.book.findFirst({ where: { id: parseInt(bookId), userId }, select: { id: true } });
  if (!ownedBook) return NextResponse.json({ error: "book not found" }, { status: 404 });

  // Search chapters for matching text
  const chapters = await prisma.chapter.findMany({
    where: { bookId: parseInt(bookId), content: { contains: searchText } },
    take: 1,
  });

  if (chapters.length === 0) {
    return NextResponse.json({ found: false, message: "未在书中找到该文字" });
  }

  const ch = chapters[0];
  // Find the exact sentence/paragraph containing the search text
  const idx = ch.content.indexOf(searchText);
  const start = Math.max(0, idx - 50);
  const end = Math.min(ch.content.length, idx + searchText.length + 50);
  const context = ch.content.slice(start, end);

  // Create annotation with the actual found text
  const a = await prisma.annotation.create({
    data: {
      userId, bookId: parseInt(bookId), chapterId: ch.id,
      selectedText: searchText,
      note: note || "",
      color: color || "yellow",
    },
  });

  return NextResponse.json({
    found: true,
    id: String(a.id),
    chapter: ch.title || `第${ch.index + 1}章`,
    context,
  });
  } catch (error) {
    return sessionError(error);
  }
}
