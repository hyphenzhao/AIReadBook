import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const { role, content, annotations } = await req.json();
  if (!["user", "assistant"].includes(role) || !String(content || "").trim()) return NextResponse.json({ error: "valid role & content required" }, { status: 400 });
  const sessionId = parseInt(id);
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, OR: [{ book: { userId } }, { paper: { userId } }] },
    select: { id: true },
  });
  if (!session) return NextResponse.json({ error: "chat not found" }, { status: 404 });
  const last = await prisma.chatMessage.findFirst({
    where: { sessionId },
    orderBy: { id: "desc" },
    select: { id: true, role: true, content: true },
  });
  if (last && last.role === role && last.content === content) {
    return NextResponse.json({ id: String(last.id), duplicate: true });
  }
  // Only the pipeline's own source list is kept, and only on answers.
  const sources = role === "assistant" && Array.isArray(annotations) && JSON.stringify(annotations).length < 60_000
    ? annotations
    : undefined;
  const msg = await prisma.chatMessage.create({ data: { sessionId, role, content, annotations: sources } });
  await prisma.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
  return NextResponse.json({ id: String(msg.id) });
  } catch (error) {
    return sessionError(error);
  }
}
