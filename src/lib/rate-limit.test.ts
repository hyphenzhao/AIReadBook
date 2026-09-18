import { describe, expect, it } from "vitest";
import { AttemptLimiter } from "./rate-limit";

const MIN = 60_000;

describe("AttemptLimiter", () => {
  it("blocks after the allowed number of failures", () => {
    const limiter = new AttemptLimiter(3, 15 * MIN);
    for (let i = 0; i < 2; i++) limiter.fail("k", 0);
    expect(limiter.retryAfter("k", 0)).toBe(0);
    limiter.fail("k", 0);
    expect(limiter.retryAfter("k", 5 * MIN)).toBe(600);
  });

  it("lets the key through again once the window has passed", () => {
    const limiter = new AttemptLimiter(1, 15 * MIN);
    limiter.fail("k", 0);
    expect(limiter.retryAfter("k", 15 * MIN + 1)).toBe(0);
    limiter.fail("k", 15 * MIN + 1);
    expect(limiter.retryAfter("k", 15 * MIN + 2)).toBeGreaterThan(0);
  });

  it("forgets failures after a success", () => {
    const limiter = new AttemptLimiter(2, 15 * MIN);
    limiter.fail("k", 0);
    limiter.succeed("k");
    limiter.fail("k", 0);
    expect(limiter.retryAfter("k", 0)).toBe(0);
  });

  it("tracks keys independently", () => {
    const limiter = new AttemptLimiter(1, 15 * MIN);
    limiter.fail("a", 0);
    expect(limiter.retryAfter("a", 0)).toBeGreaterThan(0);
    expect(limiter.retryAfter("b", 0)).toBe(0);
  });
});
