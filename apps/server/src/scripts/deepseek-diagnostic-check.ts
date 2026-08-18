import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";

import { WORKSPACE_ROOT } from "../config.js";
import { DEEPSEEK_DEFAULT_MODEL, DeepSeekProvider } from "../integrations/deepseek-provider.js";
import { IntegrationError } from "../integrations/integration-error.js";

loadDotEnv({ path: resolve(WORKSPACE_ROOT, ".env"), quiet: true });

/**
 * Server-only diagnostic: exactly one non-streaming `deepseek-v4-flash` call.
 * It reports response shape metadata only. Prompts, generated text, credentials,
 * headers, and raw bodies are never captured, logged, or persisted.
 */
type SafeReport = {
  endpointHost: string | null;
  endpointPath: string | null;
  method: string | null;
  model: string;
  stream: boolean | null;
  requestFields: readonly string[];
  httpStatus: number | null;
  contentType: string | null;
  contentLength: string | null;
  responseFields: readonly string[];
  choicesType: string | null;
  messagePresent: boolean | null;
  contentType_shape: string | null;
  contentEmpty: boolean | null;
  reasoningContentPresent: boolean | null;
  finishReason: string | null;
  usagePresent: boolean | null;
  reasoningTokensPresent: boolean | null;
  inputTokens: number | null;
  outputTokens: number | null;
  structureValid: boolean;
  providerErrorCode: string | null;
  safeErrorCategory: string | null;
};

const report: SafeReport = {
  endpointHost: null,
  endpointPath: null,
  method: null,
  model: DEEPSEEK_DEFAULT_MODEL,
  stream: null,
  requestFields: [],
  httpStatus: null,
  contentType: null,
  contentLength: null,
  responseFields: [],
  choicesType: null,
  messagePresent: null,
  contentType_shape: null,
  contentEmpty: null,
  reasoningContentPresent: null,
  finishReason: null,
  usagePresent: null,
  reasoningTokensPresent: null,
  inputTokens: null,
  outputTokens: null,
  structureValid: false,
  providerErrorCode: null,
  safeErrorCategory: null,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const inspectingFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  report.endpointHost = url.host;
  report.endpointPath = url.pathname;
  report.method = init?.method ?? "GET";
  if (typeof init?.body === "string") {
    try {
      const requestBody = JSON.parse(init.body) as Record<string, unknown>;
      report.requestFields = Object.keys(requestBody).sort();
      report.stream = typeof requestBody.stream === "boolean" ? requestBody.stream : null;
    } catch {
      report.requestFields = [];
    }
  }

  const response = await globalThis.fetch(input, init);
  report.httpStatus = response.status;
  report.contentType = response.headers.get("content-type");
  report.contentLength = response.headers.get("content-length");

  try {
    const body = await response.clone().json() as unknown;
    if (isRecord(body)) {
      report.responseFields = Object.keys(body).sort();
      const error = isRecord(body.error) ? body.error : undefined;
      const providerCode = error?.code ?? error?.type;
      report.providerErrorCode = typeof providerCode === "string" ? providerCode : null;
      report.choicesType = Array.isArray(body.choices) ? "array" : body.choices === undefined ? "absent" : typeof body.choices;
      const choice = Array.isArray(body.choices) && isRecord(body.choices[0]) ? body.choices[0] : undefined;
      if (choice) {
        report.finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : null;
        const message = isRecord(choice.message) ? choice.message : undefined;
        report.messagePresent = message !== undefined;
        if (message) {
          report.contentType_shape = message.content === null ? "null" : typeof message.content;
          report.contentEmpty = typeof message.content === "string" ? message.content.trim().length === 0 : true;
          report.reasoningContentPresent = typeof message.reasoning_content === "string"
            && message.reasoning_content.trim().length > 0;
        }
      }
      const usage = isRecord(body.usage) ? body.usage : undefined;
      report.usagePresent = usage !== undefined;
      report.reasoningTokensPresent = isRecord(usage?.completion_tokens_details)
        && typeof usage.completion_tokens_details.reasoning_tokens === "number";
    }
  } catch {
    report.responseFields = [];
  }
  return response;
};

const provider = new DeepSeekProvider({
  ...(process.env.DEEPSEEK_API_KEY ? { apiKey: process.env.DEEPSEEK_API_KEY } : {}),
  model: DEEPSEEK_DEFAULT_MODEL,
  thinking: "disabled",
  fetch: inspectingFetch,
});

try {
  const result = await provider.generate({
    provider: "deepseek",
    model: DEEPSEEK_DEFAULT_MODEL,
    systemInstructions: "Responde con una sola palabra.",
    input: "OK",
    maxOutputTokens: 32,
  });
  report.structureValid = true;
  report.model = result.reportedModel ?? result.requestedModel;
  report.inputTokens = result.usage.inputTokens ?? null;
  report.outputTokens = result.usage.outputTokens ?? null;
  report.finishReason = result.finishReason ?? report.finishReason;
} catch (error) {
  report.structureValid = false;
  report.safeErrorCategory = error instanceof IntegrationError ? error.code : "unknown";
}

console.log(JSON.stringify(report));
