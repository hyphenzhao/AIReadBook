import { createOpenAI } from "@ai-sdk/openai";

// DeepSeek API — OpenAI-compatible
// Docs: https://api-docs.deepseek.com

export function createDeepSeekClient(apiKey?: string, baseUrl?: string) {
  return createOpenAI({
    baseURL: baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    apiKey: apiKey || process.env.DEEPSEEK_API_KEY || "",
  });
}

// Current models (as of 2026-07)
export const DEEPSEEK_MODELS = {
  flash: "deepseek-v4-flash",       // Fast, cost-effective
  pro: "deepseek-v4-pro",           // Best quality, reasoning
  chat: "deepseek-chat",            // Legacy (deprecates 2026/07/24)
  reasoner: "deepseek-reasoner",    // Legacy (deprecates 2026/07/24)
} as const;

export const DEEPSEEK_DEFAULT = "deepseek-v4-flash";

// Base URLs
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_ANTHROPIC_URL = "https://api.deepseek.com/anthropic";
