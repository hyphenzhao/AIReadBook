import { streamText } from "ai";
import { createDeepSeekClient, DEEPSEEK_DEFAULT } from "@/lib/ai/client";
import { COMPANION_SYSTEM_PROMPT } from "@/lib/ai/prompts/companion";
import { SUMMARY_SYSTEM_PROMPT } from "@/lib/ai/prompts/summary";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/ai/prompts/extraction";
import { TEACHING_SYSTEM_PROMPT } from "@/lib/ai/prompts/teaching";
import type { ChatMode } from "@/types";

const SYSTEM_PROMPTS: Record<ChatMode, string> = {
  companion: COMPANION_SYSTEM_PROMPT,
  summary: SUMMARY_SYSTEM_PROMPT,
  extraction: EXTRACTION_SYSTEM_PROMPT,
  teaching: TEACHING_SYSTEM_PROMPT,
};

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Extract messages from useChat format (AI SDK v4)
    const messages = body.messages || [];
    const mode = (body.mode || "companion") as ChatMode;
    const bookId = body.bookId;
    const userApiKey = body.apiKey || process.env.DEEPSEEK_API_KEY;
    const userBaseUrl = body.baseUrl || process.env.DEEPSEEK_BASE_URL;
    const userModel = body.model || DEEPSEEK_DEFAULT;

    if (!userApiKey) {
      return Response.json({ error: "请先在设置页面配置 DeepSeek API Key" }, { status: 401 });
    }

    // Create client with user's settings
    const client = createDeepSeekClient(userApiKey, userBaseUrl);
    const chapterId = body.chapterId;

    if (!bookId) {
      return Response.json({ error: "Missing bookId" }, { status: 400 });
    }

    const systemPrompt = SYSTEM_PROMPTS[mode] || COMPANION_SYSTEM_PROMPT;

    // Build context-aware system prompt with book info
    const contextSystemPrompt = `${systemPrompt}

当前书籍ID: ${bookId}${chapterId ? `\n当前章节ID: ${chapterId}` : ""}

注意：用户正在阅读这本书。你已经完整阅读了全书的所有章节。当用户询问时，请基于全书内容来回答，可以自由引用任何章节的内容。`;

    const result = streamText({
      model: client(userModel),
      system: contextSystemPrompt,
      messages: messages.slice(-20), // Last 20 messages for context window
      temperature: 0.7,
      maxTokens: 2048,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json(
      {
        error:
          "AI service unavailable. Make sure DEEPSEEK_API_KEY is set in .env.local",
      },
      { status: 500 },
    );
  }
}
