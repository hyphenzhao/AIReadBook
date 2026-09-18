import { describe, expect, it } from "vitest";
import { bytesToVector, normalize, vectorToBytes } from "./client";

describe("embedding vectors", () => {
  it("normalises to unit length", () => {
    const v = normalize(Float32Array.from([3, 4]));
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
  });

  it("leaves a zero vector alone", () => {
    expect(Array.from(normalize(new Float32Array(3)))).toEqual([0, 0, 0]);
  });

  it("round-trips through bytes", () => {
    const v = Float32Array.from([0.25, -1.5, 3.125, 0]);
    expect(Array.from(bytesToVector(vectorToBytes(v)))).toEqual(Array.from(v));
  });

  it("decodes bytes that sit at an unaligned offset in a larger buffer", () => {
    const v = Float32Array.from([1.5, -2.5]);
    const padded = new Uint8Array(1 + v.byteLength);
    padded.set(vectorToBytes(v), 1);
    const view = padded.subarray(1); // byteOffset 1: not a multiple of 4
    expect(Array.from(bytesToVector(view))).toEqual([1.5, -2.5]);
  });
});
