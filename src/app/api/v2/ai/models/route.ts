import { NextRequest, NextResponse } from "next/server";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { listProviderModels, LLMConfigError } from "@/lib/ai/user-llm";

/**
 * Lists the models the user's AI provider serves. POST rather than GET because
 * the settings form may send a not-yet-saved API key to test it.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireSessionUserId();
    const body = await req.json().catch(() => ({}));
    const draft = {
      apiKey: typeof body?.apiKey === "string" ? body.apiKey : undefined,
      baseUrl: typeof body?.baseUrl === "string" ? body.baseUrl : undefined,
    };
    return NextResponse.json({ models: await listProviderModels(userId, draft) });
  } catch (error) {
    if (error instanceof LLMConfigError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return sessionError(error);
  }
}
