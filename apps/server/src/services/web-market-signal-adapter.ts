import type { NormalizedMarketSignal } from "@our-platform/shared";
import type { WebDiscoveryResult } from "../integrations/web-discovery.js";
import { normalizeMarketSignal } from "./market-signal-normalizer.js";

const WEB_SIGNAL_TEXT_MAX_LENGTH = 1_500;
const WEB_SIGNAL_CONTEXT_MAX_LENGTH = 2_000;

export interface WebMarketSignalAdapterInput {
  readonly provider: string;
  readonly query: string;
  /** Retrieval time supplied by the caller so this adapter remains pure. */
  readonly retrievedAt: string;
  readonly results: readonly WebDiscoveryResult[];
}

export interface WebMarketSignalRejection {
  readonly index: number;
  readonly id: string | null;
  readonly url: string | null;
  readonly reason: string;
}

export interface WebMarketSignalAdaptation {
  readonly signals: readonly NormalizedMarketSignal[];
  readonly rejected: readonly WebMarketSignalRejection[];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function bounded(value: string | null, maxLength: number): string | null {
  return value === null ? null : value.normalize("NFC").replace(/\r\n?/gu, "\n").trim().slice(0, maxLength);
}

function boundedContext(provider: string, result: Record<string, unknown>, id: string | null, url: string | null): string {
  const context = JSON.stringify({
    provider: bounded(provider, 128),
    discovery: {
      id: bounded(id, 128),
      url: bounded(url, 512),
      title: bounded(stringOrNull(result.title), 200),
      snippet: bounded(stringOrNull(result.snippet), 500),
      publishedAt: bounded(stringOrNull(result.publishedAt), 128),
    },
  });
  if (context.length <= WEB_SIGNAL_CONTEXT_MAX_LENGTH) return context;
  return JSON.stringify({
    provider: bounded(provider, 64),
    discovery: { id: bounded(id, 64), url: bounded(url, 128) },
  });
}

/**
 * Pure boundary from bounded web-discovery DTOs to auditable transient signals.
 * Web text is capped at 1,500 characters before normalisation and context is a
 * safe, bounded metadata envelope; semantic fields remain null.
 */
export function adaptWebDiscoveryMarketSignals(input: Readonly<WebMarketSignalAdapterInput>): WebMarketSignalAdaptation {
  const signals: NormalizedMarketSignal[] = [];
  const rejected: WebMarketSignalRejection[] = [];
  const results = Array.isArray(input.results) ? input.results : [];

  for (const [index, result] of results.entries()) {
    const raw = result as Record<string, unknown>;
    const id = stringOrNull(raw.id);
    const url = stringOrNull(raw.url);
    try {
      const text = stringOrNull(raw.text) ?? stringOrNull(raw.snippet) ?? stringOrNull(raw.title);
      if (text === null) throw new Error("web discovery result requires text, snippet, or title");
      const sourceId = id === null ? null : `${input.provider}:${id}`;
      const context = boundedContext(input.provider, raw, id, url);
      signals.push(normalizeMarketSignal({
        source: "web",
        sourceId,
        url,
        query: input.query,
        capturedAt: input.retrievedAt,
        text: bounded(text, WEB_SIGNAL_TEXT_MAX_LENGTH),
        engagement: {},
        context,
        pain: null,
        desiredOutcome: null,
        failedAttempt: null,
        currentSolution: null,
        solutionComplaint: null,
        urgency: null,
        specificity: null,
        commercialIntent: null,
        provenance: {
          provider: input.provider,
          source: "web",
          sourceId,
          url,
          query: input.query,
          capturedAt: input.retrievedAt,
          normalizationVersion: "web-discovery/raw-v1",
        },
      }));
    } catch (error) {
      rejected.push({
        index,
        id,
        url,
        reason: error instanceof Error ? error.message : "web discovery market signal normalization failed",
      });
    }
  }
  return { signals, rejected };
}
