// Prints the top cosine similarities for a few queries against one book, to
// sanity-check the "is this evidence sufficient" threshold in
// src/lib/retrieval/search.ts.   Usage: node scripts/probe-similarity.cjs <bookId> "query" ...
const { PrismaClient } = require("@prisma/client");

async function embed(text) {
  const res = await fetch(`${process.env.EMBED_URL || "http://127.0.0.1:11434"}/api/embed`, {
    method: "POST",
    body: JSON.stringify({ model: process.env.EMBED_MODEL || "bge-m3", input: [text] }),
  });
  const v = Float32Array.from((await res.json()).embeddings[0]);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

(async () => {
  const [bookId, ...queries] = process.argv.slice(2);
  const prisma = new PrismaClient();
  const rows = await prisma.embedding.findMany({
    where: { chunk: { bookId: Number(bookId) } },
    select: { vec: true, chunk: { select: { text: true } } },
  });
  const vectors = rows.map((r) => new Float32Array(Uint8Array.from(r.vec).buffer));
  for (const query of queries) {
    const q = await embed(query);
    const scored = vectors
      .map((v, i) => ({ i, s: v.reduce((sum, x, k) => sum + x * q[k], 0) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);
    console.log(`\n${query}`);
    for (const { i, s } of scored) console.log(`  ${s.toFixed(3)}  ${rows[i].chunk.text.slice(0, 50).replace(/\s+/g, " ")}`);
  }
  await prisma.$disconnect();
})();
