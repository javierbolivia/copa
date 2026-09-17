/**
 * OpenRouter provider — OpenAI-compatible chat/completions API.
 *
 * Secondary fallback provider using openrouter/free router.
 * Validated model: openrouter/free (HTTP 200, valid JSON/schema, Spanish).
 */

import { withIntegrationTimeout } from "./request-timeout.js";
import type { LlmGenerateRequest, LlmGenerateResult, LlmProvider } from "@our-platform/shared";
import { IntegrationError, normalizeFetchError } from "./integration-error.js";
import { matchesJsonSchema, parseStructuredJson } from "./structured-output.js";

export const OPENROUTER_DEFAULT_MODEL = "openrouter/free";

export interface OpenRouterProviderOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly endpoint?: string;
}

interface OpenRouterResponse {
  readonly id?: unknown;
  readonly model?: unknown;
  readonly choices?: readonly OpenRouterChoice[];
  readonly usage?: {
    readonly prompt_tokens?: unknown;
    readonly completion_tokens?: unknown;
    readonly total_tokens?: unknown;
  };
}

interface OpenRouterChoice {
  readonly index?: unknown;
  readonly finish_reason?: unknown;
  readonly message?: { readonly content?: unknown; readonly role?: unknown };
}

const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export class OpenRouterProvider implements LlmProvider {
  readonly name = "openrouter";
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpoint: string;
  readonly effectiveModel: string;

  constructor(options: OpenRouterProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.endpoint = options.endpoint ?? "https://openrouter.ai/api/v1/chat/completions";
    this.effectiveModel = options.model?.trim() || OPENROUTER_DEFAULT_MODEL;
  }

  get configured(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
  }

  async generate<TOutput = string>(request: LlmGenerateRequest): Promise<LlmGenerateResult<TOutput>> {
    if (!this.configured) throw new IntegrationError("missing_api_key", "OpenRouter no está configurado.");

    const messages = [
      { role: "system" as const, content: request.systemInstructions },
      { role: "user" as const, content: request.input },
    ];

    const requestBody: Record<string, unknown> = {
      model: request.model || this.effectiveModel,
      messages,
      ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
      temperature: 0.3,
    };

    if (request.structuredOutput) {
      requestBody.response_format = { type: "json_object" };
      messages[0] = {
        role: "system",
        content: `${request.systemInstructions}\n\nIMPORTANT: Respond ONLY with valid JSON matching this schema:\n${JSON.stringify(request.structuredOutput.jsonSchema, null, 0)}`,
      };
    }

    const { body } = await withIntegrationTimeout("OpenRouter", this.timeoutMs, async (signal) => {
      let response: Response;
      try {
        response = await this.fetchFn(this.endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
            "HTTP-Referer": "https://hallazia.local",
            "X-Title": "Hallazia",
          },
          body: JSON.stringify(requestBody),
          signal,
        });
      } catch (error) {
        throw normalizeFetchError(error, "OpenRouter");
      }

      if (response.status === 429) {
        throw new IntegrationError("rate_limited", "OpenRouter respondió con HTTP 429 (rate limited).", {
          status: 429,
          retryable: true,
        });
      }
      if (!response.ok) {
        let errorMessage = `OpenRouter respondió con HTTP ${response.status}`;
        try {
          const errorBody = (await response.json()) as Record<string, unknown>;
          if (typeof errorBody.error === "object" && errorBody.error !== null) {
            const err = errorBody.error as Record<string, unknown>;
            if (typeof err.message === "string") errorMessage = `OpenRouter: ${err.message}`;
          }
        } catch { /* Non-JSON error body */ }
        throw new IntegrationError("http_error", errorMessage, {
          status: response.status,
          retryable: response.status === 503,
        });
      }

      let body: OpenRouterResponse;
      try {
        body = (await response.json()) as OpenRouterResponse;
      } catch (error) {
        throw new IntegrationError("invalid_response", "OpenRouter devolvió una respuesta que no es JSON.", { cause: error });
      }

      return { response, body };
    });

    const choices = Array.isArray(body.choices) ? body.choices : [];
    const first = choices[0];
    const text = typeof first?.message?.content === "string" ? first.message.content : "";

    if (!text.trim()) {
      throw new IntegrationError(
        "invalid_response",
        `OpenRouter no devolvió texto. finishReason=${first?.finish_reason ?? "unknown"}`,
      );
    }

    let output: unknown = text;
    if (request.structuredOutput) {
      output = parseStructuredJson(text);
      if (output === undefined) {
        throw new IntegrationError("schema_mismatch", "La salida estructurada de OpenRouter no contiene JSON válido.");
      }
      if (!matchesJsonSchema(request.structuredOutput.jsonSchema, output)) {
        throw new IntegrationError("schema_mismatch", "La salida estructurada de OpenRouter no cumple el schema solicitado.");
      }
    }

    const inputTokens = number(body.usage?.prompt_tokens);
    const outputTokens = number(body.usage?.completion_tokens);
    const finishReason = typeof first?.finish_reason === "string" ? first.finish_reason : undefined;

    return {
      provider: this.name,
      requestedModel: request.model || this.effectiveModel,
      ...(typeof body.model === "string" ? { reportedModel: body.model } : {}),
      output: output as TOutput,
      usage: {
        ...(inputTokens === undefined ? {} : { inputTokens }),
        ...(outputTokens === undefined ? {} : { outputTokens }),
        usageKind: body.usage === undefined ? "unknown" : "provider_reported",
      },
      ...(finishReason === undefined ? {} : { finishReason }),
    };
  }
}
