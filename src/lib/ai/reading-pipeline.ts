import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embedding/client";
import { extractSearchTerms, formatRetrievalContext, retrieveRelevantPassages } from "@/lib/rag/book-retriever";
import { isSufficient, searchPassages, type PassageHit } from "@/lib/retrieval/search";
import { buildWebQuery, wantsOutsideKnowledge, webSearch, type WebResult } from "@/lib/web-search";
import { chapterLabel } from "@/lib/text/chapter-label";
import type { ChatMode } from "@/types";

/**
 * Builds the evidence an answer is grounded on. The ladder is deterministic
 * and runs before the model is called — it does not depend on the model
 * supporting tool calls, and "本章" can never be left to a guess:
 *
 *   selection / keywords → current chapter → whole book → book overview
 *                                          ↘ web search (asked for, implied, or book evidence too thin)
 *
 * Every passage handed to the model carries a marker (〔c481〕, 〔w2〕) that it
 * is told to cite, and the same markers are returned as `sources` so the UI
 * can turn a citation into a jump back to the passage.
 */

export type ReadingTier = "chapter" | "book" | "overview" | "none";
export type WebMode = "auto" | "on" | "off";

export interface SourceRef {
  /** Citation marker without brackets: "c481" for a passage, "w2" for a web result. */
  id: string;
  kind: "passage" | "web";
  chapterId?: number | null;
  chapterIndex?: number;
  chapterTitle?: string;
  charStart?: number;
  charEnd?: number;
  preview: string;
  title?: string;
  url?: string;
  site?: string;
}

interface ReadingRequest {
  userId: number;
  bookId: string;
  bookTitle: string;
  chapterId?: string;
  chapterIndex?: number;
  query: string;
  mode: ChatMode;
  /** Text the reader selected in the page, if the question is about it. */
  selection?: string;
  web?: WebMode;
}

interface ResolvedReadingTarget {
  book: { id: number; title: string; author: string | null };
  chapter: { id: number; index: number; title: string | null; content: string } | null;
}

export interface ReadingPipelineResult {
  context: string;
  bookId: number;
  chapterId: number | null;
  /** The widest tier that had to be consulted. */
  tier: ReadingTier;
  /** One line telling the model what it was given; goes at the top priority of the prompt. */
  directive: string;
  sources: SourceRef[];
  webSearched: boolean;
}

const CURRENT_CHAPTER_PATTERN =
  /(本章|这(?:一)?章|当前章(?:节)?|本节|这一节|当前内容|正在读|刚才(?:这段)?|这段|这里|上文)/;
const WHOLE_BOOK_PATTERN =
  /(全书|整本书|整部书|全文|全篇|通读|全局|整本|全书总结|整书总结)/;
const CROSS_CHAPTER_PATTERN =
  /(前后章|其他章|不同章|跨章|全书中|贯穿全书|联系前后|前文|后文)/;

const CHAPTER_BUDGET = 48_000;
const PREVIEW_CHARS = 90;

type Plan = "whole_book" | "current_chapter" | "current_chapter_plus_book" | "ladder";

/**
 * Deterministic on purpose: reading deixis such as “本章” must never depend on
 * semantic search or on the model guessing.
 */
export function planReading(query: string, mode: ChatMode): Plan {
  const normalized = query.trim();
  if (WHOLE_BOOK_PATTERN.test(normalized)) return "whole_book";
  if (CURRENT_CHAPTER_PATTERN.test(normalized)) {
    return CROSS_CHAPTER_PATTERN.test(normalized) ? "current_chapter_plus_book" : "current_chapter";
  }
  // Summary mode is about the chapter on screen; companion questions are
  // open-ended and climb the ladder.
  return mode === "summary" ? "current_chapter" : "ladder";
}

const preview = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, PREVIEW_CHARS);

function passageSource(hit: PassageHit): SourceRef {
  return {
    id: `c${hit.chunkId}`,
    kind: "passage",
    chapterId: hit.chapterId,
    chapterIndex: hit.chapterIndex,
    chapterTitle: hit.chapterTitle,
    charStart: hit.charStart,
    charEnd: hit.charEnd,
    preview: preview(hit.text),
  };
}

function formatPassages(heading: string, hits: PassageHit[]) {
  const body = hits
    .map((hit) => `〔c${hit.chunkId}〕${hit.chapterTitle}\n${hit.text.trim()}`)
    .join("\n\n");
  return `[${heading}]\n\n${body}`;
}

export async function runReadingPipeline(request: ReadingRequest): Promise<ReadingPipelineResult> {
  const target = await resolveReadingTarget(request);
  const { book, chapter } = target;
  const webMode = request.web ?? "auto";
  // A selected passage is the strongest statement of what the reader means.
  const searchText = request.selection ? `${request.selection}\n${request.query}` : request.query;

  const blocks: string[] = [];
  const sources: SourceRef[] = [];
  let tier: ReadingTier = "none";
  let directive = "";
  let sufficient = true;

  // Started early so it overlaps with retrieval; awaited at the end.
  const wantsWeb = webMode === "on" || (webMode === "auto" && wantsOutsideKnowledge(request.query));
  const webQuery = buildWebQuery(book.title, book.author, extractSearchTerms(request.query));
  let webPromise: Promise<WebResult[]> | null = wantsWeb ? webSearch(webQuery, request.userId) : null;

  const indexed = (await prisma.chunk.count({ where: { bookId: book.id }, take: 1 })) > 0;
  const plan = planReading(request.query, request.mode);

  if (plan === "whole_book") {
    blocks.push(await bookOverview(book.id, book.title));
    tier = "overview";
    directive = "本轮已提供全书概览（各章摘要或均匀摘录）。你必须直接回答，不得声称没有收到书籍信息；同时说明这是概览而非逐字通读。";
  } else if (plan === "current_chapter" || plan === "current_chapter_plus_book") {
    if (chapter) {
      const read = await readCurrentChapter(book.title, chapter, indexed);
      blocks.push(read.block);
      sources.push(...read.sources);
      tier = "chapter";
      directive = "本轮已读取阅读器当前章节。你必须直接基于所给正文回答，禁止声称缺少当前书籍/章节信息，也禁止要求用户再次确认章节。";
    } else {
      blocks.push("[提示] 无法定位当前章节。请明确告诉读者当前章节未同步，不要猜测本章内容。");
      directive = "本轮没有取得当前章节；应如实说明。";
      sufficient = false;
    }
    if (plan === "current_chapter_plus_book" && indexed) {
      const wide = await searchPassages({ bookId: book.id, query: searchText, topK: 5 });
      const others = wide.hits.filter((hit) => hit.chapterId !== chapter?.id);
      if (others.length) {
        blocks.push(formatPassages("全书中与问题相关的其他段落", others));
        sources.push(...others.map(passageSource));
        tier = "book";
      }
    }
  } else if (!indexed) {
    // The book was imported moments ago and is not chunked yet.
    const legacy = await retrieveRelevantPassages(book.id, request.query);
    if (legacy.passages.length) {
      blocks.push(formatRetrievalContext(legacy.passages, legacy.bookTitle, request.query));
      tier = "book";
      directive = "本轮已取得全书检索结果。请直接依据检索结果回答。";
    } else if (chapter) {
      const read = await readCurrentChapter(book.title, chapter, false);
      blocks.push(read.block);
      tier = "chapter";
      directive = "全书检索没有结果，已改为提供当前章节正文。请基于它回答，并说明依据仅限本章。";
    } else {
      sufficient = false;
    }
  } else {
    // The ladder. One query embedding serves both rungs.
    const queryVector = await embedQuery(searchText);
    const inChapter = chapter
      ? await searchPassages({ bookId: book.id, chapterId: chapter.id, query: searchText, topK: 5, queryVector })
      : null;

    if (inChapter && isSufficient(inChapter)) {
      blocks.push(formatPassages("当前章节中与问题相关的段落", inChapter.hits));
      sources.push(...inChapter.hits.map(passageSource));
      tier = "chapter";
      directive = "本轮在阅读器当前章节中找到了相关原文。请直接依据这些段落回答。";
    } else {
      const inBook = await searchPassages({ bookId: book.id, query: searchText, topK: 7, queryVector });
      const near = (inChapter?.hits ?? []).slice(0, 2);
      const seen = new Set(near.map((hit) => hit.chunkId));
      const wide = inBook.hits.filter((hit) => !seen.has(hit.chunkId));
      if (near.length) blocks.push(formatPassages("当前章节中最接近的段落", near));
      if (wide.length) blocks.push(formatPassages("全书中与问题相关的段落", wide));
      sources.push(...[...near, ...wide].map(passageSource));
      sufficient = isSufficient(inBook);
      tier = near.length + wide.length ? "book" : "none";
      directive = sufficient
        ? "当前章节证据不足，本轮已扩大到全书检索并找到相关原文。请依据这些段落回答，并指出它们出自哪些章节。"
        : "本轮检索到的书内原文与问题的相关性较弱。只使用确实相关的段落；若书中没有依据，必须明确说明，不得编造。";
    }
  }

  // Thin book evidence is itself a reason to look outside the book.
  if (!webPromise && webMode === "auto" && !sufficient) webPromise = webSearch(webQuery, request.userId);
  const webResults = webPromise ? await webPromise : [];
  if (webResults.length) {
    blocks.push(
      "[联网搜索结果 — 书外资料，可能有误或带立场]\n\n" +
        webResults
          .map((item, i) => `〔w${i + 1}〕${item.title}（${item.site}${item.published ? `，${item.published}` : ""}）\n${item.snippet}`)
          .join("\n\n"),
    );
    sources.push(
      ...webResults.map((item, i) => ({
        id: `w${i + 1}`, kind: "web" as const, title: item.title, url: item.url, site: item.site, preview: preview(item.snippet),
      })),
    );
    directive += " 本轮还提供了联网搜索结果，用于补充背景与评论。";
  }

  return {
    context: [
      "[阅读依据]",
      `当前书籍：《${book.title}》${book.author ? `（${book.author}）` : ""}`,
      chapter ? `阅读器当前章节：${chapterLabel(chapter)}` : "阅读器当前章节：未定位",
      request.selection ? `读者选中的原文：「${request.selection.slice(0, 1500)}」` : "",
      "以下带〔〕标记的内容是回答的唯一事实依据；不得声称读过未提供的原文，不得编造引文。",
      ...blocks,
      "[阅读依据结束]",
    ].filter(Boolean).join("\n\n"),
    bookId: book.id,
    chapterId: chapter?.id ?? null,
    tier,
    directive: directive || "本轮没有取得可用原文；应明确说明证据不足。",
    sources,
    webSearched: !!webPromise,
  };
}

async function resolveReadingTarget(request: ReadingRequest): Promise<ResolvedReadingTarget> {
  const select = { id: true, title: true, author: true } as const;
  const parsedBookId = parsePositiveInt(request.bookId);
  let book = parsedBookId
    ? await prisma.book.findFirst({ where: { id: parsedBookId, userId: request.userId }, select })
    : null;

  // Supports a just-imported book whose client-side temporary ID has not yet
  // been replaced, without ever falling back to another unrelated book.
  if (!book && request.bookTitle.trim()) {
    book = await prisma.book.findFirst({
      where: { title: request.bookTitle.trim(), userId: request.userId },
      orderBy: { updatedAt: "desc" },
      select,
    });
  }
  if (!book) throw new ReadingContextError("找不到当前书籍或无权访问", 404);

  const chapterSelect = { id: true, index: true, title: true, content: true } as const;
  const parsedChapterId = parsePositiveInt(request.chapterId);
  let chapter = parsedChapterId
    ? await prisma.chapter.findFirst({ where: { id: parsedChapterId, bookId: book.id }, select: chapterSelect })
    : null;

  // Chapter index is stable across EPUB parsing and database persistence, so it
  // repairs the UUID-vs-integer mismatch seen immediately after import.
  if (!chapter && Number.isInteger(request.chapterIndex) && request.chapterIndex! >= 0) {
    chapter = await prisma.chapter.findUnique({
      where: { bookId_index: { bookId: book.id, index: request.chapterIndex! } },
      select: chapterSelect,
    });
  }

  return { book, chapter };
}

/**
 * The visible chapter, interleaved with chunk markers so the model can cite
 * the exact passage. Chunks overlap, so each one is trimmed to start where
 * the previous ended and the markers tile the chapter exactly once.
 */
export async function readCurrentChapter(
  bookTitle: string,
  chapter: { id: number; index: number; title: string | null; content: string },
  indexed: boolean,
): Promise<{ block: string; sources: SourceRef[] }> {
  const label = chapterLabel(chapter);
  const chunks = indexed
    ? await prisma.chunk.findMany({
        where: { chapterId: chapter.id },
        orderBy: { ordinal: "asc" },
        select: { id: true, charStart: true, charEnd: true },
      })
    : [];

  if (chunks.length === 0) {
    const complete = chapter.content.length <= CHAPTER_BUDGET;
    return {
      block: [
        `[当前章节正文] 《${bookTitle}》· ${label}`,
        complete ? "以下是当前章节完整正文：" : "当前章节过长，以下为覆盖开头、中段和结尾的摘录；回答中应披露内容经过截取：",
        complete ? chapter.content : takeEvenExcerpts(chapter.content, CHAPTER_BUDGET),
      ].join("\n\n"),
      sources: [],
    };
  }

  // Over budget: keep an even spread of whole chunks rather than cutting mid-sentence.
  const total = chunks[chunks.length - 1].charEnd;
  const keepEvery = total > CHAPTER_BUDGET ? Math.ceil(total / CHAPTER_BUDGET) : 1;
  const parts: string[] = [];
  const sources: SourceRef[] = [];
  let covered = 0;
  chunks.forEach((chunk, i) => {
    const start = Math.max(chunk.charStart, covered);
    covered = Math.max(covered, chunk.charEnd);
    if (i % keepEvery !== 0 || start >= chunk.charEnd) return;
    const text = chapter.content.slice(start, chunk.charEnd).trim();
    if (!text) return;
    parts.push(`〔c${chunk.id}〕\n${text}`);
    sources.push({
      id: `c${chunk.id}`, kind: "passage", chapterId: chapter.id, chapterIndex: chapter.index,
      chapterTitle: label, charStart: chunk.charStart, charEnd: chunk.charEnd, preview: preview(text),
    });
  });

  return {
    block: [
      `[当前章节正文] 《${bookTitle}》· ${label}`,
      keepEvery === 1
        ? "以下是当前章节完整正文，按段落标记分段："
        : `当前章节过长，以下为均匀抽取的约 1/${keepEvery} 段落；回答中应披露内容经过抽样：`,
      parts.join("\n\n"),
    ].join("\n\n"),
    sources,
  };
}

/** Whole-book view: cached chapter summaries when most chapters have one, else even excerpts. */
async function bookOverview(bookId: number, bookTitle: string): Promise<string> {
  const chapters = await prisma.chapter.findMany({
    where: { bookId },
    orderBy: { index: "asc" },
    select: { index: true, title: true, content: true, summary: true },
  });

  const summarised = chapters.filter((chapter) => chapter.summary?.trim());
  if (chapters.length > 0 && summarised.length / chapters.length >= 0.6) {
    return [
      `[全书概览] 《${bookTitle}》共 ${chapters.length} 章，以下为各章摘要（${summarised.length} 章有摘要）。`,
      chapters
        .map((chapter) => `### ${chapterLabel(chapter)}\n${chapter.summary?.trim() || "（本章尚无摘要）"}`)
        .join("\n\n"),
    ].join("\n\n");
  }

  const headingBudget = chapters.reduce((sum, chapter) => sum + chapterLabel(chapter).length + 20, 0);
  const contentBudget = Math.max(12_000, CHAPTER_BUDGET - headingBudget);
  const perChapter = Math.max(300, Math.floor(contentBudget / Math.max(chapters.length, 1)));
  const totalCharacters = chapters.reduce((sum, chapter) => sum + chapter.content.length, 0);
  const isComplete = totalCharacters <= contentBudget;

  return [
    `[全书概览] 《${bookTitle}》共 ${chapters.length} 章。`,
    isComplete
      ? "已读取可用的全书正文。"
      : `全书共 ${totalCharacters} 字符，受模型上下文限制，以下为覆盖每章开头、中段和结尾的均匀摘录；回答时必须说明这是全书概览，不可假装逐字读取了省略部分。`,
    chapters
      .map((chapter) => `### ${chapterLabel(chapter)}\n${isComplete ? chapter.content : takeEvenExcerpts(chapter.content, perChapter)}`)
      .join("\n\n"),
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
