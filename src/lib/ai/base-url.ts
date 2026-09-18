import { isIP } from "net";

/**
 * Users choose their own OpenAI-compatible endpoint and the server calls it on
 * their behalf, so the URL is an SSRF vector. Public https endpoints are
 * allowed; anything on a private network must be listed by the operator in
 * LLM_ALLOWED_HOSTS (comma-separated `host` or `host:port`, e.g.
 * "127.0.0.1:11434,192.168.50.94:11434").
 */

function allowedHosts() {
  return (process.env.LLM_ALLOWED_HOSTS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isPrivateHost(host: string) {
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const bare = host.replace(/^\[|\]$/g, "");
  if (!isIP(bare)) return false;
  if (bare.includes(":")) return bare === "::1" || /^f[cd]/i.test(bare) || /^fe80:/i.test(bare);
  return (
    bare.startsWith("10.") ||
    bare.startsWith("127.") ||
    bare.startsWith("192.168.") ||
    bare.startsWith("169.254.") ||
    bare === "0.0.0.0" ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(bare)
  );
}

export function isAllowlistedBaseUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return allowedHosts().some((entry) => entry === host || entry === `${host}:${port}`);
  } catch {
    return false;
  }
}

export function isSafeBaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    if (isAllowlistedBaseUrl(value)) return true;
    if (url.protocol !== "https:") return false;
    return !isPrivateHost(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}
