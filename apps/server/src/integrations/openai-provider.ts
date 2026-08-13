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
      if (!(error instanceof IntegrationError) || error.code !== "schema_mismatch" || !request.structuredOutput) throw error;
      return this.requestOnce<TOutput>({
        ...request,
        input: `${request.input}\n\nREPARACION DE FORMATO (unico reintento): la respuesta anterior no cumplio el JSON Schema. Devuelve solamente un objeto JSON valido que cumpla exactamente el schema solicitado. No agregues markdown ni comentarios.`,
      });
    }
  }

  private async requestOnce<TOutput>(request: LlmGenerateRequest): Promise<LlmGenerateResult<TOutput>> {
    if (!this.configured) throw new IntegrationError("missing_api_key", "OpenAI no está configurado.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
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
        signal: controller.signal,
      });
    } catch (error) {
      throw normalizeFetchError(error, "OpenAI");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw httpIntegrationError("OpenAI", response.status, await readErrorType(response));

    let body: OpenAIResponse;
    try {
      body = await response.json() as OpenAIResponse;
    } catch (error) {
      throw new IntegrationError("invalid_response", "OpenAI devolvió una respuesta que no es JSON.", { cause: error });
    }
    const outputText = extractOutputText(body.output);
    if (outputText === undefined) {
      throw new IntegrationError("invalid_response", "OpenAI no devolvió texto de salida.");
    }

    let output: unknown = outputText;
    if (request.structuredOutput) {
      try {
        output = JSON.parse(outputText);
      } catch (error) {
        throw new IntegrationError("schema_mismatch", "La salida estructurada de OpenAI no contiene JSON válido.", { cause: error });
      }
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

function matchesJsonSchema(schema:Readonly<Record<string,unknown>>,value:unknown):boolean{
  if(Array.isArray(schema.enum)&&!schema.enum.some(item=>Object.is(item,value)))return false;
  if("const" in schema&&!Object.is(schema.const,value))return false;
  const type=schema.type;
  if(Array.isArray(type))return type.some(candidate=>matchesJsonSchema({...schema,type:candidate},value));
  if(type==="null")return value===null;
  if(type==="string")return typeof value==="string";
  if(type==="boolean")return typeof value==="boolean";
  if(type==="number")return typeof value==="number"&&Number.isFinite(value);
  if(type==="integer")return typeof value==="number"&&Number.isInteger(value);
  if(type==="array")return Array.isArray(value)&&value.every(item=>matchesJsonSchema((schema.items??{}) as Readonly<Record<string,unknown>>,item));
  if(type==="object"||schema.properties){
    if(typeof value!=="object"||value===null||Array.isArray(value))return false;
    const record=value as Record<string,unknown>,properties=(schema.properties??{}) as Record<string,Readonly<Record<string,unknown>>>;
    if(Array.isArray(schema.required)&&schema.required.some(key=>typeof key==="string"&&!(key in record)))return false;
    if(schema.additionalProperties===false&&Object.keys(record).some(key=>!(key in properties)))return false;
    return Object.entries(properties).every(([key,child])=>!(key in record)||matchesJsonSchema(child,record[key]));
  }
  return true;
}
