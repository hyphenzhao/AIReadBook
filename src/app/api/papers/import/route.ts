import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { parseBibtex } from "@/lib/papers/bibtex";
import { arxivPdfUrl, fetchArxiv, fetchCrossref, type PaperMetadata } from "@/lib/papers/metadata";
import { findArxivId, findDoi } from "@/lib/papers/structure";
import { enqueuePdfFetch } from "@/lib/papers/fetch-pdf";
import { normalizeName } from "@/lib/knowledge/graph-names";

export const maxDuration = 120;

interface Incoming extends PaperMetadata { title: string }

/**
 * Adds papers without a PDF in hand. Body is one of:
 *   { bibtex: "…" }       every entry with a title becomes a library entry
 *   { identifier: "…" }   a DOI, an arXiv id, or a URL containing one
 *
 * Entries arrive as NO_FILE; uploading the PDF later attaches it. arXiv papers
 * are the exception — their PDF is fetched and processed straight away.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const body = await req.json().catch(() => ({}));

    const incoming: Incoming[] = [];
    let arxivToFetch: string | null = null;

    if (typeof body.bibtex === "string" && body.bibtex.trim()) {
      if (body.bibtex.length > 5_000_000) return Response.json({ error: "BibTeX 文件过大" }, { status: 413 });
      for (const entry of parseBibtex(body.bibtex).slice(0, 2000)) {
        incoming.push({
          title: entry.title, authors: entry.authors, year: entry.year ?? undefined, venue: entry.venue ?? undefined,
          doi: entry.doi ?? undefined, arxivId: entry.arxivId ?? undefined, abstract: entry.abstract ?? undefined,
        });
      }
      if (incoming.length === 0) return Response.json({ error: "没有在其中找到带标题的 BibTeX 条目" }, { status: 422 });
    } else if (typeof body.identifier === "string" && body.identifier.trim()) {
      const raw = body.identifier.trim();
      // "arxiv.org/abs/1706.03762", "arXiv:1706.03762", or a bare new-style id.
      const arxivId = findArxivId(raw) ?? raw.match(/arxiv\.org\/(?:abs|pdf)\/([\w.\/-]+?)(?:v\d+)?(?:\.pdf)?$/i)?.[1] ?? raw.match(/^(\d{4}\.\d{4,5})(v\d+)?$/)?.[1] ?? null;
      const doi = arxivId ? null : findDoi(raw);
      const found = arxivId ? await fetchArxiv(arxivId) : doi ? await fetchCrossref(doi) : null;
      if (!arxivId && !doi) return Response.json({ error: "没有识别出 DOI 或 arXiv 编号" }, { status: 422 });
      if (!found?.title) {
        return Response.json({ error: `查不到这个${arxivId ? " arXiv 编号" : " DOI"}的信息（也可能是服务器暂时连不上 ${arxivId ? "arXiv" : "Crossref"}）` }, { status: 502 });
      }
      incoming.push({ ...found, title: found.title });
      arxivToFetch = arxivId;
    } else {
      return Response.json({ error: "请提供 BibTeX 内容，或一个 DOI / arXiv 编号" }, { status: 400 });
    }

    // Already in the library? Same DOI, same arXiv id, or same title.
    const existing = await prisma.paper.findMany({ where: { userId }, select: { id: true, title: true, doi: true, arxivId: true } });
    const byDoi = new Map(existing.filter((p) => p.doi).map((p) => [p.doi!.toLowerCase(), p.id]));
    const byArxiv = new Map(existing.filter((p) => p.arxivId).map((p) => [p.arxivId!.replace(/v\d+$/, ""), p.id]));
    const byTitle = new Map(existing.map((p) => [normalizeName(p.title), p.id]));

    const created: number[] = [];
    const skipped: string[] = [];
    for (const item of incoming) {
      const duplicate =
        (item.doi && byDoi.get(item.doi.toLowerCase())) ||
        (item.arxivId && byArxiv.get(item.arxivId.replace(/v\d+$/, ""))) ||
        byTitle.get(normalizeName(item.title));
      if (duplicate) { skipped.push(item.title); continue; }
      const paper = await prisma.paper.create({
        data: {
          userId,
          title: item.title.slice(0, 1000),
          authors: item.authors ?? [],
          year: item.year, venue: item.venue?.slice(0, 500), doi: item.doi?.toLowerCase(), arxivId: item.arxivId,
          abstract: item.abstract?.slice(0, 20_000),
          pipelineStage: "NO_FILE",
        },
        select: { id: true },
      });
      created.push(paper.id);
      byTitle.set(normalizeName(item.title), paper.id);
    }

    // arXiv is open access: fetch the PDF in the background (the link can take
    // minutes) and send it down the normal pipeline when it arrives.
    let pdfNote: string | null = null;
    if (arxivToFetch && created.length === 1) {
      await prisma.paper.update({ where: { id: created[0] }, data: { pipelineStage: "FETCHING" } });
      await enqueuePdfFetch(created[0], userId, arxivPdfUrl(arxivToFetch));
      pdfNote = "正在后台从 arXiv 下载 PDF，下载完会自动处理；网络慢时可能需要几分钟。";
    }

    return Response.json({ created: created.length, createdIds: created, skipped: skipped.length, skippedTitles: skipped.slice(0, 20), note: pdfNote }, { status: 201 });
  } catch (error) {
    return sessionError(error);
  }
}
