import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

// POST /api/v2/sync — upload all local data to MySQL for a user
export async function POST(req: NextRequest) {
  try {
    const userId = await requireSessionUserId();
    const { books, annotations, chatSessions, reviewCards } = await req.json();

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
        const newBookId = bookIdMap.get(a.bookId);
        if (!newBookId) continue;
        await prisma.annotation.create({
          data: { userId, bookId: newBookId, chapterId: null, selectedText: a.selectedText || "", note: a.note || "", color: a.color || "yellow" },
        });
      }
    }

    // Chat sessions — map old bookId to new
    if (chatSessions?.length) {
      for (const s of chatSessions) {
        const newBookId = bookIdMap.get(s.bookId);
        if (!newBookId) continue;
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

    if (reviewCards?.length) {
      for (const card of reviewCards) {
        const newBookId = bookIdMap.get(card.bookId);
        if (!newBookId || !card.front || !card.back) continue;
        await prisma.reviewCard.create({
          data: {
            userId,
            bookId: newBookId,
            front: card.front,
            back: card.back,
            sourceType: card.sourceType || "manual",
            easeFactor: Number(card.easeFactor) || 2.5,
            interval: Number(card.interval) || 0,
            repetitions: Number(card.repetitions) || 0,
            nextReview: card.nextReview ? new Date(card.nextReview) : new Date(),
            lastReview: card.lastReview ? new Date(card.lastReview) : null,
          },
        });
      }
    }

    return NextResponse.json({ ok: true, books: books?.length || 0, annotations: annotations?.length || 0, sessions: chatSessions?.length || 0, reviewCards: reviewCards?.length || 0 });
  } catch (e: any) {
    console.error("Sync upload error:", e);
    return sessionError(e);
  }
}

// GET /api/v2/sync?userId= — pull all data from MySQL
export async function GET(req: NextRequest) {
  try {
    const userId = await requireSessionUserId();

    const [books, annotations, sessions, reviewCards] = await Promise.all([
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
      reviewCards: reviewCards.map((card) => ({
        id: String(card.id),
        userId: String(card.userId),
        bookId: String(card.bookId),
        sourceType: card.sourceType,
        sourceId: null,
        front: card.front,
        back: card.back,
        tags: [],
        easeFactor: card.easeFactor,
        interval: card.interval,
        repetitions: card.repetitions,
        nextReview: card.nextReview.toISOString(),
        lastReview: card.lastReview?.toISOString() || null,
        createdAt: card.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("Sync download error:", e);
    return sessionError(e);
  }
}
