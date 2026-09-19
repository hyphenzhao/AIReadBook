import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

const positiveInt = (value: unknown) => {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Conversations about one book (`?bookId=`) or one paper (`?paperId=`). The
 * browser keys both kinds by a single string, so a paper's sessions come back
 * with bookId "paper:<id>".
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireSessionUserId();
    const bookId = positiveInt(req.nextUrl.searchParams.get("bookId"));
    const paperId = positiveInt(req.nextUrl.searchParams.get("paperId"));
    if (!bookId && !paperId) return NextResponse.json([]);

    const sessions = await prisma.chatSession.findMany({
      where: paperId ? { paperId, paper: { userId } } : { bookId, book: { userId } },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json(sessions.map((s) => ({
      id: String(s.id),
      bookId: s.paperId ? `paper:${s.paperId}` : String(s.bookId),
      chapterId: s.chapterId ? String(s.chapterId) : null,
      chapterTitle: null, title: s.title, mode: s.mode,
      messages: s.messages.map((m) => ({ id: String(m.id), role: m.role, content: m.content, annotations: m.annotations ?? undefined, createdAt: m.createdAt.toISOString() })),
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
    const paperId = typeof bookId === "string" && bookId.startsWith("paper:") ? positiveInt(bookId.slice(6)) : null;
    const parsedBookId = paperId ? null : positiveInt(bookId);
    if (!paperId && !parsedBookId) return NextResponse.json({ error: "bookId required" }, { status: 400 });

    if (paperId) {
      const owned = await prisma.paper.findFirst({ where: { id: paperId, userId }, select: { id: true } });
      if (!owned) return NextResponse.json({ error: "paper not found" }, { status: 404 });
    } else {
      const owned = await prisma.book.findFirst({ where: { id: parsedBookId!, userId }, select: { id: true } });
      if (!owned) return NextResponse.json({ error: "book not found" }, { status: 404 });
    }

    const parsedChapterId = paperId ? null : positiveInt(chapterId);
    const ownedChapter = parsedChapterId
      ? await prisma.chapter.findFirst({ where: { id: parsedChapterId, bookId: parsedBookId! }, select: { id: true } })
      : null;

    const session = await prisma.chatSession.create({
      data: {
        bookId: parsedBookId, paperId, chapterId: ownedChapter?.id ?? null,
        title: String(title || "对话").slice(0, 500), mode: mode === "summary" ? "summary" : "companion",
      },
    });
    if (Array.isArray(messages) && messages.length) {
      await prisma.chatMessage.createMany({
        data: messages.map((m: any) => ({ sessionId: session.id, role: m.role, content: m.content })),
      });
    }
    return NextResponse.json({ id: String(session.id) });
  } catch (error) {
    return sessionError(error);
  }
}
