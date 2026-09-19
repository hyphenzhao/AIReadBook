import { gzipSync } from "zlib";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/knowledge/graph-names";
import { chunkText } from "@/lib/text/chunker";
import { embeddingModel, embedTexts, vectorToBytes } from "@/lib/embedding/client";
import { enqueueJob } from "@/lib/jobs/queue";
import type { JobContext } from "@/lib/jobs/worker";
import { extractPdf, pdfInfo, type ExtractedPageWithOcr } from "@/lib/papers/extract";
import { resolveStored } from "@/lib/papers/storage";
import { detectSections, findArxivId, findDoi, sectionAt } from "@/lib/papers/structure";
import { fetchArxiv, fetchCrossref, plausibleAuthors, plausibleTitle, type PaperMetadata } from "@/lib/papers/metadata";
import { invalidatePaperVectors } from "@/lib/vector/papers";
import { analyzePaper, mergePaperIntoGraph } from "@/lib/papers/analyze";
import { computePaperLinks } from "@/lib/papers/links";
import { LLMConfigError } from "@/lib/ai/user-llm";

const EMBED_GROUP = 64;
const PAGE_SEPARATOR = "\n\n";

export function enqueuePaperIngest(paperId: number, userId: number) {
  return enqueueJob("ingest_paper", { paperId }, { userId, dedupeKey: `ingest_paper:${paperId}` });
}

const setStage = (paperId: number, pipelineStage: string, pipelineError: string | null = null) =>
  prisma.paper.update({ where: { id: paperId }, data: { pipelineStage, pipelineError } });

/**
 * AI reading → paper graph → links to other papers. Also run on its own when
 * the reader asks for a paper to be re-read (job "analyze_paper").
 */
export async function understandPaper(paperId: number, ctx: JobContext): Promise<{ stage: string; note: string | null }> {
  try {
    await setStage(paperId, "ANALYZING");
    await ctx.progress("analyzing", 96);
    const analysis = await analyzePaper(paperId);
    if (analysis) await mergePaperIntoGraph(paperId, analysis);

    await setStage(paperId, "LINKING");
    await ctx.progress("linking", 98);
    await computePaperLinks(paperId);
    return { stage: "READY", note: null };
  } catch (error) {
    if (error instanceof LLMConfigError) {
      return { stage: "NEEDS_KEY", note: "还没有配置 AI，所以没有做精读和文献关联。配置后在文献的「精读」页点「重新精读」即可。" };
    }
    console.error(`[papers] understanding paper ${paperId} failed`, error);
    return { stage: "READY", note: "AI 精读这一步没有成功，可以在「精读」页重试。阅读、检索和提问不受影响。" };
  }
}

export function enqueuePaperAnalysis(paperId: number, userId: number) {
  return enqueueJob("analyze_paper", { paperId }, { userId, dedupeKey: `analyze_paper:${paperId}`, maxAttempts: 2 });
}

/** Job "analyze_paper": re-read one paper and refresh its links. */
export async function reanalyzePaper(paperId: number, ctx: JobContext) {
  const exists = await prisma.paper.findUnique({ where: { id: paperId }, select: { id: true } });
  if (!exists) return;
  const result = await understandPaper(paperId, ctx);
  await setStage(paperId, result.stage, result.note);
}

/** The title as a reader would recognise it: the tallest text on the first page. */
function titleFromFirstPage(page: ExtractedPageWithOcr | undefined) {
  if (!page) return null;
  const candidates = page.blocks
    .filter((b) => b.lineCount <= 4 && b.s < page.text.length * 0.5)
    .map((b) => ({ text: page.text.slice(b.s, b.e).replace(/\s+/g, " ").trim(), height: b.lineHeight }))
    .filter((b) => b.text.length >= 12 && b.text.length <= 300 && !/^(abstract|article|research|original|review|arxiv|doi|https?:)/i.test(b.text));
  candidates.sort((a, b) => b.height - a.height);
  return candidates[0]?.text ?? null;
}

/**
 * The one-time processing of an uploaded PDF. The reader can open the PDF the
 * moment it is uploaded; this makes it searchable and readable by the AI, so
 * the PDF itself is never parsed again. Every stage replaces its own earlier
 * output, so a retry after a crash picks up cleanly.
 */
export async function ingestPaper(paperId: number, ctx: JobContext) {
  const paper = await prisma.paper.findUnique({ where: { id: paperId }, include: { file: true } });
  if (!paper) return; // deleted while queued
  if (!paper.file) { await setStage(paperId, "NO_FILE"); return; }
  const { userId } = paper;

  try {
    // 1. Text and layout, page by page.
    await setStage(paperId, "EXTRACTING");
    await ctx.progress("extracting", 2);
    const file = resolveStored(paper.file.path);
    const info = await pdfInfo(file);
    if (info.encrypted) throw new Error("PDF 已加密，无法读取文字");
    const pages: ExtractedPageWithOcr[] = await extractPdf(file, (done, total, phase) =>
      ctx.progress(phase === "ocr" ? `ocr ${done}/${total}` : "extracting", phase === "ocr" ? 10 + (done / total) * 25 : 10),
    );
    if (pages.length === 0) throw new Error("PDF 中没有可读取的页面");

    const pageOffsets: number[] = [];
    let fullText = "";
    for (const page of pages) {
      if (fullText) fullText += PAGE_SEPARATOR;
      pageOffsets.push(fullText.length);
      fullText += page.text;
    }

    await prisma.$transaction([
      prisma.paperPage.deleteMany({ where: { paperId } }),
      prisma.paperPage.createMany({
        data: pages.map((page, i) => ({
          paperId,
          pageNo: page.pageNo,
          width: page.width,
          height: page.height,
          charStart: pageOffsets[i],
          text: page.text,
          layout: gzipSync(JSON.stringify(page.lines)),
          isOcr: !!page.isOcr,
        })),
      }),
      prisma.paper.update({ where: { id: paperId }, data: { pageCount: pages.length } }),
    ]);

    // 2. Who wrote it and where: identifiers in the text, then the registries.
    await ctx.progress("metadata", 38);
    const front = [info.subject, info.keywords, pages[0]?.text, pages[1]?.text].filter(Boolean).join("\n");
    const doi = paper.doi ?? findDoi(front);
    const arxivId = paper.arxivId ?? findArxivId(front);
    const looked: PaperMetadata = (doi && (await fetchCrossref(doi))) || (arxivId && (await fetchArxiv(arxivId))) || {};

    const { sections, referencesStart } = detectSections(pages, pageOffsets);
    const abstractSection = sections.find((s) => /^(abstract|摘\s*要)/i.test(s.title));
    const abstractEnd = abstractSection ? sections.find((s) => s.start > abstractSection.start)?.start : undefined;
    const abstractFromText = abstractSection
      ? fullText.slice(abstractSection.start + abstractSection.title.length, abstractEnd ?? abstractSection.start + 3000).trim().slice(0, 3000)
      : null;

    // Was this paper already imported from BibTeX or by DOI, waiting for its PDF?
    // Then that entry — with whatever tags, collections and notes it was given —
    // is the one to keep: its record moves onto this paper and it goes away.
    const pdfTitle = looked.title ?? plausibleTitle(info.title) ?? titleFromFirstPage(pages[0]);
    const waiting = await prisma.paper.findMany({
      where: { userId, pipelineStage: "NO_FILE", id: { not: paperId } },
      include: { tags: true, collections: true },
    });
    const twin = waiting.find((other) =>
      (doi && other.doi?.toLowerCase() === doi) ||
      (arxivId && other.arxivId?.replace(/v\d+$/, "") === arxivId.replace(/v\d+$/, "")) ||
      (pdfTitle && normalizeName(other.title).length >= 20 && normalizeName(other.title) === normalizeName(pdfTitle)),
    );
    if (twin) {
      await prisma.$transaction([
        prisma.paper.update({
          where: { id: paperId },
          data: {
            title: twin.title, authors: twin.authors as Prisma.InputJsonValue, year: twin.year, venue: twin.venue,
            doi: twin.doi ?? doi, arxivId: twin.arxivId ?? arxivId, abstract: twin.abstract, notes: twin.notes,
            status: twin.status, rating: twin.rating,
          },
        }),
        prisma.paperTag.createMany({ data: twin.tags.map((t) => ({ paperId, tagId: t.tagId })), skipDuplicates: true }),
        prisma.paperCollectionItem.createMany({ data: twin.collections.map((c) => ({ paperId, collectionId: c.collectionId })), skipDuplicates: true }),
        prisma.paper.delete({ where: { id: twin.id } }),
      ]);
      Object.assign(paper, { title: twin.title, authors: twin.authors, year: twin.year, venue: twin.venue, abstract: twin.abstract });
    }

    // Only fill what is still the upload-time placeholder; never overwrite the reader's edits.
    const placeholderTitle = paper.title === paper.file.originalName.replace(/\.pdf$/i, "");
    const authors = Array.isArray(paper.authors) ? (paper.authors as string[]) : [];
    await prisma.paper.update({
      where: { id: paperId },
      data: {
        doi: doi ?? undefined,
        arxivId: arxivId ?? undefined,
        title: placeholderTitle
          ? (looked.title ?? plausibleTitle(info.title) ?? titleFromFirstPage(pages[0]) ?? paper.title).slice(0, 1000)
          : undefined,
        authors: authors.length ? undefined : looked.authors?.length ? looked.authors : plausibleAuthors(info.author),
        year: paper.year ?? looked.year,
        venue: paper.venue ?? looked.venue?.slice(0, 500),
        abstract: paper.abstract ?? looked.abstract ?? (abstractFromText || undefined),
        language: paper.language ?? (/[一-鿿]/.test(fullText.slice(0, 3000)) ? "zh" : "en"),
      },
    });

    // 3. Retrieval chunks. They never cross a section boundary, and the
    //    reference list is left out: it matches every query and answers none.
    await setStage(paperId, "CHUNKING");
    await ctx.progress("chunking", 45);
    const bodyEnd = referencesStart ?? fullText.length;
    const cuts = [0, ...sections.map((s) => s.start).filter((start) => start > 0 && start < bodyEnd), bodyEnd];
    const pageOf = (offset: number) => {
      let page = 1;
      for (let i = 0; i < pageOffsets.length; i++) if (pageOffsets[i] <= offset) page = i + 1;
      return page;
    };
    const chunks: { text: string; charStart: number; charEnd: number; section: string | null; pageStart: number; pageEnd: number }[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      for (const piece of chunkText(fullText.slice(cuts[i], cuts[i + 1]))) {
        const charStart = cuts[i] + piece.charStart;
        const charEnd = cuts[i] + piece.charEnd;
        if (piece.text.replace(/\s/g, "").length < 40) continue; // headings on their own, page furniture
        chunks.push({
          text: piece.text, charStart, charEnd,
          section: sectionAt(sections, charStart)?.title.slice(0, 300) ?? null,
          pageStart: pageOf(charStart), pageEnd: pageOf(Math.max(charStart, charEnd - 1)),
        });
      }
    }
    await prisma.$transaction([
      prisma.chunk.deleteMany({ where: { paperId } }),
      prisma.chunk.createMany({
        data: chunks.map((chunk, ordinal) => ({ userId, sourceType: "PAPER" as const, paperId, ordinal, ...chunk })),
      }),
    ]);

    // 4. Embeddings. Without a server the paper is still readable and keyword-searchable.
    await setStage(paperId, "EMBEDDING");
    const model = embeddingModel();
    const pending = await prisma.chunk.findMany({ where: { paperId }, select: { id: true, text: true }, orderBy: { ordinal: "asc" } });
    let embedded = true;
    for (let i = 0; i < pending.length; i += EMBED_GROUP) {
      const group = pending.slice(i, i + EMBED_GROUP);
      const vectors = await embedTexts(group.map((chunk) => chunk.text));
      if (!vectors) { embedded = false; break; }
      await prisma.embedding.createMany({
        data: group.map((chunk, n) => ({ chunkId: chunk.id, model, dim: vectors[n].length, vec: vectorToBytes(vectors[n]) })),
      });
      await ctx.progress("embedding", 50 + ((i + group.length) / pending.length) * 45);
    }
    invalidatePaperVectors(userId);
    const embedNote = embedded ? null : "向量服务不可用：目前只能按关键词检索。";

    // 5–6. The structured reading and the links to other papers. From here on
    //      nothing may fail the job: the paper is already readable, searchable
    //      and open to questions.
    const understood = await understandPaper(paperId, ctx);
    await setStage(paperId, understood.stage, [embedNote, understood.note].filter(Boolean).join(" ") || null);
    await ctx.progress(`done: ${pages.length} pages, ${chunks.length} chunks`, 100);
  } catch (error) {
    await setStage(paperId, "FAILED", (error instanceof Error ? error.message : String(error)).slice(0, 1000)).catch(() => {});
    throw error;
  }
}
