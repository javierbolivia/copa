import { withIntegrationTimeout } from "./request-timeout.js";
import type { LlmGenerateRequest, LlmGenerateResult, LlmProvider } from "@our-platform/shared";
import { IntegrationError, normalizeFetchError } from "./integration-error.js";
import { matchesJsonSchema, parseStructuredJson } from "./structured-output.js";

export interface GeminiProviderOptions { readonly apiKey?: string; readonly fetch?: typeof fetch; readonly timeoutMs?: number; readonly endpoint?: string; }
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const GEMINI_TYPES: Readonly<Record<string, string>> = { string: "STRING", number: "NUMBER", integer: "INTEGER", boolean: "BOOLEAN", object: "OBJECT", array: "ARRAY" };

/** Convert the app's JSON Schema subset to the Schema format accepted by generateContent. */
export function toGeminiResponseSchema(schema: unknown): Record<string, unknown> {
  if (!isRecord(schema)) return {};
  const converted: Record<string, unknown> = {};
  if (typeof schema.type === "string" && GEMINI_TYPES[schema.type]) converted.type = GEMINI_TYPES[schema.type];
  if (typeof schema.description === "string") converted.description = schema.description;
  if (typeof schema.title === "string") converted.title = schema.title;
  if (Array.isArray(schema.required)) converted.required = schema.required.filter((item): item is string => typeof item === "string");
  if (Array.isArray(schema.enum)) converted.enum = schema.enum.filter((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
  if (typeof schema.minimum === "number") converted.minimum = schema.minimum;
  if (typeof schema.maximum === "number") converted.maximum = schema.maximum;
  if (isRecord(schema.properties)) converted.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, toGeminiResponseSchema(value)]));
  if (schema.items !== undefined) converted.items = toGeminiResponseSchema(schema.items);
  return converted;
}

function safeGoogleMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/([?&]key=)[^&\s]+/giu, "$1[redacted]").replace(/AIza[\w-]{20,}/gu, "[redacted]").replace(/\s+/gu, " ").trim().slice(0, 500) || undefined;
}

export interface GeminiResponseDiagnostics {
  readonly httpStatus: number;
  readonly candidateCount: number;
  readonly blockReason?: string;
  readonly finishReason?: string;
  readonly responseId?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

/** A safe, structured failure for HTTP-accepted Gemini responses without usable output. */
export class GeminiResponseError extends IntegrationError {
  constructor(message: string, readonly diagnostics: GeminiResponseDiagnostics) {
    super("invalid_response", message, { status: diagnostics.httpStatus, retryable: false });
  }
}

function responseDiagnostics(body: Record<string, unknown>, httpStatus = 200): GeminiResponseDiagnostics {
  const promptFeedback = isRecord(body.promptFeedback) ? body.promptFeedback : undefined;
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const first = isRecord(candidates[0]) ? candidates[0] : undefined;
  const usage = isRecord(body.usageMetadata) ? body.usageMetadata : undefined;
  const inputTokens = number(usage?.promptTokenCount);
  const outputTokens = number(usage?.candidatesTokenCount);
  return {
    httpStatus,
    candidateCount: candidates.length,
    ...(promptFeedback && typeof promptFeedback.blockReason === "string" ? { blockReason: promptFeedback.blockReason } : {}),
    ...(first && typeof first.finishReason === "string" ? { finishReason: first.finishReason } : {}),
    ...(typeof body.responseId === "string" ? { responseId: body.responseId } : {}),
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

function noCandidateDiagnostic(body: Record<string, unknown>): string | undefined {
  const promptFeedback = isRecord(body.promptFeedback) ? body.promptFeedback : undefined;
  const blockReason = promptFeedback && typeof promptFeedback.blockReason === "string" ? promptFeedback.blockReason : undefined;
  if (blockReason) return `Motivo: ${blockReason}.`;
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const firstCandidate = isRecord(candidates[0]) ? candidates[0] : undefined;
  const finishReason = firstCandidate && typeof firstCandidate.finishReason === "string" ? firstCandidate.finishReason : undefined;
  return finishReason ? `Finalización: ${finishReason}.` : undefined;
}

async function geminiHttpError(response: Response): Promise<IntegrationError> {
  let status: string | undefined, message: string | undefined;
  try {
    const body = await response.json() as unknown;
    if (isRecord(body) && isRecord(body.error)) {
      status = typeof body.error.status === "string" ? body.error.status : undefined;
      message = safeGoogleMessage(body.error.message);
    }
  } catch { /* Preserve the HTTP status when Google returns a non-JSON error. */ }
  const prefix = status ? `Gemini ${status}` : `Gemini respondió con HTTP ${response.status}`;
  if (response.status === 429) return new IntegrationError("rate_limited", message ? `${prefix}: ${message}` : `${prefix}.`, { status: 429, retryable: true });
  return new IntegrationError("http_error", message ? `${prefix}: ${message}` : `${prefix}.`, { status: response.status, retryable: response.status === 503 });
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = validationFetch("gemini", options.fetch ?? globalThis.fetch);
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.endpoint = options.endpoint ?? "https://generativelanguage.googleapis.com/v1beta/models";
  }

  get configured(): boolean { return typeof this.apiKey === "string" && this.apiKey.trim().length > 0; }

  async generate<TOutput = string>(request: LlmGenerateRequest): Promise<LlmGenerateResult<TOutput>> {
    if (!this.configured) throw new IntegrationError("missing_api_key", "Gemini no está configurado.");
    const generationConfig: Record<string, unknown> = { ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }) };
    if (request.structuredOutput) Object.assign(generationConfig, { responseMimeType: "application/json", responseSchema: toGeminiResponseSchema(request.structuredOutput.jsonSchema) });
    const { body } = await withIntegrationTimeout("Gemini", this.timeoutMs, async signal => {
      let response: Response;
      try {
        response = await this.fetchFn(`${this.endpoint}/${encodeURIComponent(request.model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey! },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.systemInstructions }] },
            contents: [{ role: "user", parts: [{ text: request.input }] }],
            generationConfig,
          }),
          signal,
        });
      } catch (error) { throw normalizeFetchError(error, "Gemini"); }
      if (!response.ok) throw await geminiHttpError(response);
      let body: Record<string, unknown>;
      try { body = await response.json() as Record<string, unknown>; } catch (error) { throw new IntegrationError("invalid_response", "Gemini devolvió una respuesta que no es JSON.", { cause: error }); }
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new IntegrationError("invalid_response", "Gemini devolvió una respuesta JSON que no es un objeto.");
      }
      return { response, body };
    });
    const candidates = body.candidates;
    const diagnostics = responseDiagnostics(body);
    if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== "object") {
      throw new GeminiResponseError(`Gemini no devolvió candidatos.${noCandidateDiagnostic(body) ? ` ${noCandidateDiagnostic(body)}` : ""}`, diagnostics);
    }
    const parts = (candidates[0] as { content?: { parts?: Array<{ text?: unknown }> } }).content?.parts;
    const text = Array.isArray(parts) ? parts.map((part) => typeof part.text === "string" ? part.text : "").join("\n") : "";
    if (!text.trim()) throw new GeminiResponseError("Gemini no devolvió texto.", diagnostics);
    let output: unknown = text;
    if (request.structuredOutput) {
      output=parseStructuredJson(text);
      if(output===undefined)throw new IntegrationError("schema_mismatch", "La salida estructurada de Gemini no contiene JSON válido.");
      if(!matchesJsonSchema(request.structuredOutput.jsonSchema,output))throw new IntegrationError("schema_mismatch", "La salida estructurada de Gemini no cumple el schema solicitado.");
    }
    const usage = body.usageMetadata as { promptTokenCount?: unknown; candidatesTokenCount?: unknown } | undefined, inputTokens = number(usage?.promptTokenCount), outputTokens = number(usage?.candidatesTokenCount);
    return { provider: this.name, requestedModel: request.model, reportedModel: request.model, output: output as TOutput, usage: { ...(inputTokens === undefined ? {} : { inputTokens }), ...(outputTokens === undefined ? {} : { outputTokens }), usageKind: usage ? "provider_reported" : "unknown" }, ...(diagnostics.finishReason ? { finishReason: diagnostics.finishReason } : {}), providerDiagnostics: { ...diagnostics } };
  }
}
import { validationFetch } from "../services/validation-session.js";
export const GEMINI_ANALYSIS_MODEL = "gemini-3.5-flash-lite";
