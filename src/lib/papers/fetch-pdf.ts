import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/jobs/queue";
import type { JobContext } from "@/lib/jobs/worker";
import { enqueuePaperIngest } from "@/lib/papers/ingest";
import { storePdfUpload } from "@/lib/papers/storage";

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
// Only open-access hosts the app itself decides to fetch from; never a URL a user typed.
const ALLOWED_HOSTS = ["arxiv.org", "export.arxiv.org"];

export function enqueuePdfFetch(paperId: number, userId: number, url: string) {
  return enqueueJob("fetch_paper_pdf", { paperId, url }, { userId, dedupeKey: `fetch_paper_pdf:${paperId}`, maxAttempts: 3 });
}

/**
 * Downloads an open-access PDF for an entry that was added by identifier, then
 * hands it to the normal pipeline. A background job because the link can be
 * slow — arXiv was measured at ~35 KB/s from this server, minutes per paper —
 * and the reader should not wait on it.
 */
export async function fetchPaperPdf(paperId: number, url: string, ctx: JobContext) {
  const paper = await prisma.paper.findUnique({ where: { id: paperId }, select: { id: true, userId: true, arxivId: true, file: { select: { paperId: true } } } });
  if (!paper || paper.file) return; // deleted, or a PDF was uploaded by hand in the meantime
  if (!ALLOWED_HOSTS.includes(new URL(url).hostname)) throw new Error(`refusing to fetch from ${new URL(url).hostname}`);

  await ctx.progress("downloading", 5);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: "follow", headers: { "User-Agent": "AIReadBook/1.0 (self-hosted reading assistant)" } });
    if (!res.ok || !res.body) throw new Error(`the server answered ${res.status}`);
    const stored = await storePdfUpload(paper.userId, res.body as ReadableStream<Uint8Array>);

    const clash = await prisma.paperFile.findUnique({ where: { userId_sha256: { userId: paper.userId, sha256: stored.sha256 } } });
    if (clash) {
      await prisma.paper.update({ where: { id: paperId }, data: { pipelineStage: "NO_FILE", pipelineError: "这份 PDF 已经在文献库的另一条记录里了。" } });
      return;
    }
    await prisma.paperFile.create({
      data: { paperId, userId: paper.userId, sha256: stored.sha256, bytes: stored.bytes, path: stored.path, originalName: `arXiv-${paper.arxivId ?? paperId}.pdf` },
    });
    await prisma.paper.update({ where: { id: paperId }, data: { pipelineStage: "UPLOADED", pipelineError: null } });
    await enqueuePaperIngest(paperId, paper.userId);
  } catch (error) {
    await prisma.paper.update({
      where: { id: paperId },
      data: { pipelineStage: "NO_FILE", pipelineError: "PDF 没能自动下载下来（网络较慢或被拒绝），可以手动上传这篇的 PDF。" },
    }).catch(() => {});
    throw error;
  }
}
