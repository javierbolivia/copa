/**
 * STAGE-BASED PROVIDER ROUTER
 *
 * Deterministic router that assigns the optimal provider and model
 * per pipeline stage, with auditable, non-silent fallbacks.
 *
 * Routing Policy:
 * - Sources LLM heavy tasks -> DeepSeek V4 Flash
 * - Research -> Gemini 3.5 Flash Lite (proven working, payload projected)
 * - Problems MAP -> DeepSeek V4 Flash (primary) | Groq Qwen 3.8 (fallback 1) | OpenRouter free (fallback 2)
 * - Problems Reduce -> DeepSeek V4 Flash (primary) | Gemini 3.5 Flash Lite / Groq (fallback)
 * - Vocabulary Discovery -> DeepSeek V4 Flash | Groq Qwen 3.8 | Gemini
 * - Opportunities -> DeepSeek V4 Flash | Groq Qwen 3.8
 * - Downstream Modules -> DeepSeek V4 Flash | Gemini
 */

import type { LlmGenerateRequest, LlmGenerateResult, LlmProvider } from "@our-platform/shared";
import { IntegrationError } from "../integrations/integration-error.js";
import { DEEPSEEK_DEFAULT_MODEL, type DeepSeekProvider } from "../integrations/deepseek-provider.js";
import type { GeminiProvider } from "../integrations/gemini-provider.js";
import { GEMINI_ANALYSIS_MODEL } from "../integrations/gemini-provider.js";
import { GROQ_DEFAULT_MODEL, type GroqProvider } from "../integrations/groq-provider.js";
import { OPENROUTER_DEFAULT_MODEL, type OpenRouterProvider } from "../integrations/openrouter-provider.js";
import type { OpenAIProvider } from "../integrations/openai-provider.js";

export type PipelineStage =
  | "sources/relevance"
  | "research/direct"
  | "problems/map"
  | "problems/global_reduce"
  | "vocabulary_discovery"
  | "opportunities/direct"
  | "downstream/direct";

export interface StageFallbackRecord {
  readonly stage: PipelineStage;
  readonly primaryProvider: string;
  readonly primaryModel: string;
  readonly fallbackProvider: string;
  readonly fallbackModel: string;
  readonly reason: string;
  readonly timestamp: string;
}

export interface StageRouterOptions {
  readonly deepSeek?: DeepSeekProvider;
  readonly gemini?: GeminiProvider;
  readonly groq?: GroqProvider;
  readonly openRouter?: OpenRouterProvider;
  readonly openAI?: OpenAIProvider;
}

export interface RoutedGenerateResult<TOutput = string> extends LlmGenerateResult<TOutput> {
  readonly routeStage: PipelineStage;
  readonly isFallback: boolean;
  readonly fallbackRecord?: StageFallbackRecord;
}

export class StageProviderRouter {
  private readonly fallbackAuditLog: StageFallbackRecord[] = [];

  constructor(private readonly options: StageRouterOptions) {}

  getFallbackAuditLog(): readonly StageFallbackRecord[] {
    return [...this.fallbackAuditLog];
  }

  resolveValidationStage(stage: PipelineStage): {provider:LlmProvider; model:string} {
    if(stage==="problems/map" && this.options.deepSeek?.configured)return {provider:this.options.deepSeek,model:this.options.deepSeek.effectiveModel};
    if((stage==="problems/global_reduce"||stage==="opportunities/direct")&&this.options.gemini?.configured)return {provider:this.options.gemini,model:GEMINI_ANALYSIS_MODEL};
    throw new Error(`VALIDATION_STAGE_UNAVAILABLE: ${stage}`);
  }

  /**
   * Determine primary provider and candidate fallbacks for a given stage.
   */
  resolveProviderChain(
    stage: PipelineStage,
    preferredGlobal?: string,
  ): Array<{ provider: LlmProvider; model: string }> {
    const chain: Array<{ provider: LlmProvider; model: string }> = [];

    const getDeepSeek = () =>
      this.options.deepSeek?.configured
        ? { provider: this.options.deepSeek, model: this.options.deepSeek.effectiveModel || DEEPSEEK_DEFAULT_MODEL }
        : undefined;

    const getGemini = () =>
      this.options.gemini?.configured
        ? { provider: this.options.gemini, model: GEMINI_ANALYSIS_MODEL }
        : undefined;

    const getGroq = () =>
      this.options.groq?.configured
        ? { provider: this.options.groq, model: this.options.groq.effectiveModel || GROQ_DEFAULT_MODEL }
        : undefined;

    const getOpenRouter = () =>
      this.options.openRouter?.configured
        ? { provider: this.options.openRouter, model: this.options.openRouter.effectiveModel || OPENROUTER_DEFAULT_MODEL }
        : undefined;

    const getOpenAI = (model = "gpt-5-mini") =>
      this.options.openAI?.configured
        ? { provider: this.options.openAI, model }
        : undefined;

    // Stage-specific routing policy
    switch (stage) {
      case "research/direct": {
        // Research: Gemini 3.5 Flash Lite is proven working with projected payload
        const gemini = getGemini();
        if (gemini) chain.push(gemini);
        const deepseek = getDeepSeek();
        if (deepseek) chain.push(deepseek);
        break;
      }

      case "problems/map": {
        // Problems MAP: DeepSeek V4 Flash primary, Groq Qwen 3.8 fallback 1, OpenRouter fallback 2
        const ds = getDeepSeek();
        if (ds) chain.push(ds);
        const groq = getGroq();
        if (groq) chain.push(groq);
        const openRouter = getOpenRouter();
        if (openRouter) chain.push(openRouter);
        const gemini = getGemini();
        if (gemini) chain.push(gemini);
        break;
      }

      case "problems/global_reduce": {
        // Problems Reduce: DeepSeek V4 Flash primary, Gemini fallback 1, Groq fallback 2
        const ds = getDeepSeek();
        if (ds) chain.push(ds);
        const gemini = getGemini();
        if (gemini) chain.push(gemini);
        const groq = getGroq();
        if (groq) chain.push(groq);
        const openRouter = getOpenRouter();
        if (openRouter) chain.push(openRouter);
        break;
      }

      case "vocabulary_discovery": {
        const ds = getDeepSeek();
        if (ds) chain.push(ds);
        const groq = getGroq();
        if (groq) chain.push(groq);
        const gemini = getGemini();
        if (gemini) chain.push(gemini);
        break;
      }

      case "sources/relevance": {
        const ds = getDeepSeek();
        if (ds) chain.push(ds);
        const groq = getGroq();
        if (groq) chain.push(groq);
        const gemini = getGemini();
        if (gemini) chain.push(gemini);
        break;
      }

      case "opportunities/direct": {
        const ds = getDeepSeek();
        if (ds) chain.push(ds);
        const gemini = getGemini();
        if (gemini) chain.push(gemini);
        const groq = getGroq();
        if (groq) chain.push(groq);
        break;
      }

      default: {
        // Other modules
        if (preferredGlobal === "deepseek") {
          const ds = getDeepSeek();
          if (ds) chain.push(ds);
        }
        const gemini = getGemini();
        if (gemini) chain.push(gemini);
        const ds = getDeepSeek();
        if (ds && !chain.some((c) => c.provider.name === ds.provider.name)) chain.push(ds);
        const openai = getOpenAI();
        if (openai) chain.push(openai);
        break;
      }
    }

    return chain;
  }

  /**
   * Execute generation with deterministic stage-routing and non-silent fallbacks.
   */
  async generateWithRouting<TOutput = string>(
    stage: PipelineStage,
    request: Omit<LlmGenerateRequest, "provider" | "model">,
    options: {
      preferredGlobal?: string;
      autoFallback?: boolean;
      validationMode?: boolean;
      onFallback?: (record: StageFallbackRecord) => void;
    } = {},
  ): Promise<RoutedGenerateResult<TOutput>> {
    const chain = options.validationMode ? [this.resolveValidationStage(stage)] : this.resolveProviderChain(stage, options.preferredGlobal);
    if (chain.length === 0) {
      throw new IntegrationError(
        "missing_api_key",
        `No hay ningún proveedor configurado para la etapa ${stage}.`,
      );
    }

    const primary = chain[0]!;
    let lastError: unknown;

    for (let i = 0; i < chain.length; i++) {
      const { provider, model } = chain[i]!;
      const isFallback = i > 0;

      let fallbackRecord: StageFallbackRecord | undefined;
      if (isFallback) {
        fallbackRecord = {
          stage,
          primaryProvider: primary.provider.name,
          primaryModel: primary.model,
          fallbackProvider: provider.name,
          fallbackModel: model,
          reason: lastError instanceof Error ? lastError.message : String(lastError),
          timestamp: new Date().toISOString(),
        };
        this.fallbackAuditLog.push(fallbackRecord);
        options.onFallback?.(fallbackRecord);
      }

      try {
        const result = await provider.generate<TOutput>({
          ...request,
          provider: provider.name,
          model,
        });

        return {
          ...result,
          routeStage: stage,
          isFallback,
          ...(fallbackRecord ? { fallbackRecord } : {}),
        };
      } catch (error) {
        lastError = error;
        if(options.validationMode || options.autoFallback===false)throw error;
        // Don't retry budget exceeded or user-abort errors
        if (error instanceof IntegrationError && error.code === "request_budget_exceeded") {
          throw error;
        }
        // Proceed to next fallback in chain
      }
    }

    throw lastError;
  }
}
