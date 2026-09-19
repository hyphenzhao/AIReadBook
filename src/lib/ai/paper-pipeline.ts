import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embedding/client";
import { extractSearchTerms } from "@/lib/rag/book-retriever";
import { isPaperEvidenceSufficient, searchPaperPassages, type PaperPassageHit } from "@/lib/retrieval/paper-search";
import { passageBoxes } from "@/lib/papers/layout";
import { wantsOutsideKnowledge, webSearch, type WebResult } from "@/lib/web-search";
import { ReadingContextError, type SourceRef, type WebMode } from "@/lib/ai/reading-pipeline";

/**
 * Evidence for a question about a paper. Same idea as the book ladder — run
 * deterministically before the model is called — but with a rung books do not
 * have: the rest of the library, because research questions are so often
 * "and what do my other papers say?".
 *
 *   selection / keywords → the pages in view → this paper → the whole library
 *                                            ↘ web search
 *
 * Nothing here touches the PDF. Text, page numbers and highlight boxes all
 * come from what was extracted once at upload.
 */

export type PaperTier = "pages" | "paper" | "library" | "overview" | "none";

export interface PaperPipelineResult {
  context: string;
  paperId: number;
  tier: PaperTier;
  directive: string;
  sources: SourceRef[];
  webSearched: boolean;
}

interface PaperRequest {
  userId: number;
  paperId: string;
  /** The page the reader is looking at. */
  page?: number;
  query: string;
  selection?: string;
  web?: WebMode;
}

const WHOLE_PAPER = /(全文|整篇|这篇(?:文献|论文|文章)(?:的)?(?:主要|核心|总体)|总结(?:一下)?(?:这篇|本文|全文)|本文(?:的)?(?:主要|核心)|main (?:idea|contribution)|summar(?:y|ize))/i;
const LIBRARY = /(其他(?:文献|论文|文章)|别的(?:文献|论文)|文献库|我的(?:文献|论文)|相关(?:文献|研究|工作)|哪些(?:文献|论文)|other papers|related work|my (?:library|papers))/i;

const preview = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 90);

async function toSource(hit: PaperPassageHit): Promise<SourceRef> {
  return {
    id: `c${hit.chunkId}`,
    kind: "passage",
    paperId: hit.paperId,
    paperTitle: hit.paperTitle,
    page: hit.pageStart,
    chapterTitle: hit.section ?? undefined,
    charStart: hit.charStart,
    charEnd: hit.charEnd,
    preview: preview(hit.text),
    pageBoxes: await passageBoxes(hit.paperId, hit.charStart, hit.charEnd),
  };
}

function formatHits(heading: string, hits: PaperPassageHit[], currentPaperId: number) {
  const body = hits.map((hit) => {
    const where = [
      hit.paperId === currentPaperId ? null : `《${hit.paperTitle}》`,
      hit.section,
      hit.pageStart === hit.pageEnd ? `p.${hit.pageStart}` : `p.${hit.pageStart}–${hit.pageEnd}`,
    ].filter(Boolean).join(" · ");
    return `〔c${hit.chunkId}〕${where}\n${hit.text.trim()}`;
  }).join("\n\n");
  return `[${heading}]\n\n${body}`;
}

export async function runPaperPipeline(request: PaperRequest): Promise<PaperPipelineResult> {
  const paperId = Number(request.paperId);
  const paper = Number.isInteger(paperId) && paperId > 0
    ? await prisma.paper.findFirst({
        where: { id: paperId, userId: request.userId },
        select: { id: true, title: true, authors: true, year: true, venue: true, abstract: true, pipelineStage: true, pageCount: true, analysis: { select: { data: true } } },
      })
    : null;
  if (!paper) throw new ReadingContextError("找不到这篇文献或无权访问", 404);

  const indexed = (await prisma.chunk.count({ where: { paperId }, take: 1 })) > 0;
  if (!indexed) {
    throw new ReadingContextError(
      paper.pipelineStage === "FAILED" ? "这篇文献的文字提取失败了，AI 暂时读不了它" : "这篇文献还在后台处理，稍等片刻就可以提问了",
      409,
    );
  }

  const { userId } = request;
  const webMode = request.web ?? "auto";
  const searchText = request.selection ? `${request.selection}\n${request.query}` : request.query;
  const authors = Array.isArray(paper.authors) ? (paper.authors as string[]) : [];

  const blocks: string[] = [];
  const hits: PaperPassageHit[] = [];
  let tier: PaperTier = "none";
  let directive = "";
  let sufficient = true;

  const wantsWeb = webMode === "on" || (webMode === "auto" && wantsOutsideKnowledge(request.query));
  const webQuery = [paper.title.slice(0, 120), ...extractSearchTerms(request.query).slice(0, 4)].join(" ");
  let webPromise: Promise<WebResult[]> | null = wantsWeb ? webSearch(webQuery, userId) : null;

  const queryVector = await embedQuery(searchText);
  const add = (heading: string, found: PaperPassageHit[]) => {
    const seen = new Set(hits.map((hit) => hit.chunkId));
    const fresh = found.filter((hit) => !seen.has(hit.chunkId));
    if (fresh.length) { blocks.push(formatHits(heading, fresh, paperId)); hits.push(...fresh); }
    return fresh.length;
  };

  if (WHOLE_PAPER.test(request.query)) {
    // A question about the paper as a whole is answered from its abstract and
    // structured reading, plus the passages closest to the question.
    const overview = [paper.abstract ? `摘要：${paper.abstract}` : "", paper.analysis ? `结构化精读：${JSON.stringify(paper.analysis.data).slice(0, 6000)}` : ""].filter(Boolean).join("\n\n");
    if (overview) blocks.push(`[本文概览]\n\n${overview}`);
    add("本文中与问题最相关的段落", (await searchPaperPassages({ userId, paperId, query: searchText, topK: 8, queryVector })).hits);
    tier = "overview";
    directive = "本轮已提供本文的摘要、结构化精读和相关段落。请直接回答，并标出依据的段落。";
  } else {
    const page = request.page && request.page >= 1 ? request.page : null;
    // Always look first at what is on screen: that is what the question is most likely about.
    const near = page
      ? await searchPaperPassages({ userId, paperId, pages: { from: Math.max(1, page - 1), to: page + 1 }, query: searchText, topK: 4, queryVector })
      : null;

    if (near && isPaperEvidenceSufficient(near) && !LIBRARY.test(request.query)) {
      add(`读者正在看的第 ${page} 页附近`, near.hits);
      tier = "pages";
      directive = "本轮在读者正在看的页面附近找到了相关原文。请直接依据这些段落回答。";
    } else {
      if (near) add(`读者正在看的第 ${page} 页附近`, near.hits.slice(0, 2));
      const inPaper = await searchPaperPassages({ userId, paperId, query: searchText, topK: 6, queryVector });
      add("本文中与问题相关的段落", inPaper.hits);
      tier = "paper";
      sufficient = isPaperEvidenceSufficient(inPaper);
      directive = sufficient
        ? "本轮已在全文中找到相关原文。请依据这些段落回答，并指出所在的章节和页码。"
        : "本文中与问题相关的原文较少。只使用确实相关的段落；文中没有的内容必须明确说明。";

      // The rung books do not have: what the reader's other papers say.
      if (!sufficient || LIBRARY.test(request.query)) {
        const inLibrary = await searchPaperPassages({ userId, excludePaperId: paperId, query: searchText, topK: 6, queryVector });
        if (add("文献库中其他文献的相关段落", inLibrary.hits)) {
          tier = "library";
          sufficient = sufficient || isPaperEvidenceSufficient(inLibrary);
          directive += " 本轮还检索了读者文献库中的其他文献；引用它们时必须说明出自哪一篇，不要与本文的观点混为一谈。";
        }
      }
    }
  }

  if (!webPromise && webMode === "auto" && !sufficient) webPromise = webSearch(webQuery, userId);
  const webResults = webPromise ? await webPromise : [];
  const sources = await Promise.all(hits.map(toSource));
  if (webResults.length) {
    blocks.push(
      "[联网搜索结果 — 文献之外的资料，可能有误或带立场]\n\n" +
        webResults.map((item, i) => `〔w${i + 1}〕${item.title}（${item.site}${item.published ? `，${item.published}` : ""}）\n${item.snippet}`).join("\n\n"),
    );
    sources.push(...webResults.map((item, i) => ({ id: `w${i + 1}`, kind: "web" as const, title: item.title, url: item.url, site: item.site, preview: preview(item.snippet) })));
    directive += " 本轮还提供了联网搜索结果，用于补充背景。";
  }

  return {
    context: [
      "[阅读依据]",
      `当前文献：${paper.title}`,
      [authors.slice(0, 6).join(", "), paper.venue, paper.year].filter(Boolean).join(" · "),
      request.page ? `读者正在看：第 ${request.page} / ${paper.pageCount} 页` : "",
      request.selection ? `读者选中的原文：「${request.selection.slice(0, 1500)}」` : "",
      "以下带〔〕标记的内容是回答的唯一事实依据；不得声称读过未提供的原文，不得编造引文、数据或页码。",
      ...blocks,
      "[阅读依据结束]",
    ].filter(Boolean).join("\n\n"),
    paperId,
    tier: hits.length || tier === "overview" ? tier : "none",
    directive: directive || "本轮没有取得可用原文；应明确说明证据不足。",
    sources,
    webSearched: !!webPromise,
  };
}
