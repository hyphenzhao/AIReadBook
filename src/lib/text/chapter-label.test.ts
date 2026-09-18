import { describe, expect, it } from "vitest";
import { chapterLabel, deriveTitle, isJunkTitle } from "./chapter-label";

describe("chapter labels", () => {
  it("keeps a real title", () => {
    expect(chapterLabel({ index: 2, title: " 项羽本纪 ", content: "别的内容" })).toBe("项羽本纪");
  });

  it("replaces a publisher label with the first heading-like line", () => {
    const content = "传硕公版书\n\n十二本纪·项羽本纪\n\n项籍者，下相人也，字羽。初起时，年二十四。其季父项梁，梁父即楚将项燕，为秦将王翦所戮者也。";
    expect(chapterLabel({ index: 8, title: "传硕公版书", content })).toBe("十二本纪·项羽本纪");
  });

  it("skips boilerplate lines, URLs and long paragraphs", () => {
    expect(deriveTitle("目录\nhttps://example.org\n" + "长".repeat(60) + "\n第一回 风雪山神庙")).toBe("第一回 风雪山神庙");
  });

  it("falls back to a number when nothing usable exists", () => {
    expect(chapterLabel({ index: 4, title: null, content: "" })).toBe("第5章");
    expect(chapterLabel({ index: 0, title: "Untitled" })).toBe("Untitled");
  });

  it("recognises junk titles", () => {
    expect(isJunkTitle("传硕公版书")).toBe(true);
    expect(isJunkTitle("  ")).toBe(true);
    expect(isJunkTitle(null)).toBe(true);
    expect(isJunkTitle("太史公自序")).toBe(false);
  });
});
