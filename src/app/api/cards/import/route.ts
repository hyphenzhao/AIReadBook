import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { CARD_TYPES, DIFFICULTIES } from "@/lib/knowledge/cards";

/**
 * One-time move of cards that only existed in a browser's localStorage.
 * Body: { cards: [{ bookId, chapterId, cardType, title, content, tags, difficulty, createdAt }] }.
 * Cards for books the user does not own, and cards already imported, are skipped.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const body = await req.json().catch(() => ({}));
    const incoming: any[] = Array.isArray(body.cards) ? body.cards.slice(0, 5000) : [];

    const books = await prisma.book.findMany({
      where: { userId },
      select: { id: true, chaptersRel: { select: { id: true } } },
    });
    const chaptersByBook = new Map(books.map((book) => [book.id, new Set(book.chaptersRel.map((ch) => ch.id))]));

    const existing = new Set(
      (await prisma.knowledgeCard.findMany({ where: { userId }, select: { bookId: true, title: true } }))
        .map((card) => `${card.bookId}|${card.title}`),
    );

    const data = incoming.flatMap((card) => {
      const bookId = Number(card?.bookId);
      const title = String(card?.title ?? "").trim().slice(0, 300);
      const content = String(card?.content ?? "").trim();
      const chapters = chaptersByBook.get(bookId);
      if (!chapters || !title || !content || existing.has(`${bookId}|${title}`)) return [];
      existing.add(`${bookId}|${title}`);
      const chapterId = Number(card.chapterId);
      const created = new Date(card.createdAt);
      return [{
        userId,
        sourceType: "BOOK" as const,
        bookId,
        chapterId: chapters.has(chapterId) ? chapterId : null,
        cardType: CARD_TYPES.includes(card.cardType) ? String(card.cardType) : "concept",
        title,
        content,
        tags: Array.isArray(card.tags) ? card.tags.map(String).slice(0, 5) : [],
        difficulty: DIFFICULTIES.includes(card.difficulty) ? String(card.difficulty) : "intermediate",
        createdAt: Number.isNaN(created.getTime()) ? new Date() : created,
      }];
    });

    if (data.length) await prisma.knowledgeCard.createMany({ data });
    return Response.json({ imported: data.length, skipped: incoming.length - data.length });
  } catch (error) {
    return sessionError(error);
  }
}
