import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSealed, maskSecret, openSecret, sealSecret } from "@/lib/crypto/secret-box";
import { createLLMClient, DEFAULT_BASE_URL, DEFAULT_MODEL } from "@/lib/ai/client";
import { isAllowlistedBaseUrl, isSafeBaseUrl, normalizeBaseUrl } from "@/lib/ai/base-url";

const KEY_PURPOSE = "ai-api-key";

/** Shape of `users.ai_settings`. `apiKey` is the pre-encryption legacy field. */
interface StoredAISettings {
  apiKeyEnc?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AISettingsView {
  /** True when a chat request would find usable credentials. */
  ready: boolean;
  hasKey: boolean;
  keyHint: string;
  serverKeyAvailable: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface AISettingsPatch {
  /** undefined keeps the stored key, "" clears it, anything else replaces it. */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class LLMConfigError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "LLMConfigError";
  }
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function serverKey() {
  const key = (process.env.DEEPSEEK_API_KEY || "").trim();
  // The value copied from .env.local.example is not a key. Counting it would
  // tell every user "AI is ready" and then fail each request with a 401.
  return /your|placeholder|change-?me|example|x{4,}/i.test(key) ? "" : key;
}
function serverBaseUrl() {
  return normalizeBaseUrl(process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL);
}

async function loadStored(userId: number): Promise<StoredAISettings> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiSettings: true } });
  const stored = (user?.aiSettings ?? {}) as StoredAISettings;
  if (typeof stored !== "object" || Array.isArray(stored)) return {};

  // One-time migration of keys saved before encryption existed.
  if (typeof stored.apiKey === "string") {
    const { apiKey, ...rest } = stored;
    const migrated: StoredAISettings = apiKey && !stored.apiKeyEnc
      ? { ...rest, apiKeyEnc: sealSecret(apiKey, KEY_PURPOSE) }
      : rest;
    await saveStored(userId, migrated);
    return migrated;
  }
  return stored;
}

async function saveStored(userId: number, settings: StoredAISettings) {
  await prisma.user.update({
    where: { id: userId },
    data: { aiSettings: settings as Prisma.InputJsonObject },
  });
}

function personalKey(stored: StoredAISettings) {
  return isSealed(stored.apiKeyEnc) ? openSecret(stored.apiKeyEnc, KEY_PURPOSE) : null;
}

function toView(stored: StoredAISettings): AISettingsView {
  const key = personalKey(stored);
  let ready = true;
  try { resolveCredentials(stored); } catch { ready = false; }
  return {
    ready,
    hasKey: !!key,
    // A sealed value that no longer opens means AUTH_SECRET was rotated.
    keyHint: key ? maskSecret(key) : stored.apiKeyEnc ? "已失效，请重新填写" : "",
    serverKeyAvailable: !!serverKey(),
    baseUrl: stored.baseUrl || DEFAULT_BASE_URL,
    model: stored.model || DEFAULT_MODEL,
    temperature: clamp(stored.temperature, 0, 2, 0.7),
    maxTokens: clamp(stored.maxTokens, 256, 8192, 2048),
  };
}

export async function getAISettingsView(userId: number) {
  return toView(await loadStored(userId));
}

export async function updateAISettings(userId: number, patch: AISettingsPatch) {
  const stored = await loadStored(userId);
  const next: StoredAISettings = { ...stored };

  if (patch.baseUrl !== undefined) {
    const baseUrl = normalizeBaseUrl(String(patch.baseUrl));
    if (!isSafeBaseUrl(baseUrl)) {
      throw new LLMConfigError("API Base URL 无效，或指向了未被管理员允许的内网地址");
    }
    next.baseUrl = baseUrl;
  }
  if (patch.model !== undefined) {
    const model = String(patch.model).trim();
    if (!model || model.length > 200) throw new LLMConfigError("模型名称无效");
    next.model = model;
  }
  if (patch.temperature !== undefined) next.temperature = clamp(patch.temperature, 0, 2, 0.7);
  if (patch.maxTokens !== undefined) next.maxTokens = Math.round(clamp(patch.maxTokens, 256, 8192, 2048));

  if (patch.apiKey !== undefined) {
    const apiKey = String(patch.apiKey).trim();
    if (apiKey.length > 500) throw new LLMConfigError("API Key 过长");
    if (apiKey) next.apiKeyEnc = sealSecret(apiKey, KEY_PURPOSE);
    else delete next.apiKeyEnc;
  }

  await saveStored(userId, next);
  return toView(next);
}

interface Credentials { apiKey: string; baseUrl: string }

/**
 * Picks the key/endpoint pair to call. The server's shared key is only ever
 * sent to the server's own endpoint, never to a URL a user typed in.
 */
function resolveCredentials(stored: StoredAISettings, draft?: { apiKey?: string; baseUrl?: string }): Credentials {
  const baseUrl = normalizeBaseUrl(draft?.baseUrl || stored.baseUrl || DEFAULT_BASE_URL);
  if (!isSafeBaseUrl(baseUrl)) {
    throw new LLMConfigError("API Base URL 无效，或指向了未被管理员允许的内网地址");
  }
  const apiKey = draft?.apiKey?.trim() || personalKey(stored);
  if (apiKey) return { apiKey, baseUrl };
  // Local inference servers on the operator's allowlist need no key.
  if (isAllowlistedBaseUrl(baseUrl)) return { apiKey: "none", baseUrl };
  if (serverKey() && (!draft?.baseUrl || baseUrl === serverBaseUrl())) {
    return { apiKey: serverKey(), baseUrl: serverBaseUrl() };
  }
  throw new LLMConfigError("请先在「设置 → AI 设置」中填写 API Key", 412);
}

// Reasoning models bill their hidden thinking against max_tokens, so a limit
// meant for the visible answer needs room on top or the answer gets squeezed
// out (seen in practice: 2048 tokens spent, nothing shown).
const REASONING_HEADROOM = 4096;
const STRUCTURED_MAX_TOKENS = 8192;

/**
 * The model client for a user, configured entirely on the server.
 * - "chat": the reader's own settings; Max Tokens budgets the visible answer.
 * - "structured": summaries, cards, graph extraction — low temperature, a
 *   fixed generous limit, and thinking switched off where possible.
 */
export async function getUserLLM(userId: number, task: "chat" | "structured" = "chat") {
  const stored = await loadStored(userId);
  const { apiKey, baseUrl } = resolveCredentials(stored);
  const view = toView(stored);
  const structured = task === "structured";
  const client = createLLMClient(apiKey, baseUrl, { disableThinking: structured });
  return {
    model: client(view.model),
    modelId: view.model,
    temperature: structured ? Math.min(view.temperature, 0.3) : view.temperature,
    maxTokens: structured ? STRUCTURED_MAX_TOKENS : view.maxTokens + REASONING_HEADROOM,
  };
}

/** Asks the provider which models it serves (`GET {baseUrl}/models`). */
export async function listProviderModels(userId: number, draft?: { apiKey?: string; baseUrl?: string }) {
  const { apiKey, baseUrl } = resolveCredentials(await loadStored(userId), draft);
  // DeepSeek serves /models at the root; most others under /v1.
  const candidates = /\/v\d+$/.test(baseUrl) ? [`${baseUrl}/models`] : [`${baseUrl}/models`, `${baseUrl}/v1/models`];

  let lastError = "无法获取模型列表";
  for (const url of candidates) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
    } catch {
      lastError = "无法连接到 AI 服务，请检查 Base URL 和网络";
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new LLMConfigError("API Key 无效或无权限", 400);
    if (!res.ok) { lastError = `AI 服务返回 ${res.status}`; continue; }

    const data = await res.json().catch(() => null);
    const list: unknown[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    const models = list
      .map((item: any) => (typeof item === "string" ? item : item?.id || item?.name))
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (models.length) return [...new Set(models)].sort();
    lastError = "AI 服务没有返回任何模型";
  }
  throw new LLMConfigError(lastError, 502);
}
