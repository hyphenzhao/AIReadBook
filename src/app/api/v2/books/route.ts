import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = parseInt(req.nextUrl.searchParams.get("userId") || "0");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
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
}

export async function POST(req: NextRequest) {
  const { userId, title, author, coverUrl, language, chapters } = await req.json();
  if (!userId || !title) return NextResponse.json({ error: "userId & title required" }, { status: 400 });
  const book = await prisma.book.create({
    data: { userId, title, author, coverUrl, language: language || "zh", chapters: chapters?.length || 0 },
  });
  if (chapters?.length) {
    await prisma.chapter.createMany({
      data: chapters.map((ch: any) => ({ bookId: book.id, index: ch.index, title: ch.title, content: ch.plainText || "", wordCount: ch.wordCount || 0 })),
    });
  }
  return NextResponse.json({ id: String(book.id) });
}
