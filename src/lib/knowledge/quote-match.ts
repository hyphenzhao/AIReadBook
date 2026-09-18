/**
 * Locates a quote an LLM claims to have taken from a text. Knowledge cards and
 * graph nodes only get a "jump to source" link when their quote is really
 * there, which keeps invented provenance out of the knowledge base.
 *
 * Models rarely copy perfectly — they normalise quotes, drop a comma, change
 * full-width punctuation — so matching ignores whitespace and punctuation,
 * then falls back to the longest run the quote and the text share.
 */

export interface QuoteLocation {
  charStart: number;
  charEnd: number;
}

// Whitespace, ASCII and CJK punctuation, quotes and brackets of every kind.
const IGNORED = /[\s\p{P}\p{S}]/u;

/** Text with ignorable characters removed, plus a map back to original offsets. */
function squeeze(text: string) {
  const chars: string[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (IGNORED.test(ch)) continue;
    chars.push(ch.toLowerCase());
    offsets.push(i);
  }
  return { squeezed: chars.join(""), offsets };
}

const MIN_QUOTE = 6;
const MIN_PARTIAL = 12;

export function locateQuote(text: string, quote: string | null | undefined): QuoteLocation | null {
  const wanted = quote?.trim();
  if (!wanted) return null;

  const exact = text.indexOf(wanted);
  if (exact >= 0) return { charStart: exact, charEnd: exact + wanted.length };

  const haystack = squeeze(text);
  const needle = squeeze(wanted).squeezed;
  if (needle.length < MIN_QUOTE) return null;

  const span = (from: number, length: number): QuoteLocation => ({
    charStart: haystack.offsets[from],
    charEnd: haystack.offsets[from + length - 1] + 1,
  });

  const found = haystack.squeezed.indexOf(needle);
  if (found >= 0) return span(found, needle.length);

  // The model stitched or trimmed: accept the longest piece of the quote that
  // occurs verbatim, if it is most of the quote.
  let best = { from: -1, length: 0 };
  for (let start = 0; start + MIN_PARTIAL <= needle.length; start++) {
    // Grow greedily from the minimum length; stop early when it cannot beat `best`.
    let length = Math.max(MIN_PARTIAL, best.length + 1);
    if (start + length > needle.length) break;
    let at = haystack.squeezed.indexOf(needle.slice(start, start + length));
    if (at < 0) continue;
    while (start + length < needle.length && haystack.squeezed[at + length] === needle[start + length]) length++;
    // indexOf found the first occurrence; a longer match may sit elsewhere, but
    // the first is good enough for a citation anchor.
    best = { from: at, length };
  }
  if (best.length >= MIN_PARTIAL && best.length >= needle.length * 0.6) return span(best.from, best.length);
  return null;
}

/** The chunk whose range contains (the start of) a located quote. */
export function chunkContaining<T extends { charStart: number; charEnd: number }>(chunks: T[], location: QuoteLocation) {
  return (
    chunks.find((chunk) => location.charStart >= chunk.charStart && location.charStart < chunk.charEnd) ?? null
  );
}
