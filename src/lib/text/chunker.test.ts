import { describe, expect, it } from "vitest";
import { chunkText } from "./chunker";

const sentence = (n: number) => `这是第${n}句话，用来测试分块器是否会在句子边界处切分文本。`;
const paragraph = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => sentence(from + i)).join("");

describe("chunkText", () => {
  it("returns nothing for blank input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n\n ")).toEqual([]);
  });

  it("keeps a short text as one chunk", () => {
    const chunks = chunkText("短短的一段。");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ ordinal: 0, charStart: 0, charEnd: 6 });
  });

  it("every chunk is a verbatim slice of the source", () => {
    const text = [paragraph(0, 30), paragraph(30, 30), paragraph(60, 30)].join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) expect(text.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.text);
  });

  it("covers the whole text with no gaps", () => {
    const text = paragraph(0, 120);
    const chunks = chunkText(text);
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[chunks.length - 1].charEnd).toBe(text.length);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].charStart).toBeLessThanOrEqual(chunks[i - 1].charEnd);
      expect(chunks[i].charStart).toBeGreaterThan(chunks[i - 1].charStart);
    }
  });

  it("respects the size limit and cuts on sentence ends", () => {
    const chunks = chunkText(paragraph(0, 120), { target: 300, max: 400, overlap: 40 });
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(400);
      expect(chunk.text.endsWith("。")).toBe(true);
    }
  });

  it("overlaps neighbouring chunks by whole sentences", () => {
    const chunks = chunkText(paragraph(0, 60), { target: 300, max: 400, overlap: 80 });
    const shared = chunks[0].charEnd - chunks[1].charStart;
    expect(shared).toBeGreaterThan(0);
    expect(shared).toBeLessThanOrEqual(80);
    expect(chunks[1].text.startsWith("这是第")).toBe(true);
  });

  it("hard-cuts text that has no punctuation and still terminates", () => {
    const text = "字".repeat(5000);
    const chunks = chunkText(text, { target: 900, max: 1200, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.text.length <= 1200)).toBe(true);
    expect(chunks[chunks.length - 1].charEnd).toBe(5000);
  });

  it("numbers chunks consecutively", () => {
    const chunks = chunkText(paragraph(0, 100));
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });
});
