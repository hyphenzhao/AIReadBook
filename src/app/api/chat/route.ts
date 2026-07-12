import { streamText } from "ai";
import { createDeepSeekClient, DEEPSEEK_DEFAULT } from "@/lib/ai/client";
import { COMPANION_SYSTEM_PROMPT } from "@/lib/ai/prompts/companion";
import { SUMMARY_SYSTEM_PROMPT } from "@/lib/ai/prompts/summary";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/ai/prompts/extraction";
import { TEACHING_SYSTEM_PROMPT } from "@/lib/ai/prompts/teaching";
import { prisma } from "@/lib/prisma";
import { retrieveRelevantPassages, formatRetrievalContext } from "@/lib/rag/book-retriever";
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
    const messages = body.messages || [];
    const mode = (body.mode || "companion") as ChatMode;
    const bookId = body.bookId;
    const bookTitle = body.bookTitle;
    const chapterId = body.chapterId;
    const userApiKey = body.apiKey || process.env.DEEPSEEK_API_KEY;
    const userBaseUrl = body.baseUrl || process.env.DEEPSEEK_BASE_URL;
    const userModel = body.model || DEEPSEEK_DEFAULT;

    if (!userApiKey) {
      return Response.json({ error: "请先在设置页面配置 DeepSeek API Key" }, { status: 401 });
    }
    if (!bookId) {
      return Response.json({ error: "Missing bookId" }, { status: 400 });
    }

    // Extract the user's question (last user message)
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    const userQuery = lastUserMsg?.content || "";

    // --- Resolve bookId (int or UUID, verified against MySQL) ---
    let dbBookId: number | null = null;
    const bookIdNum = parseInt(bookId);
    if (!isNaN(bookIdNum) && bookIdNum > 0) {
      const b = await prisma.book.findUnique({ where: { id: bookIdNum }, select: { id: true } });
      if (b) dbBookId = bookIdNum;
    }
    // Fallback: search by title
    if (!dbBookId && bookTitle) {
      try {
        const b = await prisma.book.findFirst({ where: { title: bookTitle }, orderBy: { updatedAt: "desc" }, select: { id: true } });
        if (b) dbBookId = b.id;
        console.log(`[chat] resolved by title "${bookTitle}" → id=${dbBookId}`);
      } catch {}
    }
    // Last resort: most recent book
    if (!dbBookId) {
      try {
        const books = await prisma.book.findMany({ orderBy: { updatedAt: "desc" }, take: 1 });
        if (books.length > 0) dbBookId = books[0].id;
      } catch {}
    }
    console.log(`[chat] bookId="${bookId}" title="${bookTitle}" → dbBookId=${dbBookId}`);

    // --- Multi-stage retrieval pipeline ---
    let retrievalContext = "";
    let chapterContent = "";

    if (dbBookId && userQuery) {
      const { passages, bookTitle } = await retrieveRelevantPassages(dbBookId, userQuery);
      if (passages.length > 0) {
        retrievalContext = formatRetrievalContext(passages, bookTitle, userQuery);
      }
    }

    // Fallback: load single chapter content
    try {
      if (chapterId && dbBookId) {
        const chId = parseInt(chapterId);
        if (!isNaN(chId)) {
          const ch = await prisma.chapter.findFirst({ where: { id: chId, bookId: dbBookId } });
          if (ch) {
            const content = ch.content.length > 6000 ? ch.content.slice(0, 6000) + "\n...(已截断)" : ch.content;
            chapterContent = `\n\n[当前章节: ${ch.title || `第${ch.index + 1}章`}]\n${content}`;
          }
        }
      }
    } catch {}

    const systemPrompt = SYSTEM_PROMPTS[mode] || COMPANION_SYSTEM_PROMPT;

    // Build augmented messages with retrieval context
    const augmentedMessages = [...messages];
    const contextBlock = retrievalContext || chapterContent;

    if (contextBlock && augmentedMessages.length > 0) {
      for (let i = augmentedMessages.length - 1; i >= 0; i--) {
        if (augmentedMessages[i].role === "user") {
          augmentedMessages[i] = {
            ...augmentedMessages[i],
            content: contextBlock + "\n\n[用户问题]\n" + augmentedMessages[i].content,
          };
          break;
        }
      }
    }

    const client = createDeepSeekClient(userApiKey, userBaseUrl);

    const result = streamText({
      model: client(userModel),
      system: systemPrompt,
      messages: augmentedMessages.slice(-20),
      temperature: 0.7,
      maxTokens: 4096,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json({ error: "AI service unavailable." }, { status: 500 });
  }
}
