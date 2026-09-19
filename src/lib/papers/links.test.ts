import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/user-llm", () => ({ getUserLLM: vi.fn() }));
vi.mock("@/lib/vector/papers", () => ({ paperCentroids: vi.fn() }));

import { keywordBar, nearestPapers, tooCommon } from "./links";

/** A unit vector at `degrees` in the plane: cosine between two is cos of the angle between them. */
const at = (degrees: number) => new Float32Array([Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)]);

describe("nearestPapers", () => {
  it("links only the few nearest in a library where everything is similar", () => {
    // Ten papers within 18 degrees of each other: every pair is above the threshold.
    const centroids = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, at(i * 2)] as const));
    const linked = nearestPapers(1, centroids).map((n) => n.otherId);
    expect(linked).toEqual([2, 3, 4]);
  });

  it("keeps a pair when only the other paper counts this one among its nearest", () => {
    // Paper 1 sits apart from a tight group; 5 is on the group's edge, closest to 1.
    const centroids = new Map([[1, at(0)], [2, at(20)], [3, at(21)], [4, at(22)], [5, at(23)], [6, at(60)]]);
    expect(nearestPapers(6, centroids, 1).map((n) => n.otherId)).toEqual([5]);
    expect(nearestPapers(5, centroids, 1).map((n) => n.otherId)).toContain(6);
  });

  it("never links papers below the similarity threshold, however few there are", () => {
    const centroids = new Map([[1, at(0)], [2, at(80)]]);
    expect(nearestPapers(1, centroids)).toEqual([]);
  });
});

describe("keywordBar", () => {
  const idf = (papersWithNode: number, paperCount: number) => Math.log(1 + paperCount / papersWithNode);

  it("lets one rare keyword link two papers, but asks for two common ones", () => {
    expect(idf(3, 27)).toBeGreaterThanOrEqual(keywordBar(27));
    expect(idf(6, 27)).toBeLessThan(keywordBar(27));
    expect(idf(6, 27) + idf(9, 27)).toBeGreaterThanOrEqual(keywordBar(27));
  });

  it("does not get in the way of a small library", () => {
    expect(idf(2, 4)).toBeGreaterThanOrEqual(keywordBar(4));
  });
});

describe("tooCommon", () => {
  it("ignores nodes a third of a sizeable library shares", () => {
    expect(tooCommon(10, 27)).toBe(true);
    expect(tooCommon(9, 27)).toBe(false);
  });

  it("leaves small libraries alone", () => {
    expect(tooCommon(3, 4)).toBe(false);
  });
});
