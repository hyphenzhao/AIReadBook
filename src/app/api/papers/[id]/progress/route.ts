import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

type Params = { params: Promise<{ id: string }> };

async function ownedId(userId: number, raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return (await prisma.paper.findFirst({ where: { id, userId }, select: { id: true } }))?.id ?? null;
}

/** Where the reader left off in the PDF: { page, scale, offsetRatio }. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const paperId = await ownedId(userId, (await params).id);
    if (!paperId) return Response.json({ error: "找不到该文献" }, { status: 404 });
    const progress = await prisma.readingProgress.findUnique({ where: { userId_paperId: { userId, paperId } } });
    return Response.json({ locator: progress?.locator ?? null, updatedAt: progress?.updatedAt ?? null });
  } catch (error) {
    return sessionError(error);
  }
}

/** PUT, and POST so that navigator.sendBeacon can save on the way out of the page. */
async function save(req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const paperId = await ownedId(userId, (await params).id);
    if (!paperId) return Response.json({ error: "找不到该文献" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const page = Number(body?.page);
    if (!Number.isInteger(page) || page < 1) return Response.json({ error: "无效的阅读位置" }, { status: 400 });
    const scale = body?.scale;
    const locator = {
      page,
      // A number, or one of pdf.js's named modes.
      scale: typeof scale === "number" && scale > 0.1 && scale < 10
        ? scale
        : ["page-width", "page-fit", "auto"].includes(scale) ? scale : "page-width",
      offsetRatio: Math.max(0, Math.min(1, Number(body?.offsetRatio) || 0)),
    };
    await prisma.readingProgress.upsert({
      where: { userId_paperId: { userId, paperId } },
      create: { userId, paperId, locator },
      update: { locator },
    });
    // Opening a paper is starting to read it.
    await prisma.paper.updateMany({ where: { id: paperId, status: "UNREAD" }, data: { status: "READING" } });
    return Response.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}

export { save as PUT, save as POST };
