import { afterEach, describe, expect, it } from "vitest";
import { isAllowlistedBaseUrl, isSafeBaseUrl, normalizeBaseUrl } from "./base-url";

afterEach(() => {
  delete process.env.LLM_ALLOWED_HOSTS;
});

describe("isSafeBaseUrl", () => {
  it("accepts public https endpoints", () => {
    expect(isSafeBaseUrl("https://api.deepseek.com")).toBe(true);
    expect(isSafeBaseUrl("https://api.openai.com/v1")).toBe(true);
  });

  it.each([
    "http://api.deepseek.com",
    "https://localhost:8080",
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://172.20.1.1",
    "https://192.168.50.94:11434",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]:11434",
    "https://printer.local",
    "https://user:pass@api.deepseek.com",
    "ftp://api.deepseek.com",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isSafeBaseUrl(url)).toBe(false);
  });

  it("lets the operator allow specific private hosts, over http", () => {
    process.env.LLM_ALLOWED_HOSTS = "127.0.0.1:11434, 192.168.50.94:11434";
    expect(isSafeBaseUrl("http://192.168.50.94:11434/v1")).toBe(true);
    expect(isSafeBaseUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isAllowlistedBaseUrl("http://127.0.0.1:11434")).toBe(true);
  });

  it("matches the port, not just the host", () => {
    process.env.LLM_ALLOWED_HOSTS = "192.168.50.94:11434";
    expect(isSafeBaseUrl("http://192.168.50.94:3306")).toBe(false);
    expect(isSafeBaseUrl("http://192.168.50.95:11434")).toBe(false);
  });
});

describe("normalizeBaseUrl", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(normalizeBaseUrl("  https://api.deepseek.com/v1//  ")).toBe("https://api.deepseek.com/v1");
  });
});
