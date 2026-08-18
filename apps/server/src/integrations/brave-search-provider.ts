import {
  IntegrationError,
  httpIntegrationError,
  normalizeFetchError,
  readErrorType,
} from "./integration-error.js";
import {
  discoveryResult,
  type WebDiscoveryResponse,
} from "./web-discovery.js";

export interface BraveSearchProviderOptions {
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly endpoint?: string;
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

/** Server-only Brave Search client for bounded web discovery. */
export class BraveSearchProvider {
  readonly name = "brave";
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(options: BraveSearchProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.endpoint = options.endpoint ?? "https://api.search.brave.com/res/v1/web/search";
  }

  get configured(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
  }

  async discover(query: string, options: { readonly maxResults?: number } = {}): Promise<WebDiscoveryResponse> {
    if (!this.configured) throw new IntegrationError("missing_api_key", "Brave Search no está configurado.");
    const maxResults = Math.min(5, Math.max(1, Math.floor(options.maxResults ?? 5)));
    const url = new URL(this.endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(maxResults));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "GET",
        headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey! },
        signal: controller.signal,
      });
    } catch (error) {
      throw normalizeFetchError(error, "Brave Search");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw httpIntegrationError("Brave Search", response.status, await readErrorType(response));

    let body: Record<string, unknown>;
    try {
      body = await response.json() as Record<string, unknown>;
    } catch (error) {
      throw new IntegrationError("invalid_response", "Brave Search devolvió una respuesta que no es JSON.", { cause: error });
    }
    const web = record(body.web);
    const rawResults = Array.isArray(web?.results) ? web.results : [];
    const usage = numeric(body.usage);
    const rateLimitRemaining = headerNumber(response.headers, ["x-ratelimit-remaining", "ratelimit-remaining"]);
    const rateLimitLimit = headerNumber(response.headers, ["x-ratelimit-limit", "ratelimit-limit"]);
    return {
      results: rawResults.slice(0, maxResults).map(discoveryResult),
      metadata: {
        status: response.status,
        resultCount: Math.min(rawResults.length, maxResults),
        ...(usage === undefined ? {} : { usage }),
        ...(rateLimitRemaining === undefined ? {} : { rateLimitRemaining }),
        ...(rateLimitLimit === undefined ? {} : { rateLimitLimit }),
      },
    };
  }
}
