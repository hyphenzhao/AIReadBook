import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { toBibtex } from "@/lib/papers/bibtex";

/** BibTeX for the whole library, one collection (`?collectionId=`) or chosen papers (`?ids=1,2,3`). */
export async function GET(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const params = new URL(req.url).searchParams;
    const collectionId = Number(params.get("collectionId"));
    const ids = (params.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);

    const papers = await prisma.paper.findMany({
      where: {
        userId,
        ...(ids.length ? { id: { in: ids } } : {}),
        ...(Number.isInteger(collectionId) && collectionId > 0 ? { collections: { some: { collectionId } } } : {}),
      },
      orderBy: [{ year: "desc" }, { title: "asc" }],
      select: { title: true, authors: true, year: true, venue: true, doi: true, arxivId: true },
    });

    const bib = toBibtex(papers.map((p) => ({ ...p, authors: Array.isArray(p.authors) ? (p.authors as string[]) : [] })));
    return new Response(bib, {
      headers: {
        "Content-Type": "application/x-bibtex; charset=utf-8",
        "Content-Disposition": `attachment; filename="aireadbook-papers-${new Date().toISOString().slice(0, 10)}.bib"`,
      },
    });
  } catch (error) {
    return sessionError(error);
  }
}
