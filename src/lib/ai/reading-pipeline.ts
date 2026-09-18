import { prisma } from "@/lib/prisma";
import {
  formatRetrievalContext,
  retrieveRelevantPassages,
} from "@/lib/rag/book-retriever";
import type { ChatMode } from "@/types";

export type ReadingToolName = "read_current_chapter" | "read_book" | "search_book";

interface ReadingRequest {
  userId: number;
  bookId: string;
  bookTitle: string;
  chapterId?: string;
  chapterIndex?: number;
  query: string;
  mode: ChatMode;
}

interface ResolvedReadingTarget {
  book: { id: number; title: string };
  chapter: { id: number; index: number; title: string | null; content: string } | null;
}

export interface ReadingPipelineResult {
  context: string;
  tools: ReadingToolName[];
  bookId: number;
  chapterId: number | null;
}

const CURRENT_CHAPTER_PATTERN =
  /(本章|这(?:一)?章|当前章(?:节)?|本节|这一节|当前内容|正在读|刚才(?:这段)?|这段|这里|上文)/;
const WHOLE_BOOK_PATTERN =
  /(全书|整本书|整部书|全文|全篇|通读|全局|整本|全书总结|整书总结)/;
const CROSS_CHAPTER_PATTERN =
  /(前后章|其他章|不同章|跨章|全书中|贯穿全书|联系前后|前文|后文)/;

/**
 * The planner is deliberately deterministic for reading deixis such as “本章”.
 * Those requests must never depend on semantic search or on the model guessing.
 */
export function planReadingTools(query: string, mode: ChatMode): ReadingToolName[] {
  const normalized = query.trim();
  const wantsWholeBook = WHOLE_BOOK_PATTERN.test(normalized);
  const wantsCurrentChapter = CURRENT_CHAPTER_PATTERN.test(normalized);
  const wantsCrossChapter = CROSS_CHAPTER_PATTERN.test(normalized);

  if (wantsWholeBook) return ["read_book"];

  if (wantsCurrentChapter) {
    return wantsCrossChapter
      ? ["read_current_chapter", "search_book"]
      : ["read_current_chapter"];
  }

  // Summary/extraction/teaching are chapter-oriented modes unless the user
  // explicitly asks for the whole book. Companion mode is open-ended and uses
  // book search for questions that do not point at the visible chapter.
  if (mode !== "companion") return ["read_current_chapter"];
  return ["search_book"];
}

export async function runReadingPipeline(
  request: ReadingRequest,
): Promise<ReadingPipelineResult> {
  const target = await resolveReadingTarget(request);
  const plannedTools = planReadingTools(request.query, request.mode);
  const executedTools: ReadingToolName[] = [];
  const blocks: string[] = [];

  for (const tool of plannedTools) {
    if (tool === "read_current_chapter") {
      if (target.chapter) {
        blocks.push(formatCurrentChapter(target.book.title, target.chapter));
        executedTools.push(tool);
      } else {
        blocks.push(
          "[工具提示] 无法定位当前章节。请明确告诉读者当前章节未同步，不要猜测本章内容。",
        );
      }
      continue;
    }

    if (tool === "read_book") {
      blocks.push(await readBook(target.book.id, target.book.title));
      executedTools.push(tool);
      continue;
    }

    const retrieval = await retrieveRelevantPassages(target.book.id, request.query);
    if (retrieval.passages.length > 0) {
      blocks.push(
        formatRetrievalContext(retrieval.passages, retrieval.bookTitle, request.query),
      );
      executedTools.push(tool);
    } else if (target.chapter) {
      // Search can legitimately miss short/deictic queries. The visible chapter
      // is the safest fallback and is explicitly labelled as such.
      blocks.push(formatCurrentChapter(target.book.title, target.chapter));
      executedTools.push("read_current_chapter");
    } else {
      blocks.push(
        `[工具提示] 在《${target.book.title}》中没有检索到足够的原文依据。请如实说明。`,
      );
    }
  }

  return {
    context: [
      "[阅读工具执行结果]",
      `当前书籍：《${target.book.title}》`,
      target.chapter
        ? `阅读器当前章节：${chapterLabel(target.chapter)}`
        : "阅读器当前章节：未定位",
      target.chapter
        ? `章节唯一定位：bookId=${target.book.id}, chapterId=${target.chapter.id}, chapterIndex=${target.chapter.index}`
        : "章节唯一定位：无",
      `已执行工具：${executedTools.join(", ") || "none"}`,
      "以下内容是回答书内问题的唯一事实依据；不得声称读过未提供的原文，不得编造引文。",
      ...blocks,
      "[阅读工具执行结果结束]",
    ].join("\n\n"),
    tools: executedTools,
    bookId: target.book.id,
    chapterId: target.chapter?.id ?? null,
  };
}

async function resolveReadingTarget(
  request: ReadingRequest,
): Promise<ResolvedReadingTarget> {
  const parsedBookId = parsePositiveInt(request.bookId);
  let book = parsedBookId
    ? await prisma.book.findFirst({
        where: { id: parsedBookId, userId: request.userId },
        select: { id: true, title: true },
      })
    : null;

  // Supports a just-imported book whose client-side temporary ID has not yet
  // been replaced, without ever falling back to another unrelated book.
  if (!book && request.bookTitle.trim()) {
    book = await prisma.book.findFirst({
      where: { title: request.bookTitle.trim(), userId: request.userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    });
  }
  if (!book) throw new ReadingContextError("找不到当前书籍或无权访问", 404);

  const parsedChapterId = parsePositiveInt(request.chapterId);
  let chapter = parsedChapterId
    ? await prisma.chapter.findFirst({
        where: { id: parsedChapterId, bookId: book.id },
        select: { id: true, index: true, title: true, content: true },
      })
    : null;

  // Chapter index is stable across EPUB parsing and database persistence, so it
  // repairs the UUID-vs-integer mismatch seen immediately after import.
  if (!chapter && Number.isInteger(request.chapterIndex) && request.chapterIndex! >= 0) {
    chapter = await prisma.chapter.findUnique({
      where: { bookId_index: { bookId: book.id, index: request.chapterIndex! } },
      select: { id: true, index: true, title: true, content: true },
    });
  }

  return { book, chapter };
}

async function readBook(bookId: number, bookTitle: string): Promise<string> {
  const chapters = await prisma.chapter.findMany({
    where: { bookId },
    orderBy: { index: "asc" },
    select: { index: true, title: true, content: true },
  });

  const maxCharacters = 48_000;
  const headingBudget = chapters.reduce(
    (sum, chapter) => sum + chapterLabel(chapter).length + 20,
    0,
  );
  const contentBudget = Math.max(12_000, maxCharacters - headingBudget);
  const perChapter = Math.max(300, Math.floor(contentBudget / Math.max(chapters.length, 1)));
  const totalCharacters = chapters.reduce((sum, chapter) => sum + chapter.content.length, 0);
  const isComplete = totalCharacters <= contentBudget;

  const body = chapters
    .map((chapter) => {
      const content = isComplete
        ? chapter.content
        : takeEvenExcerpts(chapter.content, perChapter);
      return `### ${chapterLabel(chapter)}\n${content}`;
    })
    .join("\n\n");

  return [
    `[工具: read_book] 《${bookTitle}》共 ${chapters.length} 章。`,
    isComplete
      ? "已读取可用的全书正文。"
      : `全书共 ${totalCharacters} 字符，受模型上下文限制，以下为覆盖每章开头、中段和结尾的均匀摘录；回答时必须说明这是全书概览，不可假装逐字读取了省略部分。`,
    body,
    "[工具: read_book 结束]",
  ].join("\n\n");
}

function formatCurrentChapter(
  bookTitle: string,
  chapter: { index: number; title: string | null; content: string },
): string {
  const maxCharacters = 48_000;
  const isComplete = chapter.content.length <= maxCharacters;
  const content = isComplete
    ? chapter.content
    : takeEvenExcerpts(chapter.content, maxCharacters);
  return [
    `[工具: read_current_chapter] 《${bookTitle}》· ${chapterLabel(chapter)}`,
    isComplete
      ? "以下是当前章节完整正文："
      : "当前章节过长，以下为覆盖开头、中段和结尾的摘录；回答中应披露内容经过截取：",
    content,
    "[工具: read_current_chapter 结束]",
  ].join("\n\n");
}

function takeEvenExcerpts(content: string, budget: number): string {
  if (content.length <= budget) return content;
  const separator = "\n……[中间内容按上下文预算省略]……\n";
  const segmentLength = Math.max(1, Math.floor((budget - separator.length * 2) / 3));
  const middleStart = Math.max(0, Math.floor((content.length - segmentLength) / 2));
  return [
    content.slice(0, segmentLength),
    content.slice(middleStart, middleStart + segmentLength),
    content.slice(-segmentLength),
  ].join(separator);
}

function chapterLabel(chapter: { index: number; title: string | null }): string {
  const title = chapter.title?.trim();
  const content = "content" in chapter && typeof chapter.content === "string"
    ? chapter.content
    : "";

  // Some public-domain EPUBs reuse a publisher label (for example
  // “传硕公版书”) as every navigation title. In that case use the first short,
  // distinct正文 heading so the model receives a meaningful chapter identity.
  if (!title || /(公版书|电子书|ebook|untitled|无标题)/i.test(title)) {
    const derived = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) =>
        line.length >= 2 &&
        line.length <= 40 &&
        line !== title &&
        !/^https?:\/\//i.test(line) &&
        !/^(关于我们|制作说明|版权|目录)$/.test(line),
      );
    if (derived) return derived;
  }

  return title || `第${chapter.index + 1}章`;
}

function parsePositiveInt(value?: string): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export class ReadingContextError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ReadingContextError";
  }
}
