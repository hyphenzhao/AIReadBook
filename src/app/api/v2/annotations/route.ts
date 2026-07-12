import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = parseInt(req.nextUrl.searchParams.get("userId") || "0");
  if (!userId) return NextResponse.json([]);
  const list = await prisma.annotation.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(list.map(a => ({
    id: String(a.id), bookId: String(a.bookId), chapterId: a.chapterId ? String(a.chapterId) : null,
    selectedText: a.selectedText, note: a.note || "", color: a.color, tags: [] as string[],
    aiCategory: a.aiCategory, aiSummary: a.aiSummary, createdAt: a.createdAt.toISOString(),
  })));
}

export async function POST(req: NextRequest) {
  const { userId, bookId, chapterId, selectedText, note, color } = await req.json();
  if (!userId || !bookId || !selectedText) return NextResponse.json({ error: "required fields missing" }, { status: 400 });
  const a = await prisma.annotation.create({
    data: { userId, bookId: parseInt(bookId), chapterId: chapterId ? parseInt(chapterId) : null, selectedText, note: note || "", color: color || "yellow" },
  });
  return NextResponse.json({ id: String(a.id) });
}

export async function PATCH(req: NextRequest) {
  const { id, note, color, aiCategory, aiSummary } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.annotation.update({ where: { id: parseInt(id) }, data: { note, color, aiCategory, aiSummary } });
  return NextResponse.json({ ok: true });
}
