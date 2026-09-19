import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { enqueuePaperIngest } from "@/lib/papers/ingest";
import { storePdfUpload, UploadError } from "@/lib/papers/storage";
import { PAPER_SELECT, paperView } from "@/lib/papers/view";

export const maxDuration = 300;

/**
 * Uploads one PDF. The file is the raw request body (not multipart), streamed
 * to disk while it is hashed; its name travels in `X-Filename` (URI-encoded).
 * `?paperId=` attaches the PDF to an entry created without one (BibTeX, DOI).
 *
 * Responds as soon as the file is stored. The paper can be opened right away;
 * text extraction and indexing continue in the background.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireSessionUserId();
    if (!req.body) return Response.json({ error: "没有收到文件" }, { status: 400 });

    let originalName = "paper.pdf";
    try {
      originalName = decodeURIComponent(req.headers.get("x-filename") || originalName).replace(/[\\/\0]/g, "_").slice(0, 300);
    } catch {}
    const attachTo = Number(new URL(req.url).searchParams.get("paperId")) || null;

    const stored = await storePdfUpload(userId, req.body);

    // The same PDF again is the same paper, not a second copy.
    const duplicate = await prisma.paperFile.findUnique({
      where: { userId_sha256: { userId, sha256: stored.sha256 } },
      select: { paperId: true },
    });
    if (duplicate && duplicate.paperId !== attachTo) {
      const existing = await prisma.paper.findUnique({ where: { id: duplicate.paperId }, select: PAPER_SELECT });
      return Response.json({ paper: existing && paperView(existing), duplicate: true });
    }

    const fileData = { userId, sha256: stored.sha256, bytes: stored.bytes, path: stored.path, originalName };
    let paperId: number;
    if (attachTo) {
      const target = await prisma.paper.findFirst({ where: { id: attachTo, userId }, select: { id: true } });
      if (!target) return Response.json({ error: "找不到要挂接的文献条目" }, { status: 404 });
      await prisma.paperFile.upsert({ where: { paperId: target.id }, create: { paperId: target.id, ...fileData }, update: fileData });
      await prisma.paper.update({ where: { id: target.id }, data: { pipelineStage: "UPLOADED", pipelineError: null } });
      paperId = target.id;
    } else {
      const created = await prisma.paper.create({
        data: {
          userId,
          // Placeholder until the pipeline reads the real title from the PDF.
          title: originalName.replace(/\.pdf$/i, ""),
          authors: [],
          file: { create: fileData },
        },
        select: { id: true },
      });
      paperId = created.id;
    }

    await enqueuePaperIngest(paperId, userId);
    const paper = await prisma.paper.findUniqueOrThrow({ where: { id: paperId }, select: PAPER_SELECT });
    return Response.json({ paper: paperView(paper), duplicate: false }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) return Response.json({ error: error.message }, { status: error.status });
    return sessionError(error);
  }
}
