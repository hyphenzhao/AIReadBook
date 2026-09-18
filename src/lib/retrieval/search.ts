import { prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embedding/client";
import { searchBookVectors } from "@/lib/vector";
import { extractSearchTerms } from "@/lib/rag/book-retriever";

/**
 * Hybrid passage search over a book's chunks: MySQL FULLTEXT (ngram, so it
 * works for Chinese) plus embedding similarity, merged with reciprocal rank
 * fusion. Either half may be missing — no embedding server, or a query with
 * no usable keywords — and the other still answers.
 */

export interface PassageHit {
  chunkId: number;
  chapterId: number | null;
  chapterIndex: number;
  chapterTitle: string;
  text: string;
  charStart: number;
  charEnd: number;
  /** Fused rank score; only meaningful for ordering. */
  score: number;
  /** Cosine similarity, when the semantic half found this chunk. */
  similarity: number | null;
  lexical: boolean;
}

export interface SearchResult {
  hits: PassageHit[];
  usedSemantic: boolean;
  usedLexical: boolean;
}

const RRF_K = 60;
const CANDIDATES = 24;

/** Combines ranked id lists: score(id) = Σ 1 / (k + rank). */
export function reciprocalRankFusion(lists: number[][], k = RRF_K) {
  const scores = new Map<number, number>();
  for (const list of lists) {
    list.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1)));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id, score]) => ({ id, score }));
}

async function lexicalSearch(bookId: number, chapterId: number | undefined, terms: string[]) {
  if (terms.length === 0) return [];
  const against = terms.join(" ");
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM chunks
       WHERE book_id = ? ${chapterId ? "AND chapter_id = ?" : ""}
         AND MATCH(text) AGAINST(? IN NATURAL LANGUAGE MODE)
       ORDER BY MATCH(text) AGAINST(? IN NATURAL LANGUAGE MODE) DESC
       LIMIT ${CANDIDATES}`,
      ...(chapterId ? [bookId, chapterId, against, against] : [bookId, against, against]),
    );
    if (rows.length) return rows.map((row) => Number(row.id));
  } catch (error) {
    console.warn("[search] FULLTEXT failed, using LIKE", error);
  }
  // Short or rare terms can fall under the fulltext index's radar.
  const rows = await prisma.chunk.findMany({
    where: { bookId, ...(chapterId ? { chapterId } : {}), OR: terms.map((term) => ({ text: { contains: term } })) },
    select: { id: true },
    take: CANDIDATES,
  });
  return rows.map((row) => row.id);
}

export async function searchPassages(options: {
  bookId: number;
  chapterId?: number;
  query: string;
  topK?: number;
  /** Pass a precomputed query vector to avoid embedding the same text twice. */
  queryVector?: Float32Array | null;
}): Promise<SearchResult> {
  const { bookId, chapterId, query, topK = 6 } = options;
  const vector = options.queryVector === undefined ? await embedQuery(query) : options.queryVector;

  const [lexicalIds, semanticHits] = await Promise.all([
    lexicalSearch(bookId, chapterId, extractSearchTerms(query)),
    vector ? searchBookVectors(bookId, vector, { chapterId, topK: CANDIDATES }) : Promise.resolve([]),
  ]);

  const fused = reciprocalRankFusion([lexicalIds, semanticHits.map((hit) => hit.chunkId)]).slice(0, topK);
  if (fused.length === 0) return { hits: [], usedSemantic: !!vector, usedLexical: false };

  const rows = await prisma.chunk.findMany({
    where: { id: { in: fused.map((entry) => entry.id) } },
    select: {
      id: true, chapterId: true, text: true, charStart: true, charEnd: true,
      chapter: { select: { index: true, title: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const similarity = new Map(semanticHits.map((hit) => [hit.chunkId, hit.score]));
  const lexical = new Set(lexicalIds);

  const hits = fused.flatMap(({ id, score }) => {
    const row = byId.get(id);
    if (!row) return [];
    const index = row.chapter?.index ?? 0;
    return [{
      chunkId: id,
      chapterId: row.chapterId,
      chapterIndex: index,
      chapterTitle: row.chapter?.title?.trim() || `第${index + 1}章`,
      text: row.text,
      charStart: row.charStart,
      charEnd: row.charEnd,
      score,
      similarity: similarity.get(id) ?? null,
      lexical: lexical.has(id),
    }];
  });
  return { hits, usedSemantic: !!vector, usedLexical: lexicalIds.length > 0 };
}

/**
 * Is this enough to answer from, or should the search widen to the next tier?
 * Two independent signals count: a passage both halves agree on, or a
 * semantic match strong enough to stand alone.
 */
// 0.52: measured with bge-m3 on modern-Chinese questions against classical text —
// on-topic questions peak at 0.52–0.62, off-topic ones at 0.37–0.50
// (scripts/probe-similarity.cjs). Misjudging only widens the search a tier.
export function isSufficient(result: SearchResult, minSimilarity = 0.52) {
  if (result.hits.length < 2) return false;
  const best = Math.max(0, ...result.hits.map((hit) => hit.similarity ?? 0));
  if (best >= minSimilarity) return true;
  // In a short chapter every chunk is a semantic candidate, so "both halves
  // found it" needs a similarity floor of its own to mean anything.
  const agreed = result.hits.filter((hit) => hit.lexical && (hit.similarity ?? 0) >= minSimilarity - 0.07).length;
  if (agreed >= 2) return true;
  // Keyword-only mode (no embedding server): several keyword hits will do.
  return !result.usedSemantic && result.hits.filter((hit) => hit.lexical).length >= 3;
}
