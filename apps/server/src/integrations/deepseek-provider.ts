import { withIntegrationTimeout } from "./request-timeout.js";
import type { LlmGenerateRequest, LlmGenerateResult, LlmProvider } from "@our-platform/shared";
import {
  IntegrationError,
  readErrorType,
} from "./integration-error.js";
import {
  parseStructuredJson,
  validateJsonSchema,
  type JsonSchemaValidationIssue,
} from "./structured-output.js";

/** Official current model name for DeepSeek Flash. */
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-flash";

/** Thinking mode is enabled by default server-side; omit the field to keep that default. */
export type DeepSeekThinkingMode = "enabled" | "disabled";

export interface DeepSeekProviderOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly endpoint?: string;
  readonly thinking?: DeepSeekThinkingMode;
}

interface DeepSeekResponse {
  readonly model?: unknown;
  readonly choices?: unknown;
  readonly usage?: {
    readonly prompt_tokens?: unknown;
    readonly completion_tokens?: unknown;
  };
}

interface DeepSeekChoice {
  readonly finish_reason?: unknown;
  readonly message?: { readonly content?: unknown };
}

interface DeepSeekResponseApiBody {
  readonly model?: unknown;
  readonly status?: unknown;
  readonly incomplete_details?: {
    readonly reason?: unknown;
  };
  readonly output?: unknown;
  readonly usage?: {
    readonly input_tokens?: unknown;
    readonly output_tokens?: unknown;
  };
}

const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDeepSeekV4Pro = (model: string): boolean =>
  model.trim().toLowerCase().replace(/[\s_-]+/g, "") === "deepseekv4pro";

/**
 * DeepSeek keeps these retired aliases available, but serves them through the
 * current Flash model. Canonicalizing prevents configuration from pinning the
 * request path to an obsolete model name.
 */
const canonicalModel = (model: string | undefined): string | undefined => {
  if (typeof model !== "string") return undefined;
  const trimmed = model.trim();
  const normalized = trimmed.toLowerCase();
  return normalized === "deepseek-v4-flash" || normalized === "deepseek-v4-flash-vision-exp"
    ? DEEPSEEK_DEFAULT_MODEL
    : trimmed;
};

const assertAllowedModel = (model: string): void => {
  if (isDeepSeekV4Pro(model)) {
    throw new IntegrationError("unsupported_model", "DeepSeek V4 Pro no está permitido por la política de modelos.");
  }
};

const compactValidationIssues = (issues: readonly JsonSchemaValidationIssue[]): readonly JsonSchemaValidationIssue[] =>
  issues.slice(0, 8);

const validationSummary = (issues: readonly JsonSchemaValidationIssue[]): string =>
  compactValidationIssues(issues).map((issue) => {
    const missing = issue.missingRequiredProperties?.length
      ? `; missing required: ${issue.missingRequiredProperties.join(", ")}`
      : "";
    return `${issue.path} (expected ${issue.expected}; actual ${issue.actual}${missing})`;
  }).join("; ");

/**
 * DeepSeek JSON Output requires an example alongside the JSON instruction.
 * Build one from the declared contract so it only demonstrates shape and types,
 * never fabricated module data.
 */
const jsonShapeExample = (schema: unknown, depth = 0, keyName = ""): unknown => {
  if (depth > 8 || !isRecord(schema)) return "texto";
  const rawType = schema.type;
  const type = Array.isArray(rawType)
    ? (rawType.find((item): item is string => typeof item === "string" && item !== "null") ?? rawType[0])
    : rawType;
  if (type === "array") return [jsonShapeExample(schema.items, depth + 1, keyName)];
  if (type === "boolean") return false;
  if (keyName === "schemaVersion") return 1;
  if (keyName === "amount") return 27;
  if (keyName === "currency") return "USD";
  if (keyName === "provenance") return "AI_INFERENCE";
  if (type === "integer" || type === "number") return 0;
  if (type !== "object" && !schema.properties) {
    if (keyName === "id" || keyName === "selectedId") return "item-1";
    if (keyName === "problemId") return "problem-1";
    return "texto";
  }
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const keys = Object.keys(properties);
  return Object.fromEntries(keys.map(key => [key, jsonShapeExample(properties[key], depth + 1, key)]));
};

const invalidStructuredOutput = (
  issues: readonly JsonSchemaValidationIssue[],
  attemptCount: number,
): IntegrationError => new IntegrationError(
  "invalid_schema",
  `La salida estructurada de DeepSeek no cumple el schema: ${validationSummary(issues)}.`,
  { validationIssues: compactValidationIssues(issues), attemptCount },
);

/**
 * The provider can be invoked through loaders that do not preserve a shared
 * IntegrationError prototype. Keep the retry decision based on its stable,
 * public error contract rather than `instanceof`, while retaining the bounded
 * invalid-schema-only scope.
 */
const invalidSchemaIssues = (error: unknown): readonly JsonSchemaValidationIssue[] | undefined => {
  if (!isRecord(error) || error.code !== "invalid_schema") return undefined;
  const issues = error.validationIssues;
  return Array.isArray(issues) && issues.length > 0
    ? issues.filter((issue): issue is JsonSchemaValidationIssue => isRecord(issue)
      && typeof issue.path === "string"
      && typeof issue.expected === "string"
      && typeof issue.actual === "string")
    : undefined;
};

const responseApiText = (body: DeepSeekResponseApiBody & DeepSeekResponse): string | undefined => {
  if (Array.isArray(body.output)) {
    for (const item of body.output) {
      if (!isRecord(item) || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (isRecord(part) && part.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
          return part.text;
        }
      }
    }
  }
  if (Array.isArray(body.choices) && isRecord(body.choices[0])) {
    const choice = body.choices[0] as DeepSeekChoice;
    if (typeof choice.message?.content === "string" && choice.message.content.trim()) {
      return choice.message.content;
    }
  }
  return undefined;
};

const structuredInstructions = (
  request: LlmGenerateRequest,
  retryIssues?: readonly JsonSchemaValidationIssue[],
): string => {
  if (!request.structuredOutput) return request.systemInstructions;
  const correction = retryIssues === undefined ? "" : `

CORRECCIÓN OBLIGATORIA — INTENTO FINAL 2/2:
La respuesta anterior fue descartada y no debes repararla parcialmente. Devuelve de nuevo el objeto JSON completo.
Errores estructurales detectados (no contienen valores de la respuesta):
${validationSummary(retryIssues)}
Corrige exactamente esas rutas y vuelve a incluir el schema completo.`;
  return `${request.systemInstructions}

CONTRATO DE SALIDA JSON ESTRICTO:
- Devuelve únicamente un objeto JSON raíz válido, sin markdown, fences ni prosa adicional.
- Incluye todas las propiedades declaradas en required, en cada nivel del schema.
- Respeta exactamente los tipos JSON indicados: objetos, arrays, strings, números y booleanos no son intercambiables.
- No sustituyas el objeto raíz por un array ni uses null para un campo requerido.
- No omitas campos requeridos; usa arrays vacíos solo cuando el schema los permita.
- No uses placeholders como TBD, pendiente, sin completar, null o texto equivalente.
- No inventes afirmaciones, resultados, cifras, credenciales ni características para rellenar el contrato.${correction}
EJEMPLO DE FORMA DEL OBJETO RAÍZ (solo ilustra campos y tipos; reemplaza todos sus valores con la respuesta solicitada):
${JSON.stringify(jsonShapeExample(request.structuredOutput.jsonSchema))}
JSON Schema completo:
${JSON.stringify(request.structuredOutput.jsonSchema)}`;
};

/** Maps transport failures without leaking request or credential material. */
function deepSeekTransportError(error: unknown): IntegrationError {
  if (error instanceof IntegrationError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new IntegrationError("timeout", "DeepSeek no respondió dentro del tiempo permitido.", { retryable: true, cause: error });
  }
  return new IntegrationError("transport_error", "No se pudo conectar con DeepSeek.", { retryable: true, cause: error });
}

/**
 * Maps the documented DeepSeek HTTP error codes (400, 401, 402, 422, 429, 500,
 * 503) to granular categories using only the status and the provider error
 * code; the remote message body is never propagated.
 */
function deepSeekHttpError(status: number, remoteCode?: string): IntegrationError {
  const code = remoteCode?.toLowerCase() ?? "";
  if (code.includes("model")) {
    return new IntegrationError("unsupported_model", `DeepSeek rechazó el modelo solicitado (HTTP ${status}).`, { status });
  }
  if (status === 401 || status === 403) {
    return new IntegrationError("http_auth_error", "DeepSeek rechazó las credenciales configuradas.", { status });
  }
  if (status === 402 || code.includes("insufficient_balance")) {
    return new IntegrationError("http_balance_error", "DeepSeek informó saldo insuficiente para la cuenta.", { status });
  }
  if (status === 429) {
    return new IntegrationError("http_rate_limit", "DeepSeek limitó temporalmente las solicitudes.", { status, retryable: true });
  }
  return new IntegrationError("http_provider_error", `DeepSeek respondió con HTTP ${status}.`, { status, retryable: status >= 500 });
}

/** Server-only OpenAI-compatible client for structured module generation. */
export class DeepSeekProvider implements LlmProvider {
  readonly name = "deepseek";
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly thinking: DeepSeekThinkingMode | undefined;

  constructor(options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = validationFetch("deepseek", options.fetch ?? globalThis.fetch);
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.endpoint = options.endpoint ?? "https://api.deepseek.com/chat/completions";
    this.thinking = options.thinking;
    const model = canonicalModel(options.model ?? DEEPSEEK_DEFAULT_MODEL) || DEEPSEEK_DEFAULT_MODEL;
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
    const model = canonicalModel(request.model) || this.model;
    assertAllowedModel(model);
    try {
      return await this.generateOnce<TOutput>(request, model, 1);
    } catch (error) {
      const firstAttemptIssues = invalidSchemaIssues(error);
      if (!firstAttemptIssues?.length
        || !request.structuredOutput
        || request.structuredOutput.retryOnInvalidSchema === false
      ) throw error;
      const result = await this.generateStructuredResponseOnce<TOutput>(request, model, 2, firstAttemptIssues);
      return {
        ...result,
        structuredOutputDiagnostics: {
          attemptCount: 2,
          recoveredAfterInvalidSchema: true,
          firstAttemptIssues,
        },
      };
    }
  }

  private async generateOnce<TOutput>(
    request: LlmGenerateRequest,
    model: string,
    attemptCount: number,
    retryIssues?: readonly JsonSchemaValidationIssue[],
  ): Promise<LlmGenerateResult<TOutput>> {
    const systemInstructions = structuredInstructions(request, retryIssues);
    const { body } = await withIntegrationTimeout<{ body: DeepSeekResponse }>("DeepSeek", this.timeoutMs, async signal => {
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
              { role: "system", content: systemInstructions },
              { role: "user", content: request.input },
            ],
            stream: false,
            ...(this.thinking === undefined ? {} : { thinking: { type: this.thinking } }),
            ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
            ...(request.structuredOutput ? { response_format: { type: "json_object" } } : {}),
          }),
          signal,
        });
      } catch (error) {
        throw deepSeekTransportError(error);
      }
      if (!response.ok) throw deepSeekHttpError(response.status, await readErrorType(response));

      let body: DeepSeekResponse;
      try {
        body = await response.json() as DeepSeekResponse;
      } catch (error) {
        throw new IntegrationError("non_json_response", "DeepSeek devolvió una respuesta que no es JSON.", { cause: error });
      }
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new IntegrationError("invalid_schema", "DeepSeek devolvió una respuesta JSON que no es un objeto.");
      }
      return { response, body };
    });
    if (!Array.isArray(body.choices) || !isRecord(body.choices[0])) {
      throw new IntegrationError("invalid_schema", "DeepSeek no devolvió el arreglo de choices documentado.");
    }
    const choice = body.choices[0] as DeepSeekChoice;
    const finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : undefined;
    const text = choice.message?.content;
    // `content` is documented as nullable: in thinking mode the chain of thought
    // consumes the same completion budget, so a small max_tokens can return
    // HTTP 200 with finish_reason=length and no final answer.
    if (typeof text !== "string" || !text.trim()) {
      throw new IntegrationError(
        "empty_completion",
        `DeepSeek no devolvió texto de salida (finish_reason=${finishReason ?? "desconocido"}).`,
      );
    }
    let output: unknown = text;
    if (request.structuredOutput) {
      output = parseStructuredJson(text);
      if (output === undefined) {
        if (finishReason === "length") {
          throw new IntegrationError(
            "quota_exceeded",
            "DeepSeek truncó la salida al alcanzar el límite de tokens (finish_reason=length).",
          );
        }
        throw invalidStructuredOutput([{ path: "$", expected: "valid JSON object", actual: "non-JSON text" }], attemptCount);
      }
      const validationIssues = validateJsonSchema(request.structuredOutput.jsonSchema, output);
      if (validationIssues.length > 0) throw invalidStructuredOutput(validationIssues, attemptCount);
    }
    const inputTokens = number(body.usage?.prompt_tokens);
    const outputTokens = number(body.usage?.completion_tokens);
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
      ...(request.structuredOutput ? {
        structuredOutputDiagnostics: {
          attemptCount,
          recoveredAfterInvalidSchema: false,
        },
      } : {}),
    };
  }

  /**
   * The corrective pass uses DeepSeek Responses JSON Schema mode instead of
   * repeating Chat JSON mode. This is the API's schema-constrained path and
   * is only reached after the first structured response was unusable.
   */
  private async generateStructuredResponseOnce<TOutput>(
    request: LlmGenerateRequest,
    model: string,
    attemptCount: number,
    retryIssues: readonly JsonSchemaValidationIssue[],
  ): Promise<LlmGenerateResult<TOutput>> {
    const structuredOutput = request.structuredOutput;
    if (!structuredOutput) throw new Error("DeepSeek structured retry requires an output contract.");
    const responseEndpoint = this.endpoint.endsWith("/chat/completions")
      ? `${this.endpoint.slice(0, -"/chat/completions".length)}/responses`
      : "https://api.deepseek.com/responses";
    const { body } = await withIntegrationTimeout<{ body: DeepSeekResponseApiBody }>("DeepSeek", this.timeoutMs, async signal => {
      let response: Response;
      try {
        response = await this.fetchFn(responseEndpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            instructions: structuredInstructions(request, retryIssues),
            input: request.input,
            reasoning: { effort: "none" },
            stream: false,
            ...(request.maxOutputTokens === undefined ? {} : { max_output_tokens: request.maxOutputTokens }),
            text: {
              format: {
                type: "json_schema",
                name: structuredOutput.name,
                schema: structuredOutput.jsonSchema,
              },
            },
          }),
          signal,
        });
      } catch (error) {
        throw deepSeekTransportError(error);
      }
      if (!response.ok) throw deepSeekHttpError(response.status, await readErrorType(response));
      let body: DeepSeekResponseApiBody;
      try {
        body = await response.json() as DeepSeekResponseApiBody;
      } catch (error) {
        throw new IntegrationError("non_json_response", "DeepSeek devolvió una respuesta que no es JSON.", { cause: error });
      }
      if (!isRecord(body)) throw new IntegrationError("invalid_schema", "DeepSeek devolvió una respuesta JSON que no es un objeto.");
      return { body: body as DeepSeekResponseApiBody };
    });
    const incompleteReason = typeof body.incomplete_details?.reason === "string"
      ? body.incomplete_details.reason
      : undefined;
    if (body.status === "incomplete" && incompleteReason === "max_output_tokens") {
      throw new IntegrationError(
        "quota_exceeded",
        "DeepSeek truncó la salida en el reintento estructurado al alcanzar max_output_tokens.",
      );
    }
    const text = responseApiText(body);
    if (typeof text !== "string") {
      throw new IntegrationError("empty_completion", "DeepSeek no devolvió texto en el reintento estructurado.");
    }
    const output = parseStructuredJson(text);
    if (output === undefined) {
      throw invalidStructuredOutput([{ path: "$", expected: "valid JSON object", actual: "non-JSON text" }], attemptCount);
    }
    const validationIssues = validateJsonSchema(structuredOutput.jsonSchema, output);
    if (validationIssues.length > 0) throw invalidStructuredOutput(validationIssues, attemptCount);
    const inputTokens = number(body.usage?.input_tokens);
    const outputTokens = number(body.usage?.output_tokens);
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
      ...(typeof body.status === "string" ? { finishReason: body.status } : {}),
      structuredOutputDiagnostics: {
        attemptCount,
        recoveredAfterInvalidSchema: false,
      },
    };
  }
}
import { validationFetch } from "../services/validation-session.js";
