import type { ModelTier } from "./prompt-registry.js";

export interface TokenRates {
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
}

/**
 * Conservative paid-tier list rates for the exact model IDs used by Hallazia.
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
  if (provider === "openai") return fallback;
  // Groq, OpenRouter, custom aliases, and future model IDs need explicit
  // provider/model configuration before their price can be known.
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
