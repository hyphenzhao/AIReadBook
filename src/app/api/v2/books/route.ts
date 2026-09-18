import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

export async function GET() {
  try {
  const userId = await requireSessionUserId();
  const books = await prisma.book.findMany({
    where: { userId }, orderBy: { createdAt: "desc" },
    include: { chaptersRel: { orderBy: { index: "asc" } } },
  });
  return NextResponse.json(books.map(b => ({
    id: String(b.id), title: b.title, author: b.author, coverUrl: b.coverUrl,
    language: b.language, totalChapters: b.chapters,
    chapters: b.chaptersRel.map(ch => ({ id: String(ch.id), index: ch.index, title: ch.title, plainText: ch.content, wordCount: ch.wordCount })),
    metadata: {}, uploadedAt: b.createdAt.toISOString(),
  })));
  } catch (error) {
    return sessionError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
  const userId = await requireSessionUserId();
  const { title, author, coverUrl, language, chapters } = await req.json();
  if (!String(title || "").trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return NextResponse.json({ error: "EPUB 中没有可导入的章节" }, { status: 400 });
  }
  const book = await prisma.book.create({
    data: { userId, title: String(title).trim(), author, coverUrl, language: language || "zh", chapters: chapters.length },
  });
  if (chapters.length) {
    await prisma.chapter.createMany({
      data: chapters.map((ch: any) => ({ bookId: book.id, index: ch.index, title: ch.title, content: ch.plainText || "", wordCount: ch.wordCount || 0 })),
    });
  }
  const persistedChapters = await prisma.chapter.findMany({
    where: { bookId: book.id },
    orderBy: { index: "asc" },
    select: { id: true, index: true, title: true, content: true, wordCount: true },
  });
  return NextResponse.json({
    id: String(book.id),
    chapters: persistedChapters.map((chapter) => ({
      id: String(chapter.id),
      index: chapter.index,
      title: chapter.title || `第${chapter.index + 1}章`,
      plainText: chapter.content,
      wordCount: chapter.wordCount,
    })),
  });
  } catch (error) {
    return sessionError(error);
  }
}
