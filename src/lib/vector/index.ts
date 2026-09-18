import { prisma } from "@/lib/prisma";
import { bytesToVector, embeddingModel } from "@/lib/embedding/client";

/**
 * In-process vector search. MySQL 8 has no vector type, so a book's unit
 * vectors are loaded into one contiguous Float32Array and scored with dot
 * products. A book is a few hundred to a few thousand chunks, which scores in
 * about a millisecond; the design holds to roughly 200–300k vectors per user,
 * beyond which this module is the one place to swap in a vector database.
 */

export interface VectorHit {
  chunkId: number;
  chapterId: number | null;
  score: number;
}

interface BookVectors {
  dim: number;
  chunkIds: Int32Array;
  chapterIds: Int32Array; // 0 = none
  matrix: Float32Array; // row-major, chunkIds.length × dim
}

const MAX_CACHED_BOOKS = 24;

// On globalThis because Next evaluates route bundles separately; a plain
// module-level Map would be one cache per route.
const store = globalThis as unknown as { __bookVectors?: Map<number, BookVectors> };
const cache = (store.__bookVectors ??= new Map());

export function invalidateBookVectors(bookId: number) {
  cache.delete(bookId);
}

async function load(bookId: number): Promise<BookVectors> {
  const hit = cache.get(bookId);
  if (hit) {
    cache.delete(bookId); // re-insert: Map order is the LRU order
    cache.set(bookId, hit);
    return hit;
  }

  const rows = await prisma.embedding.findMany({
    where: { model: embeddingModel(), chunk: { bookId } },
    select: { chunkId: true, dim: true, vec: true, chunk: { select: { chapterId: true } } },
  });
  const dim = rows[0]?.dim ?? 0;
  const usable = rows.filter((row) => row.dim === dim && row.vec.byteLength === dim * 4);
  const entry: BookVectors = {
    dim,
    chunkIds: new Int32Array(usable.length),
    chapterIds: new Int32Array(usable.length),
    matrix: new Float32Array(usable.length * dim),
  };
  usable.forEach((row, i) => {
    entry.chunkIds[i] = row.chunkId;
    entry.chapterIds[i] = row.chunk.chapterId ?? 0;
    entry.matrix.set(bytesToVector(row.vec), i * dim);
  });

  cache.set(bookId, entry);
  while (cache.size > MAX_CACHED_BOOKS) cache.delete(cache.keys().next().value!);
  return entry;
}

/** Top-k chunks of a book by cosine similarity, optionally within one chapter. */
export async function searchBookVectors(
  bookId: number,
  query: Float32Array,
  options: { chapterId?: number; topK?: number; minScore?: number } = {},
): Promise<VectorHit[]> {
  const { chapterId, topK = 8, minScore = 0 } = options;
  const { dim, chunkIds, chapterIds, matrix } = await load(bookId);
  if (!dim || dim !== query.length) return [];

  const hits: VectorHit[] = [];
  for (let row = 0; row < chunkIds.length; row++) {
    if (chapterId && chapterIds[row] !== chapterId) continue;
    let score = 0;
    const offset = row * dim;
    for (let i = 0; i < dim; i++) score += matrix[offset + i] * query[i];
    if (score >= minScore) hits.push({ chunkId: chunkIds[row], chapterId: chapterIds[row] || null, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}

export function cosine(a: Float32Array, b: Float32Array) {
  if (a.length !== b.length) return 0;
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}
