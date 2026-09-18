import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";

export async function GET() {
  try {
  const userId = await requireSessionUserId();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiSettings: true } });
  return NextResponse.json({ aiSettings: (user?.aiSettings as any) || {} });
  } catch (error) {
    return sessionError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
  const userId = await requireSessionUserId();
  const { aiSettings, name } = await req.json();
  if (aiSettings) await prisma.user.update({ where: { id: userId }, data: { aiSettings } });
  if (typeof name === "string" && name.trim()) await prisma.user.update({ where: { id: userId }, data: { name: name.trim().slice(0, 100) } });
  return NextResponse.json({ ok: true });
  } catch (error) {
    return sessionError(error);
  }
}
