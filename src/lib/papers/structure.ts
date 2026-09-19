import type { ExtractedPage } from "@/lib/papers/bbox-layout";

/**
 * Finds a paper's section headings and where its reference list starts, and
 * pulls identifiers (DOI, arXiv id) out of the text. Everything here works on
 * already-extracted text, with no I/O.
 */

export interface Section {
  title: string;
  /** Offset in the paper's full text (pages joined by a blank line). */
  start: number;
  page: number;
}

const NAMED_HEADING =
  /^(abstract|introduction|background|related work|literature review|materials? and methods?|methods?|methodology|experimental (?:setup|procedures?)|experiments?|results?(?: and discussion)?|discussion|conclusions?|limitations?|future work|acknowledge?ments?|references|bibliography|appendix|supplementary (?:material|information)|data availability|author contributions?|摘\s*要|引\s*言|绪\s*论|前\s*言|相关工作|研究背景|方\s*法|材料与方法|研究方法|实验|实验结果|结\s*果|讨\s*论|结果与讨论|结\s*论|结\s*语|总\s*结|致\s*谢|参考文献|附\s*录)(?![A-Za-z])/i;
// (?![A-Za-z]) rather than \b: JavaScript's \b only knows ASCII word characters,
// so it never matches after a Chinese heading.
// "1 Introduction", "2.1. Data", "III. METHODS", "一、引言", "（二）方法"
const NUMBERED_HEADING = /^(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[IVX]{1,5}\.|[一二三四五六七八九十]+[、.．]|[（(][一二三四五六七八九十\d]+[）)])\s*\S/;
const REFERENCES = /^(?:\d{0,2}\.?\s*)?(references|bibliography|literature cited|参考文献)\s*$/i;

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// The whole line is a section name and nothing else: "Results", "2 Methods", "参考文献".
const NAMED_LINE = new RegExp(`${NAMED_HEADING.source.replace(/\(\?!\[A-Za-z\]\)$/, "")}\\s*$`, "i");
const stripNumbering = (text: string) => text.replace(NUMBERED_HEADING, (m) => m.slice(-1)).trim();

/**
 * Headings come in two shapes:
 *  - a short block of its own, named like a heading, or numbered like one and
 *    set larger than the body (line height stands in for font size, which
 *    poppler's bbox output does not carry);
 *  - the first line of a paragraph block. Journals that run the heading into
 *    the text ("Results" directly above its first paragraph, as Nature does)
 *    give poppler no reason to split them. Only an exact section name counts
 *    here, since any sentence can start a paragraph.
 */
export function detectSections(pages: ExtractedPage[], pageOffsets: number[]) {
  const bodyHeight = median(pages.flatMap((page) => page.blocks.filter((b) => b.lineCount >= 3).map((b) => b.lineHeight)));
  const sections: Section[] = [];
  let referencesStart: number | null = null;

  pages.forEach((page, i) => {
    for (const block of page.blocks) {
      let title: string | null = null;

      if (block.lineCount <= 2) {
        const text = page.text.slice(block.s, block.e).replace(/\s+/g, " ").trim();
        if (text.length >= 2 && text.length <= 90 && !/[.。,，;；:：]$/.test(text)) {
          const stripped = stripNumbering(text);
          const named = NAMED_HEADING.test(stripped) && stripped.split(/\s+/).length <= 6;
          const numbered = NUMBERED_HEADING.test(text) && (bodyHeight === 0 || block.lineHeight >= bodyHeight * 1.08);
          if (named || numbered) title = text;
        }
      } else {
        const first = page.lines.find((line) => line.s === block.s);
        const text = first && page.text.slice(first.s, first.e).replace(/\s+/g, " ").trim();
        if (text && text.length <= 40 && NAMED_LINE.test(stripNumbering(text))) title = text;
      }
      if (!title) continue;

      const start = pageOffsets[i] + block.s;
      if (referencesStart === null && REFERENCES.test(title)) referencesStart = start;
      sections.push({ title, start, page: page.pageNo });
    }
  });
  return { sections, referencesStart };
}

/** The section a character offset falls in. */
export function sectionAt(sections: Section[], offset: number) {
  let current: Section | null = null;
  for (const section of sections) {
    if (section.start > offset) break;
    current = section;
  }
  return current;
}

// DOI: Crossref's recommended pattern. Trailing punctuation is sentence, not DOI.
const DOI = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;
const ARXIV = /arxiv[:\s]*((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?)/i;

export function findDoi(text: string) {
  const match = text.match(DOI);
  return match ? match[1].replace(/[.,;:)\]}>'"]+$/, "").toLowerCase() : null;
}

export function findArxivId(text: string) {
  return text.match(ARXIV)?.[1].toLowerCase() ?? null;
}

/**
 * "S. Alizadeh; K. Jahnke" / "张三，李四" / "A. Smith, B. Jones and C. Wu" → names.
 * Commas only separate authors when no stronger separator is present, since
 * "Alizadeh, S." uses them inside a single name.
 */
export function splitAuthors(raw: string | null | undefined) {
  if (!raw?.trim()) return [];
  const strong = /\s*(?:;|，|、|\n|&|\band\b)\s*/i;
  const parts = /;|，|、|\n/.test(raw) ? raw.split(strong) : raw.split(/\s*(?:,|&|\band\b)\s*/i);
  return parts
    .map((name) => name.replace(/[\d*†‡§¶]+/g, "").trim())
    .filter((name) => name.length > 1 && name.length < 80)
    .slice(0, 50);
}
