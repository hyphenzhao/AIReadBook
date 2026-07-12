/**
 * Multi-stage book retrieval pipeline:
 *  1. MySQL FULLTEXT search → find relevant chapters/passages
 *  2. Extract surrounding context (±300 chars around matches)
 *  3. Rank & deduplicate → select top 3-5 passages
 *  4. Build structured context for LLM
 */
import { prisma } from "@/lib/prisma";

interface RetrievedPassage {
  chapterTitle: string;
  chapterIndex: number;
  content: string;
  relevance: number; // 0-1
}

/**
 * Full-pipeline retrieval: keyword search → context extraction → ranking
 */
export async function retrieveRelevantPassages(
  bookId: number,
  query: string,
  maxPassages = 5,
): Promise<{ passages: RetrievedPassage[]; bookTitle: string }> {
  // Get book info
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return { passages: [], bookTitle: "" };

  // Stage 1: FULLTEXT search across all chapters
  const chapters = await prisma.$queryRawUnsafe<Array<{
    id: number; index: number; title: string; content: string; relevance: number;
  }>>(
    `SELECT id, \`index\`, title, content,
            MATCH(title, content) AGAINST(?) AS relevance
     FROM chapters
     WHERE book_id = ? AND MATCH(title, content) AGAINST(? IN BOOLEAN MODE)
     ORDER BY relevance DESC
     LIMIT ?`,
    query, bookId, query, maxPassages * 2,
  );

  if (chapters.length === 0) {
    // Fallback: LIKE search
    const fallback = await prisma.$queryRawUnsafe<Array<{
      id: number; index: number; title: string; content: string;
    }>>(
      `SELECT id, \`index\`, title, content FROM chapters
       WHERE book_id = ? AND (title LIKE ? OR content LIKE ?)
       LIMIT ?`,
      bookId, `%${query}%`, `%${query}%`, maxPassages,
    );
    if (fallback.length === 0) {
      return { passages: [], bookTitle: book.title };
    }
    return {
      bookTitle: book.title,
      passages: fallback.map((ch) => ({
        chapterTitle: ch.title || `第${ch.index + 1}章`,
        chapterIndex: ch.index,
        content: extractRelevantSnippet(ch.content, query, 800),
        relevance: 0.5,
      })),
    };
  }

  // Stage 2: Extract relevant snippets with surrounding context
  const passages: RetrievedPassage[] = chapters.map((ch) => ({
    chapterTitle: ch.title || `第${ch.index + 1}章`,
    chapterIndex: ch.index,
    content: extractRelevantSnippet(ch.content, query, 1000),
    relevance: Math.min(ch.relevance / 10, 1), // Normalize MySQL relevance scores
  }));

  // Stage 3: Sort by relevance, take top N
  passages.sort((a, b) => b.relevance - a.relevance);

  return {
    bookTitle: book.title,
    passages: passages.slice(0, maxPassages),
  };
}

/**
 * Extract a relevant snippet from chapter content, centered around keyword matches.
 */
function extractRelevantSnippet(content: string, query: string, maxLen: number): string {
  const keywords = query.split(/\s+/).filter((k) => k.length > 0);
  if (keywords.length === 0) return content.slice(0, maxLen);

  // Find first occurrence of any keyword
  let bestPos = -1;
  for (const kw of keywords) {
    const pos = content.indexOf(kw);
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos;
    }
  }

  if (bestPos === -1) return content.slice(0, maxLen);

  // Extract window around the match
  const halfLen = Math.floor(maxLen / 2);
  const start = Math.max(0, bestPos - halfLen);
  const end = Math.min(content.length, start + maxLen);

  let snippet = content.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";

  return snippet;
}

/**
 * Format retrieved passages into a structured context string for the LLM.
 */
export function formatRetrievalContext(
  passages: RetrievedPassage[],
  bookTitle: string,
  query: string,
): string {
  if (passages.length === 0) {
    return `\n\n---\n你正在阅读《${bookTitle}》。用户问："${query}"。
注意：未在数据库中找到与该问题直接相关的内容。请告知用户，并建议用户提供更多上下文或尝试不同的提问方式。
---\n\n`;
  }

  const header = `\n\n---\n以下是从《${bookTitle}》全书中检索到的与用户问题相关的段落：\n`;

  const body = passages
    .map(
      (p, i) =>
        `### [${i + 1}] ${p.chapterTitle} (相关度: ${Math.round(p.relevance * 100)}%)\n\n${p.content}`,
    )
    .join("\n\n---\n\n");

  const footer = `\n\n---\n请严格基于以上检索到的内容回答用户问题。如果检索结果不足以回答，请诚实说明。引用时请标注章节名。`;

  return header + body + footer;
}
