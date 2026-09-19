import type { Job } from "@prisma/client";
import type { JobContext } from "@/lib/jobs/worker";
import { indexBook } from "@/lib/knowledge/index-book";
import { extractChapterGraph } from "@/lib/knowledge/graph-extract";
import { ingestPaper } from "@/lib/papers/ingest";

type Handler = (job: Job, ctx: JobContext) => Promise<void>;

const payloadOf = (job: Job) => (job.payload ?? {}) as Record<string, unknown>;

export const JOB_HANDLERS: Record<string, Handler> = {
  index_book: (job, ctx) => indexBook(Number(payloadOf(job).bookId), ctx),
  graph_extract: (job, ctx) => extractChapterGraph(Number(payloadOf(job).chapterId), ctx),
  ingest_paper: (job, ctx) => ingestPaper(Number(payloadOf(job).paperId), ctx),
};
