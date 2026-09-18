import { createOpenAI } from "@ai-sdk/openai";

// Any OpenAI-compatible endpoint works (DeepSeek, Ollama, vLLM, ...). The
// model list is fetched from the provider at runtime — see /api/v2/ai/models.

export const DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_MODEL = "deepseek-v4-flash";

export function createLLMClient(apiKey: string, baseUrl: string) {
  return createOpenAI({ baseURL: baseUrl, apiKey, compatibility: "compatible" });
}
