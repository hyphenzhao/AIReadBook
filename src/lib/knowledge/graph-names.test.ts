import { describe, expect, it } from "vitest";
import { nodeEmbeddingText, normalizedForms, normalizeName } from "./graph-names";

describe("normalizeName", () => {
  it("ignores brackets, punctuation, spacing and case", () => {
    expect(normalizeName("《史记》")).toBe("史记");
    expect(normalizeName(" 史 记 ")).toBe("史记");
    expect(normalizeName("Machine-Learning")).toBe("machinelearning");
    expect(normalizeName("machine learning")).toBe("machinelearning");
  });

  it("folds full-width forms", () => {
    expect(normalizeName("ＡＩ　模型")).toBe("ai模型");
  });

  it("keeps different names different", () => {
    expect(normalizeName("项羽")).not.toBe(normalizeName("项梁"));
  });

  it("is empty for names made only of punctuation", () => {
    expect(normalizeName("——")).toBe("");
  });
});

describe("normalizedForms", () => {
  it("dedupes the name and its aliases and drops empties", () => {
    expect(normalizedForms("项羽", ["项籍", "《项羽》", "……", "项 羽"])).toEqual(["项羽", "项籍"]);
  });
});

describe("nodeEmbeddingText", () => {
  it("uses the name alone when there is no description", () => {
    expect(nodeEmbeddingText("鸿门宴", "  ")).toBe("鸿门宴");
    expect(nodeEmbeddingText("鸿门宴", "项羽设宴欲杀刘邦")).toBe("鸿门宴：项羽设宴欲杀刘邦");
  });
});
