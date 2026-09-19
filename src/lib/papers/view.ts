import type { Prisma } from "@prisma/client";

/** Columns and relations a paper needs when it is listed or opened. */
export const PAPER_SELECT = {
  id: true, title: true, authors: true, year: true, venue: true, doi: true, arxivId: true,
  abstract: true, language: true, status: true, rating: true, notes: true, pageCount: true,
  pipelineStage: true, pipelineError: true, createdAt: true, updatedAt: true,
  file: { select: { bytes: true, originalName: true } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
  collections: { select: { collectionId: true } },
} satisfies Prisma.PaperSelect;

type PaperRow = Prisma.PaperGetPayload<{ select: typeof PAPER_SELECT }>;

/** Stages during which the pipeline is still working on the paper. */
export const BUSY_STAGES = ["FETCHING", "UPLOADED", "EXTRACTING", "CHUNKING", "EMBEDDING", "ANALYZING", "LINKING"];

export function paperView(paper: PaperRow) {
  return {
    id: paper.id,
    title: paper.title,
    authors: Array.isArray(paper.authors) ? (paper.authors as string[]) : [],
    year: paper.year,
    venue: paper.venue,
    doi: paper.doi,
    arxivId: paper.arxivId,
    abstract: paper.abstract,
    language: paper.language,
    status: paper.status,
    rating: paper.rating,
    notes: paper.notes,
    pageCount: paper.pageCount,
    hasFile: !!paper.file,
    fileBytes: paper.file?.bytes ?? null,
    fileName: paper.file?.originalName ?? null,
    stage: paper.pipelineStage,
    stageError: paper.pipelineError,
    processing: BUSY_STAGES.includes(paper.pipelineStage),
    tags: paper.tags.map((t) => t.tag),
    collectionIds: paper.collections.map((c) => c.collectionId),
    createdAt: paper.createdAt.toISOString(),
    updatedAt: paper.updatedAt.toISOString(),
  };
}

export type PaperView = ReturnType<typeof paperView>;
