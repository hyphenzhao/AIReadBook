import { createHash, randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, rename, rm, stat } from "fs/promises";
import path from "path";

/**
 * Original PDFs live on disk under DATA_DIR (outside the repository and never
 * under public/), named by their SHA-256 so the same file is stored once.
 * They are only ever served through the authenticated file route.
 */

export const MAX_PDF_BYTES = 200 * 1024 * 1024;

export function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), ".data");
}

/** Absolute path for a stored relative path, refusing anything that escapes DATA_DIR. */
export function resolveStored(relativePath: string) {
  const root = path.resolve(dataDir());
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new Error("path escapes DATA_DIR");
  return absolute;
}

export class UploadError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "UploadError";
  }
}

export interface StoredUpload {
  sha256: string;
  bytes: number;
  /** Relative to DATA_DIR. */
  path: string;
}

/**
 * Streams an upload to disk while hashing it, so a 100 MB PDF never sits in
 * memory. Rejects anything that does not start with the PDF magic bytes.
 */
export async function storePdfUpload(userId: number, body: ReadableStream<Uint8Array>): Promise<StoredUpload> {
  const tmpDir = path.join(dataDir(), "tmp");
  await mkdir(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `${randomUUID()}.upload`);

  const hash = createHash("sha256");
  const out = createWriteStream(tmpPath, { mode: 0o600 });
  let bytes = 0;
  let head = Buffer.alloc(0);

  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PDF_BYTES) throw new UploadError(`文件超过 ${MAX_PDF_BYTES / 1024 / 1024} MB 上限`, 413);
      if (head.length < 5) head = Buffer.concat([head, Buffer.from(value)]).subarray(0, 5);
      hash.update(value);
      // Respect backpressure, or a fast upload piles up in memory.
      if (!out.write(value)) await new Promise<void>((resolve) => out.once("drain", () => resolve()));
    }
    await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));

    if (bytes === 0) throw new UploadError("文件是空的", 400);
    if (head.toString("latin1") !== "%PDF-") throw new UploadError("这不是一个 PDF 文件", 415);

    const sha256 = hash.digest("hex");
    const relative = path.posix.join("papers", String(userId), sha256.slice(0, 2), `${sha256}.pdf`);
    const finalPath = resolveStored(relative);
    await mkdir(path.dirname(finalPath), { recursive: true });
    // Same content already stored (a re-upload): keep the existing file.
    if (await stat(finalPath).then(() => true, () => false)) await rm(tmpPath, { force: true });
    else await rename(tmpPath, finalPath);
    return { sha256, bytes, path: relative };
  } catch (error) {
    out.destroy();
    await rm(tmpPath, { force: true });
    throw error;
  }
}

export async function removeStored(relativePath: string) {
  await rm(resolveStored(relativePath), { force: true });
}

/**
 * Parses a single-range `Range: bytes=…` header. Returns null for "no range"
 * and "unsatisfiable" for a range the file cannot serve (→ 416).
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | "unsatisfiable" {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null; // multi-range or malformed: serve the whole file
  let start: number;
  let end: number;
  if (!match[1]) {
    // suffix range: the last N bytes
    const suffix = Number(match[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
