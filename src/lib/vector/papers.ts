import { prisma } from "@/lib/prisma";
import { bytesToVector, embeddingModel } from "@/lib/embedding/client";

/**
 * In-process vector search over a user's whole paper library. Unlike books,
 * papers are searched across each other ("which of my papers discuss this?"),
 * so the cache unit is the user rather than one document. See vector/index.ts
 * for the sizing argument; a research library of a few hundred papers is a
 * few tens of thousands of vectors.
 */

export interface PaperVectorHit {
  chunkId: number;
  paperId: number;
  score: number;
}

interface LibraryVectors {
  dim: number;
  chunkIds: Int32Array;
  paperIds: Int32Array;
  matrix: Float32Array;
}

const store = globalThis as unknown as { __paperVectors?: Map<number, LibraryVectors> };
const cache = (store.__paperVectors ??= new Map());

export function invalidatePaperVectors(userId: number) {
  cache.delete(userId);
}

async function load(userId: number): Promise<LibraryVectors> {
  const hit = cache.get(userId);
  if (hit) return hit;

  const rows = await prisma.embedding.findMany({
    where: { model: embeddingModel(), chunk: { userId, sourceType: "PAPER" } },
    select: { chunkId: true, dim: true, vec: true, chunk: { select: { paperId: true } } },
  });
  const dim = rows[0]?.dim ?? 0;
  const usable = rows.filter((row) => row.dim === dim && row.vec.byteLength === dim * 4 && row.chunk.paperId);
  const entry: LibraryVectors = {
    dim,
    chunkIds: new Int32Array(usable.length),
    paperIds: new Int32Array(usable.length),
    matrix: new Float32Array(usable.length * dim),
  };
  usable.forEach((row, i) => {
    entry.chunkIds[i] = row.chunkId;
    entry.paperIds[i] = row.chunk.paperId!;
    entry.matrix.set(bytesToVector(row.vec), i * dim);
  });
  cache.set(userId, entry);
  return entry;
}

/** Top-k paper chunks by cosine similarity; `paperId` restricts to one paper. */
export async function searchPaperVectors(
  userId: number,
  query: Float32Array,
  options: { paperId?: number; excludePaperId?: number; topK?: number } = {},
): Promise<PaperVectorHit[]> {
  const { paperId, excludePaperId, topK = 8 } = options;
  const { dim, chunkIds, paperIds, matrix } = await load(userId);
  if (!dim || dim !== query.length) return [];

  const hits: PaperVectorHit[] = [];
  for (let row = 0; row < chunkIds.length; row++) {
    if (paperId && paperIds[row] !== paperId) continue;
    if (excludePaperId && paperIds[row] === excludePaperId) continue;
    let score = 0;
    const offset = row * dim;
    for (let i = 0; i < dim; i++) score += matrix[offset + i] * query[i];
    hits.push({ chunkId: chunkIds[row], paperId: paperIds[row], score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}

/**
 * One vector per paper — the mean of its chunk vectors, re-normalised — for
 * "which papers are about the same thing?".
 */
export async function paperCentroids(userId: number) {
  const { dim, paperIds, matrix } = await load(userId);
  const sums = new Map<number, Float32Array>();
  for (let row = 0; row < paperIds.length; row++) {
    let sum = sums.get(paperIds[row]);
    if (!sum) sums.set(paperIds[row], (sum = new Float32Array(dim)));
    const offset = row * dim;
    for (let i = 0; i < dim; i++) sum[i] += matrix[offset + i];
  }
  for (const sum of sums.values()) {
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += sum[i] * sum[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) sum[i] /= norm;
  }
  return sums;
}
