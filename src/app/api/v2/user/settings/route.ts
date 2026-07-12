import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = parseInt(req.nextUrl.searchParams.get("userId") || "0");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiSettings: true } });
  return NextResponse.json({ aiSettings: (user?.aiSettings as any) || {} });
}

export async function PATCH(req: NextRequest) {
  const { userId, aiSettings, name } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (aiSettings) await prisma.user.update({ where: { id: userId }, data: { aiSettings } });
  if (name) await prisma.user.update({ where: { id: userId }, data: { name } });
  return NextResponse.json({ ok: true });
}
