import {
  IntegrationError,
  httpIntegrationError,
  normalizeFetchError,
  readErrorType,
} from "./integration-error.js";

export interface ExaProviderOptions {
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly endpoint?: string;
}

export interface ExaSearchMetadata {
  readonly status: number;
  readonly resultCount: number;
  readonly usage?: number;
  readonly rateLimitRemaining?: number;
  readonly rateLimitLimit?: number;
}

const numeric = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
const headerNumber = (headers: Headers, names: readonly string[]): number | undefined => {
  for (const name of names) {
    const value = headers.get(name);
    if (value === null) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

/** Server-only Exa semantic search client returning bounded connectivity metadata only. */
export class ExaProvider {
  readonly name = "exa";
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(options: ExaProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.endpoint = options.endpoint ?? "https://api.exa.ai/search";
  }

  get configured(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
  }

  async search(query: string, options: { readonly maxResults?: number } = {}): Promise<ExaSearchMetadata> {
    const apiKey = this.apiKey;
    if (!apiKey?.trim()) throw new IntegrationError("missing_api_key", "Exa no está configurado.");
    const maxResults = Math.min(3, Math.max(1, Math.floor(options.maxResults ?? 3)));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ query, type: "auto", numResults: maxResults }),
        signal: controller.signal,
      });
    } catch (error) {
      throw normalizeFetchError(error, "Exa");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw httpIntegrationError("Exa", response.status, await readErrorType(response));

    let body: Record<string, unknown>;
    try {
      body = await response.json() as Record<string, unknown>;
    } catch (error) {
      throw new IntegrationError("invalid_response", "Exa devolvió una respuesta que no es JSON.", { cause: error });
    }
    const rateLimit = record(body.rateLimit) ?? record(body.rate_limit);
    const usage = numeric(body.costDollars) ?? numeric(body.usage);
    const rateLimitRemaining = numeric(rateLimit?.remaining)
      ?? headerNumber(response.headers, ["x-ratelimit-remaining", "ratelimit-remaining"]);
    const rateLimitLimit = numeric(rateLimit?.limit)
      ?? headerNumber(response.headers, ["x-ratelimit-limit", "ratelimit-limit"]);
    return {
      status: response.status,
      resultCount: Math.min(Array.isArray(body.results) ? body.results.length : 0, maxResults),
      ...(usage === undefined ? {} : { usage }),
      ...(rateLimitRemaining === undefined ? {} : { rateLimitRemaining }),
      ...(rateLimitLimit === undefined ? {} : { rateLimitLimit }),
    };
  }
}
