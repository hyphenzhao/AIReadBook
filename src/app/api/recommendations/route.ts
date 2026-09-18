import { generateText } from "ai";
import { getUserLLM, LLMConfigError } from "@/lib/ai/user-llm";
import { searchAllSources } from "@/lib/search/external-books";
import { getSessionUserId } from "@/lib/auth-session";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }
    const { bookTitle, bookAuthor, topics } = await req.json();

    if (!bookTitle) {
      return Response.json({ error: "Missing bookTitle" }, { status: 400 });
    }

    // Generate search queries based on book content
    const prompt = `你是一个书籍推荐专家。读者刚读完（或正在读）《${bookTitle}》${bookAuthor ? `，作者是 ${bookAuthor}` : ""}。
${topics && topics.length > 0 ? `这本书涉及的主题包括：${topics.join("、")}` : ""}

请基于这本书推荐5本相关书籍。对每本书，提供书名和作者（用中文），以及简短的推荐理由。
输出格式：每行一本，格式为 "书名 - 作者：理由"
只输出推荐列表，不要其他内容。`;

    const llm = await getUserLLM(userId);
    const result = await generateText({
      model: llm.model,
      prompt,
      temperature: 0.7,
      maxTokens: 500,
    });

    // Parse recommendations
    const lines = result.text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes(" - "));

    const recommendations = await Promise.all(
      lines.slice(0, 5).map(async (line) => {
        const match = line.match(/^(.+?) - (.+?)：(.+)$/);
        if (!match) return null;
        const [, title, author, reason] = match;

        // Search for the book
        const results = await searchAllSources(`${title} ${author}`);
        const found = results[0];

        return {
          title: title.trim(),
          author: author.trim(),
          reason: reason.trim(),
          coverUrl: found?.coverUrl || null,
          sourceId: found?.sourceId || null,
          source: found?.source || null,
        };
      }),
    );

    return Response.json({
      recommendations: recommendations.filter(Boolean),
    });
  } catch (error) {
    if (error instanceof LLMConfigError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Recommendation error:", error);
    return Response.json(
      { error: "Recommendation generation failed" },
      { status: 500 },
    );
  }
}
