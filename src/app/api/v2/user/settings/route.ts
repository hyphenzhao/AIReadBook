import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { getAISettingsView, LLMConfigError, updateAISettings } from "@/lib/ai/user-llm";

export async function GET() {
  try {
    const userId = await requireSessionUserId();
    return NextResponse.json({ aiSettings: await getAISettingsView(userId) });
  } catch (error) {
    return sessionError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireSessionUserId();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
    }

    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 100);
      if (!name) return NextResponse.json({ error: "显示名称不能为空" }, { status: 400 });
      await prisma.user.update({ where: { id: userId }, data: { name } });
    }

    const aiSettings = body.aiSettings && typeof body.aiSettings === "object"
      ? await updateAISettings(userId, body.aiSettings)
      : await getAISettingsView(userId);

    return NextResponse.json({ ok: true, aiSettings });
  } catch (error) {
    if (error instanceof LLMConfigError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return sessionError(error);
  }
}
