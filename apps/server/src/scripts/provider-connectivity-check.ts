import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";

import { WORKSPACE_ROOT } from "../config.js";
import { DEEPSEEK_DEFAULT_MODEL, DeepSeekProvider } from "../integrations/deepseek-provider.js";
import { ExaProvider } from "../integrations/exa-provider.js";
import { FirecrawlProvider } from "../integrations/firecrawl-provider.js";
import { IntegrationError } from "../integrations/integration-error.js";

loadDotEnv({ path: resolve(WORKSPACE_ROOT, ".env"), quiet: true });

type CheckResult = {
  configured: boolean;
  success: boolean;
  status: number | null;
  errorCategory: string | null;
  rateLimited: boolean;
  model: string | null;
  resultCount: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  usage: number | null;
  credits: number | null;
  rateLimitRemaining: number | null;
  rateLimitLimit: number | null;
};

function failedCheck(configured: boolean, model: string | null, error: unknown): CheckResult {
  const integrationError = error instanceof IntegrationError ? error : undefined;
  return {
    configured,
    success: false,
    status: integrationError?.status ?? null,
    errorCategory: integrationError?.code ?? "unknown",
    rateLimited: integrationError?.code === "rate_limited",
    model,
    resultCount: null,
    inputTokens: null,
    outputTokens: null,
    usage: null,
    credits: null,
    rateLimitRemaining: null,
    rateLimitLimit: null,
  };
}

const exa = new ExaProvider({
  ...(process.env.EXA_API_KEY ? { apiKey: process.env.EXA_API_KEY } : {}),
});
const firecrawl = new FirecrawlProvider({
  ...(process.env.FIRECRAWL_API_KEY ? { apiKey: process.env.FIRECRAWL_API_KEY } : {}),
});
const deepSeek = new DeepSeekProvider({
  ...(process.env.DEEPSEEK_API_KEY ? { apiKey: process.env.DEEPSEEK_API_KEY } : {}),
  model: DEEPSEEK_DEFAULT_MODEL,
});

const [exaResult, firecrawlResult, deepSeekResult] = await Promise.all([
  exa.search("provider connectivity check", { maxResults: 3 })
    .then((metadata): CheckResult => ({
      configured: exa.configured,
      success: true,
      status: metadata.status,
      errorCategory: null,
      rateLimited: false,
      model: null,
      resultCount: metadata.resultCount,
      inputTokens: null,
      outputTokens: null,
      usage: metadata.usage ?? null,
      credits: null,
      rateLimitRemaining: metadata.rateLimitRemaining ?? null,
      rateLimitLimit: metadata.rateLimitLimit ?? null,
    }))
    .catch((error: unknown) => failedCheck(exa.configured, null, error)),
  firecrawl.search("provider connectivity check", { maxResults: 3 })
    .then((metadata): CheckResult => ({
      configured: firecrawl.configured,
      success: true,
      status: metadata.status,
      errorCategory: null,
      rateLimited: false,
      model: null,
      resultCount: metadata.resultCount,
      inputTokens: null,
      outputTokens: null,
      usage: metadata.usage ?? null,
      credits: metadata.credits ?? null,
      rateLimitRemaining: metadata.rateLimitRemaining ?? null,
      rateLimitLimit: metadata.rateLimitLimit ?? null,
    }))
    .catch((error: unknown) => failedCheck(firecrawl.configured, null, error)),
  deepSeek.generate({
    provider: "deepseek",
    model: DEEPSEEK_DEFAULT_MODEL,
    systemInstructions: "Responde de forma concisa.",
    input: "OK",
    maxOutputTokens: 8,
  }).then((result): CheckResult => ({
    configured: deepSeek.configured,
    success: true,
    status: null,
    errorCategory: null,
    rateLimited: false,
    model: result.reportedModel ?? result.requestedModel,
    resultCount: null,
    inputTokens: result.usage.inputTokens ?? null,
    outputTokens: result.usage.outputTokens ?? null,
    usage: null,
    credits: null,
    rateLimitRemaining: null,
    rateLimitLimit: null,
  })).catch((error: unknown) => failedCheck(deepSeek.configured, DEEPSEEK_DEFAULT_MODEL, error)),
]);

console.log(JSON.stringify({ exa: exaResult, firecrawl: firecrawlResult, deepseek: deepSeekResult }));
