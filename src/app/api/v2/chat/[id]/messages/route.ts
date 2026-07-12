import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, content } = await req.json();
  if (!role || !content) return NextResponse.json({ error: "role & content required" }, { status: 400 });
  const msg = await prisma.chatMessage.create({ data: { sessionId: parseInt(id), role, content } });
  await prisma.chatSession.update({ where: { id: parseInt(id) }, data: { updatedAt: new Date() } });
  return NextResponse.json({ id: String(msg.id) });
}
