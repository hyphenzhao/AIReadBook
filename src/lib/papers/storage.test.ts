import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { parseRange, resolveStored } from "./storage";

describe("parseRange", () => {
  const size = 1000;
  it("returns null when there is no usable single range", () => {
    expect(parseRange(null, size)).toBeNull();
    expect(parseRange("bytes=0-10,20-30", size)).toBeNull();
    expect(parseRange("items=0-10", size)).toBeNull();
    expect(parseRange("bytes=-", size)).toBeNull();
  });

  it("parses closed, open-ended and suffix ranges", () => {
    expect(parseRange("bytes=0-99", size)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=500-", size)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=-200", size)).toEqual({ start: 800, end: 999 });
  });

  it("clamps an end past the file and a suffix longer than the file", () => {
    expect(parseRange("bytes=900-5000", size)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", size)).toEqual({ start: 0, end: 999 });
  });

  it("flags ranges that cannot be served", () => {
    expect(parseRange("bytes=1000-", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=50-10", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", size)).toBe("unsatisfiable");
  });
});

describe("resolveStored", () => {
  afterEach(() => { delete process.env.DATA_DIR; });

  it("resolves inside DATA_DIR and refuses to leave it", () => {
    process.env.DATA_DIR = path.resolve("/srv/data");
    expect(resolveStored("papers/1/ab/abc.pdf")).toBe(path.resolve("/srv/data/papers/1/ab/abc.pdf"));
    expect(() => resolveStored("../../etc/passwd")).toThrow();
    expect(() => resolveStored("papers/../../secret")).toThrow();
  });
});
