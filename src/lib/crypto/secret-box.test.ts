import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { isSealed, maskSecret, openSecret, sealSecret } from "./secret-box";

beforeEach(() => {
  process.env.AUTH_SECRET = "unit-test-secret-0123456789";
});

describe("secret box", () => {
  it("round-trips and never stores the plaintext", () => {
    const sealed = sealSecret("sk-live-abcdef123456", "ai-api-key");
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("abcdef");
    expect(openSecret(sealed, "ai-api-key")).toBe("sk-live-abcdef123456");
  });

  it("uses a fresh nonce each time", () => {
    expect(sealSecret("same", "p")).not.toBe(sealSecret("same", "p"));
  });

  it("returns null instead of throwing when the secret was rotated", () => {
    const sealed = sealSecret("sk-live-abcdef123456", "ai-api-key");
    process.env.AUTH_SECRET = "a-different-secret-0123456789";
    expect(openSecret(sealed, "ai-api-key")).toBeNull();
  });

  it("binds a value to its purpose", () => {
    expect(openSecret(sealSecret("v", "one"), "two")).toBeNull();
  });

  it("returns null for tampered or foreign input", () => {
    const sealed = sealSecret("value", "p");
    expect(openSecret(sealed.slice(0, -2) + "AA", "p")).toBeNull();
    expect(openSecret("sk-plain-text", "p")).toBeNull();
  });

  it("masks keys down to a recognisable hint", () => {
    expect(maskSecret("sk-abcdefghijklmnop")).toBe("sk-…mnop");
    expect(maskSecret("short")).toBe("••••");
  });
});
