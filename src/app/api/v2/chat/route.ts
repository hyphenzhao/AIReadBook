import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const bookId = req.nextUrl.searchParams.get("bookId");
  if (!bookId) return NextResponse.json([]);
  const sessions = await prisma.chatSession.findMany({
    where: { bookId: parseInt(bookId) }, orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(sessions.map(s => ({
    id: String(s.id), bookId: String(s.bookId), chapterId: s.chapterId ? String(s.chapterId) : null,
    chapterTitle: null, title: s.title, mode: s.mode,
    messages: s.messages.map(m => ({ id: String(m.id), role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })),
    createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  })));
}

export async function POST(req: NextRequest) {
  const { bookId, chapterId, title, mode, messages } = await req.json();
  if (!bookId) return NextResponse.json({ error: "bookId required" }, { status: 400 });
  const session = await prisma.chatSession.create({
    data: { bookId: parseInt(bookId), chapterId: chapterId ? parseInt(chapterId) : null, title: title || "对话", mode: mode || "companion" },
  });
  if (messages?.length) {
    await prisma.chatMessage.createMany({
      data: messages.map((m: any) => ({ sessionId: session.id, role: m.role, content: m.content })),
    });
  }
  return NextResponse.json({ id: String(session.id) });
}
