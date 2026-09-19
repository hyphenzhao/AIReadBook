/**
 * Parses the XHTML that `pdftotext -bbox-layout` produces:
 *
 *   <page width height> <flow> <block> <line xMin yMin xMax yMax> <word …>text</word>
 *
 * into per-page text plus, for every text line, its character range in that
 * text and its box on the page. Coordinates are PDF points with the origin at
 * the top-left, which is also how pdf.js viewports are laid out — so a range
 * of characters can later be turned straight into highlight rectangles.
 *
 * poppler has already worked out reading order (columns become flows), so
 * blocks are taken in document order.
 */

export type Box = [x0: number, y0: number, x1: number, y1: number];

export interface LayoutLine {
  /** Start offset in the page text. */
  s: number;
  /** End offset (exclusive). */
  e: number;
  b: Box;
}

export interface ExtractedBlock {
  s: number;
  e: number;
  lineCount: number;
  /** Tallest line in the block — the nearest thing to a font size poppler gives us. */
  lineHeight: number;
}

export interface ExtractedPage {
  pageNo: number;
  width: number;
  height: number;
  text: string;
  lines: LayoutLine[];
  blocks: ExtractedBlock[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
const decode = (text: string) =>
  text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name] ?? match;
  });

const attr = (attrs: string, name: string) => Number(attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? 0);

// CJK text is not separated by spaces, Latin text is.
const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;
const needsSpace = (left: string, right: string) => !!left && !!right && !(CJK.test(left.slice(-1)) && CJK.test(right[0]));

const TOKEN = /<(page|block|line|word)\b([^>]*)>|<\/(page|block|line|word)>|([^<]+)/g;

export function parseBboxLayout(xhtml: string): ExtractedPage[] {
  const pages: ExtractedPage[] = [];
  let page: ExtractedPage | null = null;
  let block: { start: number; lineCount: number; lineHeight: number } | null = null;
  let lineWords: string[] = [];
  let lineBox: Box | null = null;
  let inWord = false;
  let word = "";

  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(xhtml); match; match = TOKEN.exec(xhtml)) {
    const [, open, attrs, close, text] = match;

    if (open === "page") {
      page = { pageNo: pages.length + 1, width: attr(attrs, "width"), height: attr(attrs, "height"), text: "", lines: [], blocks: [] };
      pages.push(page);
    } else if (open === "block" && page) {
      // Paragraph break between blocks.
      if (page.text) page.text += "\n\n";
      block = { start: page.text.length, lineCount: 0, lineHeight: 0 };
    } else if (open === "line") {
      lineWords = [];
      lineBox = [attr(attrs, "xMin"), attr(attrs, "yMin"), attr(attrs, "xMax"), attr(attrs, "yMax")];
    } else if (open === "word") {
      inWord = true;
      word = "";
    } else if (text !== undefined && inWord) {
      word += text;
    } else if (close === "word") {
      inWord = false;
      const decoded = decode(word).trim();
      if (decoded) lineWords.push(decoded);
    } else if (close === "line" && page && block && lineBox) {
      let line = "";
      for (const w of lineWords) line += (needsSpace(line, w) ? " " : "") + w;
      if (line) {
        if (block.lineCount > 0) {
          // A word hyphenated across the line break is rejoined; otherwise the
          // lines of a paragraph flow together.
          const hyphenated = /[A-Za-z]-$/.test(page.text) && /^[a-z]/.test(line);
          if (hyphenated) page.text = page.text.slice(0, -1);
          else if (needsSpace(page.text, line)) page.text += " ";
        }
        const s = page.text.length;
        page.text += line;
        page.lines.push({ s, e: page.text.length, b: lineBox.map((n) => Math.round(n * 100) / 100) as Box });
        block.lineCount++;
        block.lineHeight = Math.max(block.lineHeight, lineBox[3] - lineBox[1]);
      }
      lineBox = null;
    } else if (close === "block" && page && block) {
      if (block.lineCount > 0) {
        page.blocks.push({ s: block.start, e: page.text.length, lineCount: block.lineCount, lineHeight: block.lineHeight });
      } else if (page.text.endsWith("\n\n")) {
        page.text = page.text.slice(0, -2); // empty block: take back its paragraph break
      }
      block = null;
    }
  }
  return pages;
}

/** Boxes of the lines that overlap a character range of a page's text. */
export function boxesForRange(lines: LayoutLine[], start: number, end: number): Box[] {
  return lines.filter((line) => line.s < end && line.e > start).map((line) => line.b);
}
