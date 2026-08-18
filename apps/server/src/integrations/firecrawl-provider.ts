import {
  IntegrationError,
  httpIntegrationError,
  normalizeFetchError,
  readErrorType,
} from "./integration-error.js";

export interface FirecrawlProviderOptions {
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly endpoint?: string;
}

export interface FirecrawlSearchMetadata {
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
const resultCount = (body: Record<string, unknown>): number => {
  if (Array.isArray(body.data)) return body.data.length;
  const data = record(body.data);
  if (Array.isArray(data?.web)) return data.web.length;
  if (Array.isArray(body.results)) return body.results.length;
  return 0;
};

/** Server-only Firecrawl web search client returning bounded connectivity metadata only. */
export class FirecrawlProvider {
  readonly name = "firecrawl";
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(options: FirecrawlProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.endpoint = options.endpoint ?? "https://api.firecrawl.dev/v2/search";
  }

  get configured(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
  }

  async search(query: string, options: { readonly maxResults?: number } = {}): Promise<FirecrawlSearchMetadata> {
    if (!this.configured) throw new IntegrationError("missing_api_key", "Firecrawl no está configurado.");
    const maxResults = Math.min(3, Math.max(1, Math.floor(options.maxResults ?? 3)));
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
        body: JSON.stringify({ query, limit: maxResults, sources: ["web"] }),
        signal: controller.signal,
      });
    } catch (error) {
      throw normalizeFetchError(error, "Firecrawl");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw httpIntegrationError("Firecrawl", response.status, await readErrorType(response));

    let body: Record<string, unknown>;
    try {
      body = await response.json() as Record<string, unknown>;
    } catch (error) {
      throw new IntegrationError("invalid_response", "Firecrawl devolvió una respuesta que no es JSON.", { cause: error });
    }
    const rateLimit = record(body.rateLimit) ?? record(body.rate_limit);
    const usage = numeric(body.usage) ?? numeric(body.creditsUsed);
    const credits = numeric(body.credits);
    const rateLimitRemaining = numeric(rateLimit?.remaining)
      ?? headerNumber(response.headers, ["x-ratelimit-remaining", "ratelimit-remaining"]);
    const rateLimitLimit = numeric(rateLimit?.limit)
      ?? headerNumber(response.headers, ["x-ratelimit-limit", "ratelimit-limit"]);
    return {
      status: response.status,
      resultCount: Math.min(resultCount(body), maxResults),
      ...(usage === undefined ? {} : { usage }),
      ...(credits === undefined ? {} : { credits }),
      ...(rateLimitRemaining === undefined ? {} : { rateLimitRemaining }),
      ...(rateLimitLimit === undefined ? {} : { rateLimitLimit }),
    };
  }
}
