import { describe, expect, it } from "vitest";
import type { ExtractedPage } from "./bbox-layout";
import { detectSections, findArxivId, findDoi, sectionAt, splitAuthors } from "./structure";

/** Builds a page from [text, lineCount, lineHeight] blocks. */
function page(pageNo: number, blocks: [string, number, number][]): ExtractedPage {
  let text = "";
  const out: ExtractedPage["blocks"] = [];
  for (const [blockText, lineCount, lineHeight] of blocks) {
    if (text) text += "\n\n";
    out.push({ s: text.length, e: text.length + blockText.length, lineCount, lineHeight });
    text += blockText;
  }
  return { pageNo, width: 595, height: 782, text, lines: [], blocks: out };
}

const body = "Sleep is thought to support memory consolidation through the reactivation of newly acquired traces. ".repeat(3);

describe("detectSections", () => {
  const pages = [
    page(1, [["Decoding memory reprocessing during sleep", 1, 20], ["Abstract", 1, 10], [body, 6, 9], ["1 Introduction", 1, 11], [body, 8, 9]]),
    page(2, [["2.1 Participants", 1, 10.5], [body, 5, 9], ["Results", 1, 11], [body, 5, 9], ["References", 1, 11], ["1. Rasch, B. & Born, J. About sleep's role in memory.", 2, 8]]),
  ];
  const offsets = [0, pages[0].text.length + 2];
  const { sections, referencesStart } = detectSections(pages, offsets);

  it("finds named and numbered headings, in order, with their page", () => {
    expect(sections.map((s) => [s.title, s.page])).toEqual([
      ["Abstract", 1], ["1 Introduction", 1], ["2.1 Participants", 2], ["Results", 2], ["References", 2],
    ]);
  });

  it("does not mistake the title, body text or a numbered reference for a heading", () => {
    const titles = sections.map((s) => s.title);
    expect(titles).not.toContain("Decoding memory reprocessing during sleep");
    expect(titles.some((t) => t.startsWith("1. Rasch"))).toBe(false);
  });

  it("reports where the reference list starts", () => {
    const full = pages[0].text + "\n\n" + pages[1].text;
    expect(full.slice(referencesStart!, referencesStart! + 10)).toBe("References");
  });

  it("maps an offset to its section", () => {
    expect(sectionAt(sections, 0)).toBeNull();
    expect(sectionAt(sections, sections[1].start + 40)?.title).toBe("1 Introduction");
  });

  it("finds a heading that runs into its paragraph block (Nature-style layout)", () => {
    // poppler puts "Results" and the 14 lines under it in one block.
    const text = `Results ${body}`;
    const runIn: ExtractedPage = {
      pageNo: 1, width: 595, height: 782, text,
      lines: [{ s: 0, e: 7, b: [40, 100, 80, 109] }, { s: 8, e: text.length, b: [40, 112, 300, 121] }],
      blocks: [{ s: 0, e: text.length, lineCount: 14, lineHeight: 9 }],
    };
    expect(detectSections([runIn], [0]).sections.map((s) => s.title)).toEqual(["Results"]);

    // …but a paragraph that merely starts with such a word is not a heading.
    const sentence = "Results of this kind have been reported before, and they were replicated here.";
    const prose: ExtractedPage = {
      ...runIn, text: sentence + body,
      lines: [{ s: 0, e: sentence.length, b: [40, 100, 300, 109] }],
      blocks: [{ s: 0, e: sentence.length + body.length, lineCount: 9, lineHeight: 9 }],
    };
    expect(detectSections([prose], [0]).sections).toEqual([]);
  });

  it("recognises Chinese headings", () => {
    const zh = [page(1, [["摘 要", 1, 11], ["本文研究睡眠对记忆巩固的作用。".repeat(8), 5, 9], ["一、引言", 1, 11], ["参考文献", 1, 11]])];
    expect(detectSections(zh, [0]).sections.map((s) => s.title)).toEqual(["摘 要", "一、引言", "参考文献"]);
  });
});

describe("identifiers", () => {
  it("finds a DOI and drops trailing punctuation", () => {
    expect(findDoi("Nature Communications 8, (2017). doi:10.1038/ncomms15404.")).toBe("10.1038/ncomms15404");
    expect(findDoi("see https://doi.org/10.1016/J.NEURON.2019.01.011)")).toBe("10.1016/j.neuron.2019.01.011");
    expect(findDoi("no identifier here")).toBeNull();
  });

  it("finds new- and old-style arXiv ids", () => {
    expect(findArxivId("arXiv:1706.03762v5 [cs.CL] 6 Dec 2017")).toBe("1706.03762v5");
    expect(findArxivId("arXiv: hep-th/9901001")).toBe("hep-th/9901001");
    expect(findArxivId("nothing")).toBeNull();
  });
});

describe("splitAuthors", () => {
  it("splits on strong separators and keeps 'Surname, I.' together", () => {
    expect(splitAuthors("Alizadeh, S.; Jahnke, K.; Fell, J.")).toEqual(["Alizadeh, S.", "Jahnke, K.", "Fell, J."]);
    expect(splitAuthors("张三，李四、王五")).toEqual(["张三", "李四", "王五"]);
  });

  it("falls back to commas and 'and'", () => {
    expect(splitAuthors("A. Smith, B. Jones and C. Wu")).toEqual(["A. Smith", "B. Jones", "C. Wu"]);
  });

  it("drops affiliation marks and empties", () => {
    expect(splitAuthors("S. Alizadeh1*, K. Jahnke2†")).toEqual(["S. Alizadeh", "K. Jahnke"]);
    expect(splitAuthors("")).toEqual([]);
    expect(splitAuthors(null)).toEqual([]);
  });
});
