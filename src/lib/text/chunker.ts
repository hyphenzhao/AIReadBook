/**
 * Splits a chapter (or paper section) into retrieval chunks.
 *
 * Chunks are ranges over the original string, so `text.slice(charStart,
 * charEnd)` is always the chunk verbatim — that is what lets an AI citation
 * jump back to the exact passage. Boundaries prefer paragraph ends, then
 * sentence ends, and only cut mid-sentence when a run has no punctuation.
 */

export interface TextChunk {
  ordinal: number;
  charStart: number;
  charEnd: number;
  text: string;
}

export interface ChunkOptions {
  /** Aim for chunks about this long. */
  target?: number;
  /** Never exceed this. */
  max?: number;
  /** Characters repeated from the previous chunk, so a fact on a boundary is not lost. */
  overlap?: number;
}

const SENTENCE_END = /[。！？!?；;…]["”’』」）)]*|\.(?=\s)|\n/g;

/** Offsets just after each sentence end (and each newline), ascending, ending with text.length. */
function boundaries(text: string) {
  const points: number[] = [];
  SENTENCE_END.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END.exec(text))) points.push(match.index + match[0].length);
  if (points[points.length - 1] !== text.length) points.push(text.length);
  return points;
}

export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const target = options.target ?? 900;
  const max = Math.max(options.max ?? 1200, target);
  const overlap = Math.min(options.overlap ?? 100, Math.floor(target / 2));

  const chunks: TextChunk[] = [];
  if (!text.trim()) return chunks;
  const points = boundaries(text);

  let start = 0;
  let cursor = 0; // index into points
  while (start < text.length) {
    while (cursor < points.length && points[cursor] <= start) cursor++;

    // Furthest boundary within `target`; failing that the nearest one within
    // `max`; failing that a hard cut.
    let end = -1;
    let scan = cursor;
    while (scan < points.length && points[scan] - start <= target) end = points[scan++];
    if (end === -1) {
      end = scan < points.length && points[scan] - start <= max ? points[scan] : Math.min(start + max, text.length);
    }
    // A short tail is folded into this chunk rather than left as a fragment.
    if (text.length - end < target / 4 && text.length - start <= max) end = text.length;

    const slice = text.slice(start, end);
    if (slice.trim()) chunks.push({ ordinal: chunks.length, charStart: start, charEnd: end, text: slice });
    if (end >= text.length) break;

    // Start the next chunk `overlap` back, snapped forward to a sentence start
    // so the repeated part reads cleanly. It must always advance.
    let next = end;
    const earliest = Math.max(end - overlap, start + 1);
    for (let i = cursor; i < points.length && points[i] < end; i++) {
      if (points[i] >= earliest) { next = points[i]; break; }
    }
    start = next;
  }
  return chunks;
}
