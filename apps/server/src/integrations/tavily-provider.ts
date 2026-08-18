import {
  IntegrationError,
  httpIntegrationError,
  normalizeFetchError,
  readErrorType,
} from "./integration-error.js";
import { discoveryResult, type WebDiscoveryResponse } from "./web-discovery.js";

export interface TavilyProviderOptions {
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly endpoint?: string;
}

export interface TavilySearchMetadata {
  readonly status: number;
  readonly resultCount: number;
  readonly usage?: number;
  readonly credits?: number;
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

/** Server-only Tavily client that returns bounded connectivity metadata only. */
export class TavilyProvider {
  readonly name = "tavily";
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(options: TavilyProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.endpoint = options.endpoint ?? "https://api.tavily.com/search";
  }

  get configured(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
  }

  async search(query: string, options: { readonly maxResults?: number } = {}): Promise<TavilySearchMetadata> {
    if (!this.configured) throw new IntegrationError("missing_api_key", "Tavily no está configurado.");
    const maxResults = Math.min(3, Math.max(1, Math.floor(options.maxResults ?? 3)));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          search_depth: "basic",
          max_results: maxResults,
          include_answer: false,
          include_raw_content: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw normalizeFetchError(error, "Tavily");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw httpIntegrationError("Tavily", response.status, await readErrorType(response));

    let body: Record<string, unknown>;
    try {
      body = await response.json() as Record<string, unknown>;
    } catch (error) {
      throw new IntegrationError("invalid_response", "Tavily devolvió una respuesta que no es JSON.", { cause: error });
    }
    const usage = record(body.usage);
    const rateLimit = record(body.rate_limit);
    const responseUsage = numeric(body.usage);
    const credits = numeric(body.credits) ?? numeric(usage?.credits);
    const rateLimitRemaining = numeric(rateLimit?.remaining)
      ?? headerNumber(response.headers, ["x-ratelimit-remaining", "ratelimit-remaining"]);
    const rateLimitLimit = numeric(rateLimit?.limit)
      ?? headerNumber(response.headers, ["x-ratelimit-limit", "ratelimit-limit"]);
    return {
      status: response.status,
      resultCount: Math.min(Array.isArray(body.results) ? body.results.length : 0, maxResults),
      ...(responseUsage === undefined ? {} : { usage: responseUsage }),
      ...(credits === undefined ? {} : { credits }),
      ...(rateLimitRemaining === undefined ? {} : { rateLimitRemaining }),
      ...(rateLimitLimit === undefined ? {} : { rateLimitLimit }),
    };
  }

  async discover(query: string, options: { readonly maxResults?: number } = {}): Promise<WebDiscoveryResponse> {
    if (!this.configured) throw new IntegrationError("missing_api_key", "Tavily no está configurado.");
    const maxResults = Math.min(5, Math.max(1, Math.floor(options.maxResults ?? 5)));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          search_depth: "basic",
          max_results: maxResults,
          include_answer: false,
          include_raw_content: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw normalizeFetchError(error, "Tavily");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw httpIntegrationError("Tavily", response.status, await readErrorType(response));
    let body: Record<string, unknown>;
    try {
      body = await response.json() as Record<string, unknown>;
    } catch (error) {
      throw new IntegrationError("invalid_response", "Tavily devolvió una respuesta que no es JSON.", { cause: error });
    }
    const usage = record(body.usage);
    const rateLimit = record(body.rate_limit);
    const rawResults = Array.isArray(body.results) ? body.results : [];
    const responseUsage = numeric(body.usage);
    const credits = numeric(body.credits) ?? numeric(usage?.credits);
    const rateLimitRemaining = numeric(rateLimit?.remaining)
      ?? headerNumber(response.headers, ["x-ratelimit-remaining", "ratelimit-remaining"]);
    const rateLimitLimit = numeric(rateLimit?.limit)
      ?? headerNumber(response.headers, ["x-ratelimit-limit", "ratelimit-limit"]);
    return {
      results: rawResults.slice(0, maxResults).map(discoveryResult),
      metadata: {
        status: response.status,
        resultCount: Math.min(rawResults.length, maxResults),
        ...(responseUsage === undefined ? {} : { usage: responseUsage }),
        ...(credits === undefined ? {} : { credits }),
        ...(rateLimitRemaining === undefined ? {} : { rateLimitRemaining }),
        ...(rateLimitLimit === undefined ? {} : { rateLimitLimit }),
      },
    };
  }
}
