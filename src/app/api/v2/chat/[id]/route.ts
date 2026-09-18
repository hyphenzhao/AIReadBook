import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const result = await prisma.chatSession.deleteMany({
    where: { id: parseInt(id), book: { userId } },
  });
  if (!result.count) return NextResponse.json({ error: "chat not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
