import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

export async function GET(req: NextRequest) {
  try {
  const userId = await requireSessionUserId();
  const bookId = req.nextUrl.searchParams.get("bookId");
  if (!bookId) return NextResponse.json([]);
  const sessions = await prisma.chatSession.findMany({
    where: { bookId: parseInt(bookId), book: { userId } }, orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(sessions.map(s => ({
    id: String(s.id), bookId: String(s.bookId), chapterId: s.chapterId ? String(s.chapterId) : null,
    chapterTitle: null, title: s.title, mode: s.mode,
    messages: s.messages.map(m => ({ id: String(m.id), role: m.role, content: m.content, annotations: m.annotations ?? undefined, createdAt: m.createdAt.toISOString() })),
    createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  })));
  } catch (error) {
    return sessionError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
  const userId = await requireSessionUserId();
  const { bookId, chapterId, title, mode, messages } = await req.json();
  if (!bookId) return NextResponse.json({ error: "bookId required" }, { status: 400 });
  const parsedBookId = parseInt(bookId);
  const ownedBook = await prisma.book.findFirst({ where: { id: parsedBookId, userId }, select: { id: true } });
  if (!ownedBook) return NextResponse.json({ error: "book not found" }, { status: 404 });
  const parsedChapterId = typeof chapterId === "string" && /^\d+$/.test(chapterId)
    ? Number(chapterId)
    : null;
  const ownedChapter = parsedChapterId
    ? await prisma.chapter.findFirst({
        where: { id: parsedChapterId, bookId: parsedBookId },
        select: { id: true },
      })
    : null;
  const session = await prisma.chatSession.create({
    data: { bookId: parsedBookId, chapterId: ownedChapter?.id || null, title: title || "对话", mode: mode || "companion" },
  });
  if (messages?.length) {
    await prisma.chatMessage.createMany({
      data: messages.map((m: any) => ({ sessionId: session.id, role: m.role, content: m.content })),
    });
  }
  return NextResponse.json({ id: String(session.id) });
  } catch (error) {
    return sessionError(error);
  }
}
