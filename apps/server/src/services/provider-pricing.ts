import type { ModelTier } from "./prompt-registry.js";

export interface TokenRates {
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
}

/**
 * Conservative paid-tier list rates for the exact model IDs used by Hallazia
 * (official pages checked 2026-10-06):
 * Google: https://ai.google.dev/gemini-api/docs/pricing
 * DeepSeek: https://api-docs.deepseek.com/quick_start/pricing/
 * Groq: https://console.groq.com/docs/model/qwen/qwen3.8-27b
 * OpenRouter free models: https://openrouter.ai/openrouter/free/apps
 * DeepSeek cache discounts are deliberately not applied because adapters do
 * not expose cache-hit tokens. Unknown IDs fall back to the configured model
 * tier estimate; callers must continue to label that amount as an estimate.
 */
export function ratesForModel(
  provider: string,
  model: string,
  tier: ModelTier,
  fallback: TokenRates,
): TokenRates {
  const normalizedModel = model.trim().toLowerCase();
  if (provider === "gemini" && normalizedModel === "gemini-3.5-flash-lite") {
    return { inputPerMillion: 0.3, outputPerMillion: 2.5 };
  }
  if (provider === "deepseek" && normalizedModel === "deepseek-flash") {
    // Peak, cache-miss prices avoid underestimating when cache/time metadata
    // is unavailable.
    return { inputPerMillion: 0.3, outputPerMillion: 1.2 };
  }
  if (provider === "groq" && normalizedModel === "qwen/qwen3.8-27b") {
    return { inputPerMillion: 0.8, outputPerMillion: 4 };
  }
  if (provider === "openrouter" && (normalizedModel === "openrouter/free" || normalizedModel.endsWith(":free"))) {
    return { inputPerMillion: 0, outputPerMillion: 0 };
  }
  if (provider === "openai") return fallback;
  // Other custom aliases and future model IDs need explicit rate configuration
  // before their provider price can be known.
  // The existing powerful-tier estimate is retained as a visible estimate,
  // not represented as provider-reported billing.
  return tier === "powerful"
    ? { inputPerMillion: 1.25, outputPerMillion: 10 }
    : fallback;
}

export function estimateTokenCost(
  rates: TokenRates,
  inputTokens: number,
  outputTokens: number,
): number {
  return Number(
    ((inputTokens * rates.inputPerMillion + outputTokens * rates.outputPerMillion) / 1_000_000).toFixed(8),
  );
}
