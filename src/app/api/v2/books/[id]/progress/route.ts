import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

type Params = { params: Promise<{ id: string }> };

async function ownedBookId(userId: number, raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return (await prisma.book.findFirst({ where: { id, userId }, select: { id: true } }))?.id ?? null;
}

/** Where the reader left off: { chapterIndex, ratio } with ratio = scroll position 0–1. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const bookId = await ownedBookId(userId, (await params).id);
    if (!bookId) return Response.json({ error: "找不到该书" }, { status: 404 });
    const progress = await prisma.readingProgress.findUnique({ where: { userId_bookId: { userId, bookId } } });
    return Response.json({ locator: progress?.locator ?? null, updatedAt: progress?.updatedAt ?? null });
  } catch (error) {
    return sessionError(error);
  }
}

/** PUT, and POST so that navigator.sendBeacon can save on the way out of the page. */
async function save(req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const bookId = await ownedBookId(userId, (await params).id);
    if (!bookId) return Response.json({ error: "找不到该书" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const chapterIndex = Number(body?.chapterIndex);
    const ratio = Number(body?.ratio);
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || !Number.isFinite(ratio)) {
      return Response.json({ error: "无效的阅读位置" }, { status: 400 });
    }
    const locator = { chapterIndex, ratio: Math.max(0, Math.min(1, ratio)) };
    await prisma.readingProgress.upsert({
      where: { userId_bookId: { userId, bookId } },
      create: { userId, bookId, locator },
      update: { locator },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}

export { save as PUT, save as POST };
