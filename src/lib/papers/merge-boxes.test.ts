import { describe, expect, it } from "vitest";
import { mergeLineBoxes, type PageBox } from "./merge-boxes";

describe("mergeLineBoxes", () => {
  it("turns the doubled per-word boxes of a real selection into one box per line", () => {
    // As stored from a browser: each word twice (element box and line box), spaces on their own.
    const boxes: PageBox[] = [
      [336.7, 300.0, 561.9, 313.9],
      [318.0, 314.2, 351.7, 324.2], [318.0, 312.0, 351.7, 325.9],
      [351.5, 314.2, 354.0, 324.2], [351.5, 312.0, 354.0, 325.9],
      [358.2, 314.2, 387.0, 324.2], [358.2, 312.0, 387.0, 325.9],
      [318.0, 326.2, 564.3, 336.2], [318.0, 324.0, 564.3, 337.9],
    ];
    const merged = mergeLineBoxes(boxes);
    expect(merged).toHaveLength(3);
    expect(merged[1][0]).toBe(318);
    expect(merged[1][2]).toBe(387);
    // Lines no longer overlap each other, so nothing is painted twice.
    expect(merged[1][3]).toBeLessThanOrEqual(merged[2][1] + 0.01);
  });

  it("keeps a superscript with its line", () => {
    const merged = mergeLineBoxes([[100, 338.3, 200, 348.3], [200.5, 336.5, 206, 343.5], [208, 338.3, 300, 348.3]]);
    expect(merged).toEqual([[100, 338.3, 300, 348.3]]);
  });

  it("does not bridge the gutter between two columns", () => {
    const merged = mergeLineBoxes([[50, 100, 280, 110], [318, 100, 560, 110]]);
    expect(merged).toHaveLength(2);
  });

  it("drops empty boxes", () => {
    expect(mergeLineBoxes([[10, 10, 10, 20], [10, 30, 40, 30]])).toEqual([]);
  });
});
