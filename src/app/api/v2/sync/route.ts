import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/v2/sync — upload all local data to MySQL for a user
export async function POST(req: NextRequest) {
  try {
    const { userId, books, annotations, chatSessions, reviewCards } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    // Map old UUID bookIds → new MySQL auto-increment IDs
    const bookIdMap = new Map<string, number>();

    // Insert books & chapters
    if (books?.length) {
      for (const b of books) {
        const book = await prisma.book.create({
          data: {
            userId,
            title: b.title || "未命名",
            author: b.author || "",
            coverUrl: b.coverUrl || null,
            language: b.language || "zh",
            chapters: b.totalChapters || b.chapters?.length || 0,
          },
        });
        bookIdMap.set(b.id, book.id);

        if (b.chapters?.length) {
          for (const ch of b.chapters) {
            await prisma.chapter.create({
              data: {
                bookId: book.id,
                index: ch.index,
                title: ch.title || null,
                content: ch.plainText || "",
                wordCount: ch.wordCount || 0,
              },
            });
          }
        }
      }
    }

    // Insert annotations — map old bookId to new
    if (annotations?.length) {
      for (const a of annotations) {
        const newBookId = bookIdMap.get(a.bookId) || 1;
        await prisma.annotation.create({
          data: { userId, bookId: newBookId, chapterId: null, selectedText: a.selectedText || "", note: a.note || "", color: a.color || "yellow" },
        });
      }
    }

    // Chat sessions — map old bookId to new
    if (chatSessions?.length) {
      for (const s of chatSessions) {
        const newBookId = bookIdMap.get(s.bookId) || 1;
        const session = await prisma.chatSession.create({
          data: { bookId: newBookId, chapterId: null, title: s.title || "对话", mode: s.mode || "companion" },
        });
        if (s.messages?.length) {
          await prisma.chatMessage.createMany({
            data: s.messages.map((m: { role: string; content: string }) => ({
              sessionId: session.id, role: m.role, content: m.content,
            })),
          });
        }
      }
    }

    return NextResponse.json({ ok: true, books: books?.length || 0, annotations: annotations?.length || 0, sessions: chatSessions?.length || 0 });
  } catch (e: any) {
    console.error("Sync upload error:", e);
    return NextResponse.json({ error: e?.message || "Sync failed" }, { status: 500 });
  }
}

// GET /api/v2/sync?userId= — pull all data from MySQL
export async function GET(req: NextRequest) {
  try {
    const userId = parseInt(req.nextUrl.searchParams.get("userId") || "0");
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const [books, annotations, sessions] = await Promise.all([
      prisma.book.findMany({
        where: { userId },
        include: { chaptersRel: { orderBy: { index: "asc" } } },
      }),
      prisma.annotation.findMany({ where: { userId } }),
      prisma.chatSession.findMany({
        where: { book: { userId } },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      }),
      prisma.reviewCard.findMany({ where: { userId } }),
    ]);

    return NextResponse.json({
      books: books.map((b) => ({
        id: String(b.id),
        title: b.title,
        author: b.author,
        coverUrl: b.coverUrl,
        language: b.language,
        totalChapters: b.chapters,
        chapters: b.chaptersRel.map((ch) => ({
          id: String(ch.id),
          index: ch.index,
          title: ch.title,
          plainText: ch.content,
          wordCount: ch.wordCount,
        })),
        uploadedAt: b.createdAt.toISOString(),
      })),
      annotations: annotations.map((a) => ({
        id: String(a.id),
        bookId: String(a.bookId),
        chapterId: a.chapterId ? String(a.chapterId) : null,
        selectedText: a.selectedText,
        note: a.note || "",
        color: a.color,
        tags: [] as string[],
        aiCategory: a.aiCategory,
        aiSummary: a.aiSummary,
        createdAt: a.createdAt.toISOString(),
      })),
      chatSessions: sessions.map((s) => ({
        id: String(s.id),
        bookId: String(s.bookId),
        chapterId: s.chapterId ? String(s.chapterId) : null,
        title: s.title,
        mode: s.mode,
        messages: s.messages.map((m) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("Sync download error:", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
