import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embedding/client";
import { extractSearchTerms } from "@/lib/rag/book-retriever";
import { reciprocalRankFusion } from "@/lib/retrieval/search";
import { searchPaperVectors } from "@/lib/vector/papers";

/**
 * Hybrid passage search over paper chunks: ngram FULLTEXT plus embedding
 * similarity, fused by rank. The scope is one paper, a window of its pages, or
 * the user's whole library (optionally leaving one paper out).
 */

export interface PaperPassageHit {
  chunkId: number;
  paperId: number;
  paperTitle: string;
  section: string | null;
  pageStart: number;
  pageEnd: number;
  text: string;
  charStart: number;
  charEnd: number;
  score: number;
  similarity: number | null;
  lexical: boolean;
}

export interface PaperSearchResult {
  hits: PaperPassageHit[];
  usedSemantic: boolean;
}

export interface PaperSearchScope {
  userId: number;
  /** Omit to search the whole library. */
  paperId?: number;
  excludePaperId?: number;
  /** Inclusive page window within `paperId`. */
  pages?: { from: number; to: number };
}

const CANDIDATES = 30;

async function lexicalSearch(scope: PaperSearchScope, terms: string[]) {
  if (terms.length === 0) return [];
  const against = terms.join(" ");
  const conditions = ["user_id = ?", "source_type = 'PAPER'"];
  const values: (number | string)[] = [scope.userId];
  if (scope.paperId) { conditions.push("paper_id = ?"); values.push(scope.paperId); }
  if (scope.excludePaperId) { conditions.push("paper_id <> ?"); values.push(scope.excludePaperId); }
  if (scope.pages) { conditions.push("page_end >= ? AND page_start <= ?"); values.push(scope.pages.from, scope.pages.to); }
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM chunks
       WHERE ${conditions.join(" AND ")} AND MATCH(text) AGAINST(? IN NATURAL LANGUAGE MODE)
       ORDER BY MATCH(text) AGAINST(? IN NATURAL LANGUAGE MODE) DESC
       LIMIT ${CANDIDATES}`,
      ...values, against, against,
    );
    return rows.map((row) => Number(row.id));
  } catch (error) {
    console.warn("[paper-search] FULLTEXT failed", error);
    return [];
  }
}

export async function searchPaperPassages(options: PaperSearchScope & {
  query: string;
  topK?: number;
  queryVector?: Float32Array | null;
}): Promise<PaperSearchResult> {
  const { query, topK = 6, ...scope } = options;
  const vector = options.queryVector === undefined ? await embedQuery(query) : options.queryVector;

  const [lexicalIds, semantic] = await Promise.all([
    lexicalSearch(scope, extractSearchTerms(query)),
    vector
      // A page window is applied after the fact, so ask for more candidates.
      ? searchPaperVectors(scope.userId, vector, { paperId: scope.paperId, excludePaperId: scope.excludePaperId, topK: scope.pages ? 200 : CANDIDATES })
      : Promise.resolve([]),
  ]);

  const candidateIds = [...new Set([...lexicalIds, ...semantic.map((hit) => hit.chunkId)])];
  if (candidateIds.length === 0) return { hits: [], usedSemantic: !!vector };

  const rows = await prisma.chunk.findMany({
    where: {
      id: { in: candidateIds },
      userId: scope.userId,
      ...(scope.pages ? { pageEnd: { gte: scope.pages.from }, pageStart: { lte: scope.pages.to } } : {}),
    },
    select: {
      id: true, paperId: true, section: true, pageStart: true, pageEnd: true, text: true, charStart: true, charEnd: true,
      paper: { select: { title: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const similarity = new Map(semantic.map((hit) => [hit.chunkId, hit.score]));
  const lexical = new Set(lexicalIds);

  const fused = reciprocalRankFusion([
    lexicalIds.filter((id) => byId.has(id)),
    semantic.map((hit) => hit.chunkId).filter((id) => byId.has(id)),
  ]).slice(0, topK);

  const hits = fused.flatMap(({ id, score }) => {
    const row = byId.get(id);
    if (!row?.paperId) return [];
    return [{
      chunkId: id,
      paperId: row.paperId,
      paperTitle: row.paper?.title ?? "",
      section: row.section,
      pageStart: row.pageStart ?? 1,
      pageEnd: row.pageEnd ?? row.pageStart ?? 1,
      text: row.text,
      charStart: row.charStart,
      charEnd: row.charEnd,
      score,
      similarity: similarity.get(id) ?? null,
      lexical: lexical.has(id),
    }];
  });
  return { hits, usedSemantic: !!vector };
}

/**
 * Enough to answer from, or widen the search? Papers and questions about them
 * are usually in the same language and register, so on-topic similarity runs
 * higher than for classical Chinese books (see retrieval/search.ts).
 */
export function isPaperEvidenceSufficient(result: PaperSearchResult, minSimilarity = 0.55) {
  if (result.hits.length < 2) return false;
  const best = Math.max(0, ...result.hits.map((hit) => hit.similarity ?? 0));
  if (best >= minSimilarity) return true;
  if (result.hits.filter((hit) => hit.lexical && (hit.similarity ?? 0) >= minSimilarity - 0.07).length >= 2) return true;
  return !result.usedSemantic && result.hits.filter((hit) => hit.lexical).length >= 3;
}
