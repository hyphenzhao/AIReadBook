import { describe, expect, it } from "vitest";
import { linkifyCitations } from "./citations";

describe("linkifyCitations", () => {
  it("turns passage and web markers into cite links", () => {
    expect(linkifyCitations("项羽自刎于乌江[c481]，后世多有评论[w2]。")).toBe(
      "项羽自刎于乌江[c481](#cite-c481)，后世多有评论[w2](#cite-w2)。",
    );
  });

  it("handles adjacent markers and the sloppy forms models produce", () => {
    expect(linkifyCitations("甲[c1][c2]")).toBe("甲[c1](#cite-c1)[c2](#cite-c2)");
    expect(linkifyCitations("乙[#c3]")).toBe("乙[c3](#cite-c3)");
    expect(linkifyCitations("丙〔c4〕")).toBe("丙[c4](#cite-c4)");
    expect(linkifyCitations("丁[c5, c6]")).toBe("丁[c5](#cite-c5)[c6](#cite-c6)");
  });

  it("leaves ordinary brackets and links alone", () => {
    const text = "见[注1]和[维基](https://example.org)，数组 a[0]。";
    expect(linkifyCitations(text)).toBe(text);
  });
});
