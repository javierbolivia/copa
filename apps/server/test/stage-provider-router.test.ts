import { describe, it, expect } from "vitest";
import { StageProviderRouter } from "../src/services/stage-provider-router.js";
import type { LlmProvider, LlmGenerateRequest, LlmGenerateResult } from "@our-platform/shared";
import { DEEPSEEK_DEFAULT_MODEL } from "../src/integrations/deepseek-provider.js";
import { GEMINI_ANALYSIS_MODEL } from "../src/services/module-service.js";
import { GROQ_DEFAULT_MODEL } from "../src/integrations/groq-provider.js";
import { OPENROUTER_DEFAULT_MODEL } from "../src/integrations/openrouter-provider.js";

function makeMockProvider(name: string): LlmProvider & { configured: boolean; effectiveModel: string } {
  return {
    name,
    configured: true,
    effectiveModel: name === "deepseek" ? DEEPSEEK_DEFAULT_MODEL : name === "groq" ? GROQ_DEFAULT_MODEL : OPENROUTER_DEFAULT_MODEL,
    async generate<TOutput = string>(req: LlmGenerateRequest): Promise<LlmGenerateResult<TOutput>> {
      return {
        provider: name,
        requestedModel: req.model,
        output: "ok" as TOutput,
        usage: { inputTokens: 10, outputTokens: 10, usageKind: "estimated" },
      };
    },
  };
}

describe("StageProviderRouter", () => {
  const deepSeek = makeMockProvider("deepseek");
  const gemini = makeMockProvider("gemini");
  const groq = makeMockProvider("groq");
  const openRouter = makeMockProvider("openrouter");

  const router = new StageProviderRouter({
    deepSeek: deepSeek as never,
    gemini: gemini as never,
    groq: groq as never,
    openRouter: openRouter as never,
  });

  it("routes Research to Gemini as primary", () => {
    const chain = router.resolveProviderChain("research/direct");
    expect(chain[0]!.provider.name).toBe("gemini");
    expect(chain[0]!.model).toBe(GEMINI_ANALYSIS_MODEL);
  });

  it("routes Problems MAP to DeepSeek V4 Flash as primary", () => {
    const chain = router.resolveProviderChain("problems/map");
    expect(chain[0]!.provider.name).toBe("deepseek");
    expect(chain[0]!.model).toBe(DEEPSEEK_DEFAULT_MODEL);
    // Groq is fallback 1, OpenRouter fallback 2
    expect(chain[1]!.provider.name).toBe("groq");
    expect(chain[1]!.model).toBe(GROQ_DEFAULT_MODEL);
    expect(chain[2]!.provider.name).toBe("openrouter");
    expect(chain[2]!.model).toBe(OPENROUTER_DEFAULT_MODEL);
  });

  it("routes Problems Reduce to DeepSeek V4 Flash as primary", () => {
    const chain = router.resolveProviderChain("problems/global_reduce");
    expect(chain[0]!.provider.name).toBe("deepseek");
    expect(chain[0]!.model).toBe(DEEPSEEK_DEFAULT_MODEL);
    expect(chain[1]!.provider.name).toBe("gemini");
  });

  it("routes Opportunities to DeepSeek V4 Flash as primary", () => {
    const chain = router.resolveProviderChain("opportunities/direct");
    expect(chain[0]!.provider.name).toBe("deepseek");
    expect(chain[0]!.model).toBe(DEEPSEEK_DEFAULT_MODEL);
  });

  it("routes Sources relevance to DeepSeek V4 Flash as primary", () => {
    const chain = router.resolveProviderChain("sources/relevance");
    expect(chain[0]!.provider.name).toBe("deepseek");
    expect(chain[0]!.model).toBe(DEEPSEEK_DEFAULT_MODEL);
    expect(chain[1]!.provider.name).toBe("groq");
  });

  it("records non-silent fallback audit when primary fails", async () => {
    const failingDeepSeek: LlmProvider & { configured: boolean; effectiveModel: string } = {
      name: "deepseek",
      configured: true,
      effectiveModel: DEEPSEEK_DEFAULT_MODEL,
      async generate() {
        throw new Error("DeepSeek 429 rate limit");
      },
    };

    const fallbackRouter = new StageProviderRouter({
      deepSeek: failingDeepSeek as never,
      groq: groq as never,
    });

    const fallbackEvents: unknown[] = [];
    const result = await fallbackRouter.generateWithRouting(
      "problems/map",
      {
        systemInstructions: "Test",
        input: "Hello",
      },
      {
        onFallback: (record) => fallbackEvents.push(record),
      },
    );

    expect(result.isFallback).toBe(true);
    expect(result.provider).toBe("groq");
    expect(fallbackEvents.length).toBe(1);
    expect(fallbackRouter.getFallbackAuditLog().length).toBe(1);
    expect(fallbackRouter.getFallbackAuditLog()[0]!.primaryProvider).toBe("deepseek");
    expect(fallbackRouter.getFallbackAuditLog()[0]!.fallbackProvider).toBe("groq");
    expect(fallbackRouter.getFallbackAuditLog()[0]!.reason).toContain("DeepSeek 429");
  });
});
