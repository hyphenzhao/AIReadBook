import { describe, expect, it } from "vitest";
import { boxesForRange, parseBboxLayout } from "./bbox-layout";

const word = (text: string, x = 0) => `<word xMin="${x}" yMin="0" xMax="${x + 10}" yMax="10">${text}</word>`;
const line = (y: number, ...words: string[]) =>
  `<line xMin="40" yMin="${y}" xMax="300" yMax="${y + 10}">${words.map((w, i) => word(w, 40 + i * 12)).join("")}</line>`;
const doc = (...pages: string[]) =>
  `<html><body><doc>${pages.map((p) => `<page width="595.276" height="782.362"><flow>${p}</flow></page>`).join("")}</doc></body></html>`;
const block = (...lines: string[]) => `<block xMin="40" yMin="0" xMax="300" yMax="50">${lines.join("")}</block>`;

describe("parseBboxLayout", () => {
  it("reads page size and joins words and lines into paragraphs", () => {
    const [page] = parseBboxLayout(doc(block(line(100, "Sleep", "supports"), line(112, "memory", "consolidation."))));
    expect(page).toMatchObject({ pageNo: 1, width: 595.276, height: 782.362 });
    expect(page.text).toBe("Sleep supports memory consolidation.");
    expect(page.lines).toHaveLength(2);
  });

  it("separates blocks with a blank line", () => {
    const [page] = parseBboxLayout(doc(block(line(100, "Abstract")) + block(line(130, "We", "show", "that."))));
    expect(page.text).toBe("Abstract\n\nWe show that.");
    expect(page.blocks.map((b) => page.text.slice(b.s, b.e))).toEqual(["Abstract", "We show that."]);
  });

  it("rejoins a word hyphenated across lines, but keeps real hyphens", () => {
    const [page] = parseBboxLayout(doc(block(line(100, "memory", "consoli-"), line(112, "dation", "in", "non-"), line(124, "REM", "sleep"))));
    expect(page.text).toBe("memory consolidation in non- REM sleep");
  });

  it("does not put spaces between CJK characters", () => {
    const [page] = parseBboxLayout(doc(block(line(100, "睡眠", "促进"), line(112, "记忆", "巩固", "(EEG)", "研究"))));
    expect(page.text).toBe("睡眠促进记忆巩固 (EEG) 研究");
  });

  it("decodes entities", () => {
    const [page] = parseBboxLayout(doc(block(line(100, "p", "&lt;", "0.05", "&amp;", "d&#39;", "&#x3b1;"))));
    expect(page.text).toBe("p < 0.05 & d' α");
  });

  it("maps every line to its exact character range and box", () => {
    const [page] = parseBboxLayout(doc(block(line(100, "First", "line"), line(112, "second", "line"))));
    expect(page.lines.map((l) => page.text.slice(l.s, l.e))).toEqual(["First line", "second line"]);
    expect(page.lines[1].b).toEqual([40, 112, 300, 122]);
  });

  it("numbers pages and skips empty blocks", () => {
    const pages = parseBboxLayout(doc(block(line(10, "one")), block() + block(line(10, "two"))));
    expect(pages.map((p) => [p.pageNo, p.text])).toEqual([[1, "one"], [2, "two"]]);
  });
});

describe("boxesForRange", () => {
  it("returns the boxes of the lines a character range touches", () => {
    const [page] = parseBboxLayout(doc(block(line(100, "aaaa"), line(112, "bbbb"), line(124, "cccc"))));
    // "aaaa bbbb cccc": a range inside "bbbb" only
    expect(boxesForRange(page.lines, 6, 8)).toEqual([[40, 112, 300, 122]]);
    expect(boxesForRange(page.lines, 3, 11)).toHaveLength(3);
    expect(boxesForRange(page.lines, 100, 120)).toEqual([]);
  });
});
