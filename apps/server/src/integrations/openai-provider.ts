import { withIntegrationTimeout } from "./request-timeout.js";
import type {
  LlmGenerateRequest,
  LlmGenerateResult,
  LlmProvider,
} from "@our-platform/shared";
import {
  IntegrationError,
  httpIntegrationError,
  normalizeFetchError,
  readErrorType,
} from "./integration-error.js";
import { matchesJsonSchema, parseStructuredJson } from "./structured-output.js";

interface OpenAIResponse {
  id?: unknown;
  model?: unknown;
  status?: unknown;
  output?: unknown;
  incomplete_details?: { reason?: unknown } | null;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    input_tokens_details?: { cached_tokens?: unknown };
  };
}

export interface OpenAIProviderOptions {
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly endpoint?: string;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractOutputText(output: unknown): string | undefined {
  if (!Array.isArray(output)) return undefined;
  const texts: string[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null || (item as { type?: unknown }).type !== "message") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part === "object" && part !== null && (part as { type?: unknown }).type === "output_text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") texts.push(text);
      }
    }
  }
  return texts.length > 0 ? texts.join("\n") : undefined;
}

export class OpenAIProvider implements LlmProvider {
  readonly name = "openai";
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.endpoint = options.endpoint ?? "https://api.openai.com/v1/responses";
  }

  get configured(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
  }

  async generate<TOutput = string>(request: LlmGenerateRequest): Promise<LlmGenerateResult<TOutput>> {
    try {
      return await this.requestOnce<TOutput>(request);
    } catch (error) {
      if (!(error instanceof IntegrationError) || error.code !== "schema_mismatch" || !request.structuredOutput
        || request.structuredOutput.retryOnInvalidSchema === false) throw error;
      return this.requestOnce<TOutput>({
        ...request,
        input: `${request.input}\n\nREPARACION DE FORMATO (unico reintento): la respuesta anterior no cumplio el JSON Schema. Devuelve solamente un objeto JSON valido que cumpla exactamente el schema solicitado. No agregues markdown ni comentarios.`,
      });
    }
  }

  private async requestOnce<TOutput>(request: LlmGenerateRequest): Promise<LlmGenerateResult<TOutput>> {
    if (!this.configured) throw new IntegrationError("missing_api_key", "OpenAI no está configurado.");
    const text = request.structuredOutput ? {
      format: {
        type: "json_schema",
        name: request.structuredOutput.name,
        // Non-strict provider decoding permits additive module fields; the complete
        // response is still validated locally and gets one repair attempt.
        strict: false,
        schema: request.structuredOutput.jsonSchema,
      },
    } : undefined;

    const { body } = await withIntegrationTimeout("OpenAI", this.timeoutMs, async signal => {
      let response: Response;
      try {
        response = await this.fetchFn(this.endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: request.model,
            instructions: request.systemInstructions,
            input: request.input,
            ...(request.maxOutputTokens === undefined ? {} : { max_output_tokens: request.maxOutputTokens }),
            ...(text === undefined ? {} : { text }),
          }),
          signal,
        });
      } catch (error) {
        throw normalizeFetchError(error, "OpenAI");
      }

      if (!response.ok) throw httpIntegrationError("OpenAI", response.status, await readErrorType(response));

      let body: OpenAIResponse;
      try {
        body = await response.json() as OpenAIResponse;
      } catch (error) {
        throw new IntegrationError("invalid_response", "OpenAI devolvió una respuesta que no es JSON.", { cause: error });
      }
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new IntegrationError("invalid_response", "OpenAI devolvió una respuesta JSON que no es un objeto.");
      }
      return { response, body };
    });
    const outputText = extractOutputText(body.output);
    if (outputText === undefined) {
      throw new IntegrationError("invalid_response", "OpenAI no devolvió texto de salida.");
    }

    let output: unknown = outputText;
    if (request.structuredOutput) {
      output=parseStructuredJson(outputText);
      if(output===undefined)throw new IntegrationError("schema_mismatch", "La salida estructurada de OpenAI no contiene JSON válido.");
      if (!matchesJsonSchema(request.structuredOutput.jsonSchema, output)) {
        throw new IntegrationError("schema_mismatch", "La salida estructurada de OpenAI no cumple el schema solicitado.");
      }
    }

    const inputTokens = numberOrUndefined(body.usage?.input_tokens);
    const outputTokens = numberOrUndefined(body.usage?.output_tokens);
    const cachedTokens = numberOrUndefined(body.usage?.input_tokens_details?.cached_tokens);
    const finishReason = typeof body.incomplete_details?.reason === "string"
      ? body.incomplete_details.reason
      : typeof body.status === "string" ? body.status : undefined;
    return {
      provider: this.name,
      requestedModel: request.model,
      ...(typeof body.model === "string" ? { reportedModel: body.model } : {}),
      output: output as TOutput,
      usage: {
        ...(inputTokens === undefined ? {} : { inputTokens }),
        ...(outputTokens === undefined ? {} : { outputTokens }),
        ...(cachedTokens === undefined ? {} : { cachedTokens }),
        usageKind: body.usage === undefined ? "unknown" : "provider_reported",
      },
      ...(finishReason === undefined ? {} : { finishReason }),
    };
  }
}
