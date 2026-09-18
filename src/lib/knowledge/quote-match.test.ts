import { describe, expect, it } from "vitest";
import { chunkContaining, locateQuote } from "./quote-match";

const TEXT =
  "项籍者，下相人也，字羽。初起时，年二十四。其季父项梁，梁父即楚将项燕，为秦将王翦所戮者也。" +
  "项氏世世为楚将，封於项，故姓项氏。\n\n项籍少时，学书不成，去学剑，又不成。项梁怒之。" +
  "籍曰：“书足以记名姓而已。剑一人敌，不足学，学万人敌。”於是项梁乃教籍兵法，籍大喜，略知其意，又不肯竟学。";

const slice = (loc: { charStart: number; charEnd: number } | null) => (loc ? TEXT.slice(loc.charStart, loc.charEnd) : null);

describe("locateQuote", () => {
  it("finds an exact quote", () => {
    expect(slice(locateQuote(TEXT, "项氏世世为楚将"))).toBe("项氏世世为楚将");
  });

  it("ignores punctuation and whitespace differences", () => {
    // ASCII punctuation, no quotes, a stray space — as a model might write it.
    const loc = locateQuote(TEXT, "籍曰: 书足以记名姓而已,剑一人敌,不足学");
    expect(slice(loc)).toBe("籍曰：“书足以记名姓而已。剑一人敌，不足学");
  });

  it("matches across the paragraph break", () => {
    expect(slice(locateQuote(TEXT, "故姓项氏。项籍少时，学书不成"))).toBe("故姓项氏。\n\n项籍少时，学书不成");
  });

  it("accepts a quote that is mostly verbatim", () => {
    const loc = locateQuote(TEXT, "项梁乃教籍兵法，籍大喜，略知其意，但最终没有学完");
    expect(slice(loc)).toBe("项梁乃教籍兵法，籍大喜，略知其意");
  });

  it("rejects text that is not there", () => {
    expect(locateQuote(TEXT, "刘邦斩白蛇起义于芒砀山泽之间")).toBeNull();
    expect(locateQuote(TEXT, "项羽力能扛鼎，才气过人，虽吴中子弟皆已惮籍矣")).toBeNull();
  });

  it("rejects quotes too short to be meaningful", () => {
    expect(locateQuote(TEXT, "，。")).toBeNull();
    expect(locateQuote(TEXT, "")).toBeNull();
    expect(locateQuote(TEXT, null)).toBeNull();
  });
});

describe("chunkContaining", () => {
  const chunks = [
    { id: 1, charStart: 0, charEnd: 60 },
    { id: 2, charStart: 50, charEnd: 120 },
  ];
  it("returns the first chunk that holds the quote's start", () => {
    expect(chunkContaining(chunks, { charStart: 55, charEnd: 70 })?.id).toBe(1);
    expect(chunkContaining(chunks, { charStart: 90, charEnd: 99 })?.id).toBe(2);
    expect(chunkContaining(chunks, { charStart: 500, charEnd: 510 })).toBeNull();
  });
});
