export interface WebDiscoveryResult {
  readonly id?: string;
  readonly url?: string;
  readonly title?: string;
  readonly text?: string;
  readonly snippet?: string;
  readonly publishedAt?: string;
}

export interface WebDiscoveryMetadata {
  readonly status: number;
  readonly resultCount: number;
  readonly usage?: number;
  readonly credits?: number;
  /** Present only when the provider response gives an explicit monetary cost. */
  readonly estimatedCost?: number;
  readonly rateLimitRemaining?: number;
  readonly rateLimitLimit?: number;
}

export interface WebDiscoveryResponse {
  readonly results: readonly WebDiscoveryResult[];
  readonly metadata: WebDiscoveryMetadata;
}

export interface WebDiscoveryProvider {
  readonly name: string;
  readonly configured: boolean;
  discover(query: string, options?: { readonly maxResults?: number }): Promise<WebDiscoveryResponse>;
}

const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

/** Keeps provider discovery payloads bounded without interpreting their meaning. */
export function boundedDiscoveryText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  if (!normalized || CONTROL_CHARACTER.test(normalized)) return undefined;
  return normalized.slice(0, maxLength);
}

export function discoveryResult(value: unknown): WebDiscoveryResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const id = boundedDiscoveryText(input.id, 500);
  const url = boundedDiscoveryText(input.url, 2_048);
  const title = boundedDiscoveryText(input.title, 500);
  const text = boundedDiscoveryText(input.text ?? input.content ?? input.markdown, 10_000);
  const snippet = boundedDiscoveryText(input.snippet ?? input.description, 4_000);
  const publishedAt = boundedDiscoveryText(input.publishedAt ?? input.published_date ?? input.publishedDate, 500);
  return {
    ...(id === undefined ? {} : { id }),
    ...(url === undefined ? {} : { url }),
    ...(title === undefined ? {} : { title }),
    ...(text === undefined ? {} : { text }),
    ...(snippet === undefined ? {} : { snippet }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
  };
}
