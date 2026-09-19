import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

type Params = { params: Promise<{ id: string }> };
const COLORS = ["yellow", "green", "blue", "pink", "orange"];

async function ownedId(userId: number, raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return (await prisma.paper.findFirst({ where: { id, userId }, select: { id: true } }))?.id ?? null;
}

const view = (a: { id: number; page: number; rects: unknown; selectedText: string; note: string | null; color: string; createdAt: Date }) => ({
  id: a.id, page: a.page, boxes: a.rects as number[][], text: a.selectedText, note: a.note, color: a.color, createdAt: a.createdAt.toISOString(),
});

/** Highlights and notes on a paper, anchored by page and boxes in PDF points (origin top-left). */
export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const paperId = await ownedId(userId, (await params).id);
    if (!paperId) return Response.json({ error: "找不到该文献" }, { status: 404 });
    const annotations = await prisma.paperAnnotation.findMany({ where: { paperId, userId }, orderBy: [{ page: "asc" }, { id: "asc" }] });
    return Response.json({ annotations: annotations.map(view) });
  } catch (error) {
    return sessionError(error);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const paperId = await ownedId(userId, (await params).id);
    if (!paperId) return Response.json({ error: "找不到该文献" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const page = Number(body.page);
    const text = String(body.text ?? "").trim().slice(0, 5000);
    const boxes = Array.isArray(body.boxes)
      ? body.boxes
          .filter((box: unknown) => Array.isArray(box) && box.length === 4 && box.every((n) => typeof n === "number" && Number.isFinite(n)))
          .slice(0, 200)
      : [];
    if (!Number.isInteger(page) || page < 1 || !text || boxes.length === 0) {
      return Response.json({ error: "无效的批注" }, { status: 400 });
    }
    const annotation = await prisma.paperAnnotation.create({
      data: {
        userId, paperId, page, rects: boxes, selectedText: text,
        note: String(body.note ?? "").trim().slice(0, 5000) || null,
        color: COLORS.includes(body.color) ? body.color : "yellow",
      },
    });
    return Response.json({ annotation: view(annotation) }, { status: 201 });
  } catch (error) {
    return sessionError(error);
  }
}

/** DELETE /api/papers/:id/annotations?annotationId=… */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const userId = await requireSessionUserId();
    const paperId = await ownedId(userId, (await params).id);
    const annotationId = Number(new URL(req.url).searchParams.get("annotationId"));
    if (!paperId || !Number.isInteger(annotationId)) return Response.json({ error: "找不到该批注" }, { status: 404 });
    const { count } = await prisma.paperAnnotation.deleteMany({ where: { id: annotationId, paperId, userId } });
    if (!count) return Response.json({ error: "找不到该批注" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
