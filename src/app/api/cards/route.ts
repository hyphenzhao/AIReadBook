import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { CARD_SELECT, cardView } from "@/lib/knowledge/cards";

/** The user's knowledge cards, newest first; `?bookId=` narrows to one book. */
export async function GET(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const bookId = Number(new URL(req.url).searchParams.get("bookId"));
    const cards = await prisma.knowledgeCard.findMany({
      where: { userId, sourceType: "BOOK", ...(Number.isInteger(bookId) && bookId > 0 ? { bookId } : {}) },
      orderBy: { id: "desc" },
      take: 2000,
      select: CARD_SELECT,
    });
    return Response.json({ cards: cards.map(cardView) });
  } catch (error) {
    return sessionError(error);
  }
}
