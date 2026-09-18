import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSealed, maskSecret, openSecret, sealSecret } from "@/lib/crypto/secret-box";

/**
 * Web search for background and commentary the book itself cannot supply.
 * The provider and its key are instance-wide, set by an admin. Results are
 * cached for a day, and each user has a daily allowance.
 */

export type WebSearchProvider = "bocha" | "tavily";

export interface WebResult {
  title: string;
  url: string;
  site: string;
  snippet: string;
  published?: string;
}

interface StoredConfig {
  provider?: WebSearchProvider;
  apiKeyEnc?: string;
  dailyLimit?: number;
}

export interface WebSearchConfigView {
  provider: WebSearchProvider;
  hasKey: boolean;
  keyHint: string;
  dailyLimit: number;
}

const SETTING_KEY = "webSearch";
const KEY_PURPOSE = "web-search-key";
const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTS = 6;

async function loadConfig(): Promise<StoredConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  return row?.value && typeof row.value === "object" && !Array.isArray(row.value) ? (row.value as StoredConfig) : {};
}

function apiKeyOf(config: StoredConfig) {
  return isSealed(config.apiKeyEnc) ? openSecret(config.apiKeyEnc, KEY_PURPOSE) : null;
}

function toView(config: StoredConfig): WebSearchConfigView {
  const key = apiKeyOf(config);
  return {
    provider: config.provider === "tavily" ? "tavily" : "bocha",
    hasKey: !!key,
    keyHint: key ? maskSecret(key) : config.apiKeyEnc ? "已失效，请重新填写" : "",
    dailyLimit: Number.isInteger(config.dailyLimit) ? config.dailyLimit! : 100,
  };
}

export async function getWebSearchConfigView() {
  return toView(await loadConfig());
}

/** `apiKey`: undefined keeps the stored key, "" clears it. */
export async function updateWebSearchConfig(patch: { provider?: string; apiKey?: string; dailyLimit?: number }) {
  const next = { ...(await loadConfig()) };
  if (patch.provider !== undefined) next.provider = patch.provider === "tavily" ? "tavily" : "bocha";
  if (patch.dailyLimit !== undefined) {
    next.dailyLimit = Math.max(0, Math.min(10_000, Math.round(Number(patch.dailyLimit)) || 0));
  }
  if (patch.apiKey !== undefined) {
    const key = String(patch.apiKey).trim().slice(0, 500);
    if (key) next.apiKeyEnc = sealSecret(key, KEY_PURPOSE);
    else delete next.apiKeyEnc;
  }
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: next as Prisma.InputJsonObject },
    update: { value: next as Prisma.InputJsonObject },
  });
  return toView(next);
}

export async function isWebSearchAvailable() {
  return !!apiKeyOf(await loadConfig());
}

function siteOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function clean(text: unknown, max: number) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function searchBocha(query: string, apiKey: string): Promise<WebResult[]> {
  const res = await fetch("https://api.bochaai.com/v1/web-search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, summary: true, count: MAX_RESULTS, freshness: "noLimit" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new WebSearchError(`博查搜索返回 ${res.status}`, res.status);
  const data = await res.json();
  const pages: any[] = data?.data?.webPages?.value ?? [];
  return pages.map((page) => ({
    title: clean(page.name, 200),
    url: String(page.url ?? ""),
    site: clean(page.siteName, 80) || siteOf(page.url),
    snippet: clean(page.summary || page.snippet, 600),
    published: page.datePublished ? String(page.datePublished).slice(0, 10) : undefined,
  }));
}

async function searchTavily(query: string, apiKey: string): Promise<WebResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: MAX_RESULTS, search_depth: "basic" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new WebSearchError(`Tavily 返回 ${res.status}`, res.status);
  const data = await res.json();
  const results: any[] = data?.results ?? [];
  return results.map((item) => ({
    title: clean(item.title, 200),
    url: String(item.url ?? ""),
    site: siteOf(item.url),
    snippet: clean(item.content, 600),
    published: item.published_date ? String(item.published_date).slice(0, 10) : undefined,
  }));
}

export class WebSearchError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = "WebSearchError";
  }
}

// Per-user daily counter. In memory: the app is one process, and losing the
// count on restart only ever errs in the user's favour.
const usage = new Map<string, number>();
function dayKey(userId: number) {
  return `${userId}:${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Searches the web. Returns [] (never throws) when search is not configured,
 * the allowance is used up, or the provider fails — a chat answer should
 * degrade to book-only rather than error out. `testing` makes failures throw.
 */
export async function webSearch(query: string, userId: number, options: { testing?: boolean } = {}): Promise<WebResult[]> {
  const config = await loadConfig();
  const apiKey = apiKeyOf(config);
  const view = toView(config);
  if (!apiKey) {
    if (options.testing) throw new WebSearchError("尚未配置搜索 API Key", 412);
    return [];
  }

  const normalized = query.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!normalized) return [];
  const queryHash = createHash("sha256").update(normalized.toLowerCase()).digest("hex");

  const cached = await prisma.webSearchCache.findUnique({
    where: { provider_queryHash: { provider: view.provider, queryHash } },
  });
  if (cached && Date.now() - cached.createdAt.getTime() < CACHE_MS) return cached.results as unknown as WebResult[];

  const key = dayKey(userId);
  if ((usage.get(key) ?? 0) >= view.dailyLimit) {
    if (options.testing) throw new WebSearchError("今日联网搜索次数已用完", 429);
    return [];
  }

  try {
    const raw = view.provider === "tavily" ? await searchTavily(normalized, apiKey) : await searchBocha(normalized, apiKey);
    const results = raw.filter((item) => /^https?:\/\//.test(item.url) && item.snippet).slice(0, MAX_RESULTS);
    usage.set(key, (usage.get(key) ?? 0) + 1);
    const value = results as unknown as Prisma.InputJsonArray;
    await prisma.webSearchCache.upsert({
      where: { provider_queryHash: { provider: view.provider, queryHash } },
      create: { provider: view.provider, queryHash, results: value },
      update: { results: value, createdAt: new Date() },
    });
    return results;
  } catch (error) {
    console.warn("[web-search]", (error as Error).message);
    if (options.testing) throw error instanceof WebSearchError ? error : new WebSearchError("无法连接搜索服务");
    return [];
  }
}

const BACKGROUND_PATTERN =
  /(书评|评价|评论|口碑|争议|批评|影响|地位|背景|时代|历史背景|作者(?:是谁|生平|简介|经历)|生平|后世|学界|学者|研究|怎么看|如何看待|现实意义|启示|相关(?:著作|作品|书籍)|延伸阅读)/;

/** Does the question ask for something outside the book's own text? */
export function wantsOutsideKnowledge(query: string) {
  return BACKGROUND_PATTERN.test(query);
}

/** A search-engine query: the book anchors it, the question's keywords steer it. */
export function buildWebQuery(bookTitle: string, author: string | null | undefined, keywords: string[]) {
  return [`《${bookTitle}》`, author?.trim(), ...keywords.slice(0, 5)].filter(Boolean).join(" ");
}
