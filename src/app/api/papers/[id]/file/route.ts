import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { parseRange, resolveStored } from "@/lib/papers/storage";

/**
 * Serves the original PDF to its owner, with HTTP Range support. pdf.js asks
 * for the bytes of the pages being looked at, so a 100 MB PDF opens as fast as
 * a small one and nothing is read into memory here.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireSessionUserId();
    const id = Number((await params).id);
    const file = Number.isInteger(id) && id > 0
      ? await prisma.paperFile.findFirst({ where: { paperId: id, userId }, select: { path: true, sha256: true, originalName: true } })
      : null;
    if (!file) return Response.json({ error: "找不到该文献的 PDF" }, { status: 404 });

    const absolute = resolveStored(file.path);
    const size = (await stat(absolute)).size;
    const etag = `"${file.sha256}"`;

    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Accept-Ranges": "bytes",
      ETag: etag,
      // Content-addressed, so it can never change — but it is private to this user.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "X-Content-Type-Options": "nosniff",
    };

    if (req.headers.get("if-none-match") === etag && !req.headers.get("range")) {
      return new Response(null, { status: 304, headers });
    }

    const range = parseRange(req.headers.get("range"), size);
    if (range === "unsatisfiable") {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }

    const { start, end } = range ?? { start: 0, end: size - 1 };
    const stream = Readable.toWeb(createReadStream(absolute, { start, end })) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      status: range ? 206 : 200,
      headers: {
        ...headers,
        "Content-Length": String(end - start + 1),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return Response.json({ error: "PDF 文件已不在服务器上" }, { status: 410 });
    }
    return sessionError(error);
  }
}
