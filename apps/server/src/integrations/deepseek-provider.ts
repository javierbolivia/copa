import type { LlmGenerateRequest, LlmGenerateResult, LlmProvider } from "@our-platform/shared";
import {
  IntegrationError,
  httpIntegrationError,
  normalizeFetchError,
  readErrorType,
} from "./integration-error.js";

export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";

export interface DeepSeekProviderOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly endpoint?: string;
}

interface DeepSeekResponse {
  readonly model?: unknown;
  readonly choices?: Array<{
    readonly finish_reason?: unknown;
    readonly message?: { readonly content?: unknown };
  }>;
  readonly usage?: {
    readonly prompt_tokens?: unknown;
    readonly completion_tokens?: unknown;
  };
}

const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const isDeepSeekV4Pro = (model: string): boolean =>
  model.trim().toLowerCase().replace(/[\s_-]+/g, "") === "deepseekv4pro";

const assertAllowedModel = (model: string): void => {
  if (isDeepSeekV4Pro(model)) {
    throw new Error("DeepSeek V4 Pro no está permitido por la política de modelos.");
  }
};

/** Server-only OpenAI-compatible client used exclusively by the Research route. */
export class DeepSeekProvider implements LlmProvider {
  readonly name = "deepseek";
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpoint: string;
  private readonly model: string;

  constructor(options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.endpoint = options.endpoint ?? "https://api.deepseek.com/chat/completions";
    const model = options.model?.trim() || DEEPSEEK_DEFAULT_MODEL;
    assertAllowedModel(model);
    this.model = model;
  }

  get configured(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
  }

  get effectiveModel(): string {
    return this.model;
  }

  async generate<TOutput = string>(request: LlmGenerateRequest): Promise<LlmGenerateResult<TOutput>> {
    if (!this.configured) throw new IntegrationError("missing_api_key", "DeepSeek no está configurado.");
    const model = request.model.trim() || this.model;
    assertAllowedModel(model);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: request.systemInstructions },
            { role: "user", content: request.input },
          ],
          ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
          ...(request.structuredOutput ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw normalizeFetchError(error, "DeepSeek");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw httpIntegrationError("DeepSeek", response.status, await readErrorType(response));

    let body: DeepSeekResponse;
    try {
      body = await response.json() as DeepSeekResponse;
    } catch (error) {
      throw new IntegrationError("invalid_response", "DeepSeek devolvió una respuesta que no es JSON.", { cause: error });
    }
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new IntegrationError("invalid_response", "DeepSeek no devolvió texto de salida.");
    }
    let output: unknown = text;
    if (request.structuredOutput) {
      try {
        output = JSON.parse(text);
      } catch (error) {
        throw new IntegrationError("schema_mismatch", "La salida estructurada de DeepSeek no contiene JSON válido.", { cause: error });
      }
    }
    const inputTokens = number(body.usage?.prompt_tokens);
    const outputTokens = number(body.usage?.completion_tokens);
    const finishReason = typeof body.choices?.[0]?.finish_reason === "string"
      ? body.choices[0].finish_reason
      : undefined;
    return {
      provider: this.name,
      requestedModel: model,
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
