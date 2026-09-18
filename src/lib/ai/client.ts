import { createOpenAI } from "@ai-sdk/openai";

// Any OpenAI-compatible endpoint works (DeepSeek, Ollama, vLLM, ...). The
// model list is fetched from the provider at runtime — see /api/v2/ai/models.

export const DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_MODEL = "deepseek-v4-flash";

/** Hosts known to accept `thinking: { type: "disabled" }`. Others may reject unknown fields. */
function supportsThinkingSwitch(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname.endsWith("deepseek.com");
  } catch {
    return false;
  }
}

/**
 * `disableThinking`: reasoning models spend hidden tokens before answering —
 * measured at 120 of 152 output tokens for a one-line answer — and those count
 * against max_tokens. Extraction-style tasks gain nothing from it, so it is
 * switched off where the provider offers a switch.
 */
export function createLLMClient(apiKey: string, baseUrl: string, options: { disableThinking?: boolean } = {}) {
  const injectThinkingOff = options.disableThinking && supportsThinkingSwitch(baseUrl);
  return createOpenAI({
    baseURL: baseUrl,
    apiKey,
    compatibility: "compatible",
    fetch: injectThinkingOff
      ? async (input, init) => {
          if (typeof init?.body === "string") {
            try {
              init = { ...init, body: JSON.stringify({ ...JSON.parse(init.body), thinking: { type: "disabled" } }) };
            } catch {
              // Not JSON: send it as it is.
            }
          }
          return fetch(input, init);
        }
      : undefined,
  });
}
