/**
 * Text embeddings from Ollama (`POST /api/embed`).
 *
 * Configured only through the environment — never from user input — so it is
 * free to talk to private addresses:
 *   EMBED_URL           primary server, e.g. http://127.0.0.1:11434
 *   EMBED_FALLBACK_URL  tried when the primary is down (must serve the SAME model:
 *                       vectors from different models are not comparable)
 *   EMBED_MODEL         default bge-m3
 *
 * Everything that uses embeddings must cope with `null` (no server reachable)
 * by falling back to keyword search.
 */

const BATCH = 16;
const TIMEOUT_MS = 60_000;
const RETRY_DOWN_AFTER_MS = 60_000;

export function embeddingModel() {
  return process.env.EMBED_MODEL || "bge-m3";
}

function servers() {
  return [process.env.EMBED_URL, process.env.EMBED_FALLBACK_URL]
    .map((url) => url?.trim().replace(/\/+$/, ""))
    .filter((url): url is string => !!url);
}

// A server that just failed is skipped for a minute, so a dead primary does
// not add its timeout to every single request.
const downUntil = new Map<string, number>();

/** L2-normalise in place so cosine similarity becomes a plain dot product. */
export function normalize(vector: Float32Array) {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum);
  if (norm > 0) for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

async function embedBatch(server: string, inputs: string[]): Promise<Float32Array[]> {
  const res = await fetch(`${server}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: embeddingModel(), input: inputs, truncate: true }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`embedding server ${server} returned ${res.status}`);
  const data = await res.json();
  const vectors: number[][] | undefined = data?.embeddings;
  if (!Array.isArray(vectors) || vectors.length !== inputs.length) {
    throw new Error(`embedding server ${server} returned a malformed response`);
  }
  return vectors.map((values) => normalize(Float32Array.from(values)));
}

/**
 * Embeds `texts`, returning unit vectors in the same order, or null when no
 * embedding server could be reached.
 */
export async function embedTexts(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[] | null> {
  if (texts.length === 0) return [];
  const now = Date.now();
  const candidates = servers().filter((server) => (downUntil.get(server) ?? 0) <= now);

  for (const server of candidates) {
    try {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        out.push(...(await embedBatch(server, texts.slice(i, i + BATCH))));
        onProgress?.(out.length, texts.length);
      }
      return out;
    } catch (error) {
      console.warn("[embedding]", (error as Error).message);
      downUntil.set(server, Date.now() + RETRY_DOWN_AFTER_MS);
    }
  }
  return null;
}

export async function embedQuery(text: string) {
  return (await embedTexts([text]))?.[0] ?? null;
}

/** Float32Array -> bytes for a BLOB column. */
export function vectorToBytes(vector: Float32Array) {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength).slice();
}

/**
 * BLOB bytes -> Float32Array. The bytes are copied first: a Float32Array view
 * needs a 4-byte-aligned offset, which a slice of a larger buffer may not have.
 */
export function bytesToVector(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
}
