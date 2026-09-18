import { prisma } from "@/lib/prisma";
import { chunkText } from "@/lib/text/chunker";
import { embeddingModel, embedTexts, vectorToBytes } from "@/lib/embedding/client";
import { invalidateBookVectors } from "@/lib/vector";
import { enqueueJob } from "@/lib/jobs/queue";
import type { JobContext } from "@/lib/jobs/worker";

const EMBED_GROUP = 64;

export function enqueueBookIndexing(bookId: number, userId: number) {
  return enqueueJob("index_book", { bookId }, { userId, dedupeKey: `index_book:${bookId}` });
}

/**
 * Makes a book searchable: splits chapters into chunks, then embeds them.
 * Both halves only do what is missing, so the job is safe to repeat and
 * resumes where it stopped. Without an embedding server the chunks are still
 * written and keyword search works; embeddings are filled in on a later run.
 */
export async function indexBook(bookId: number, ctx: JobContext) {
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, userId: true } });
  if (!book) return; // deleted while the job was queued

  await ctx.progress("chunking", 0);
  const chapters = await prisma.chapter.findMany({
    where: { bookId, chunks: { none: {} } },
    select: { id: true, content: true },
    orderBy: { index: "asc" },
  });
  for (const [i, chapter] of chapters.entries()) {
    const chunks = chunkText(chapter.content);
    if (chunks.length) {
      await prisma.chunk.createMany({
        data: chunks.map((chunk) => ({
          userId: book.userId,
          sourceType: "BOOK" as const,
          bookId,
          chapterId: chapter.id,
          ordinal: chunk.ordinal,
          text: chunk.text,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
        })),
      });
    }
    if (i % 20 === 0) await ctx.progress("chunking", (i / chapters.length) * 30);
  }

  const model = embeddingModel();
  const pending = await prisma.chunk.findMany({
    where: { bookId, OR: [{ embedding: null }, { embedding: { model: { not: model } } }] },
    select: { id: true, text: true },
    orderBy: { id: "asc" },
  });
  for (let i = 0; i < pending.length; i += EMBED_GROUP) {
    const group = pending.slice(i, i + EMBED_GROUP);
    const vectors = await embedTexts(group.map((chunk) => chunk.text));
    if (!vectors) {
      await ctx.progress("embedding skipped: no embedding server", 100);
      return;
    }
    await prisma.$transaction([
      prisma.embedding.deleteMany({ where: { chunkId: { in: group.map((chunk) => chunk.id) } } }),
      prisma.embedding.createMany({
        data: group.map((chunk, n) => ({
          chunkId: chunk.id,
          model,
          dim: vectors[n].length,
          vec: vectorToBytes(vectors[n]),
        })),
      }),
    ]);
    await ctx.progress("embedding", 30 + ((i + group.length) / pending.length) * 70);
  }
  invalidateBookVectors(bookId);
}

/** Queues every book that is not fully chunked and embedded yet. */
export async function enqueueUnindexedBooks() {
  const model = embeddingModel();
  const books = await prisma.book.findMany({
    where: {
      OR: [
        { chaptersRel: { some: { chunks: { none: {} } } } },
        { chunks: { some: { OR: [{ embedding: null }, { embedding: { model: { not: model } } }] } } },
      ],
    },
    select: { id: true, userId: true },
  });
  for (const book of books) await enqueueBookIndexing(book.id, book.userId);
  return books.length;
}
