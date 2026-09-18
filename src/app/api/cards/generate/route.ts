import { requireSessionUserId } from "@/lib/auth-session";
import { LLMConfigError } from "@/lib/ai/user-llm";
import { llmErrorMessage } from "@/lib/ai/llm-error";
import { cardView, generateChapterCards } from "@/lib/knowledge/cards";

export const maxDuration = 120;

/** Generates knowledge cards for a chapter and saves them. Body: { chapterId }. */
export async function POST(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const body = await req.json().catch(() => ({}));
    const chapterId = Number(body.chapterId);
    if (!Number.isInteger(chapterId) || chapterId <= 0) {
      return Response.json({ error: "缺少章节" }, { status: 400 });
    }
    const result = await generateChapterCards(userId, chapterId);
    if (!result) return Response.json({ error: "找不到该章节" }, { status: 404 });
    return Response.json({ created: result.created, skipped: result.skipped, cards: result.cards.map(cardView) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof LLMConfigError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Card generation failed:", error);
    // A provider error carries a status; anything else is the model returning
    // something that is not the JSON it was asked for.
    const message = (error as { statusCode?: number })?.statusCode
      ? llmErrorMessage(error)
      : "AI 没有返回可用的卡片，请重试；如果反复失败，可以换一个模型";
    return Response.json({ error: message }, { status: 502 });
  }
}
