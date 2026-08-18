import {
  MARKET_SIGNAL_NORMALIZATION_VERSION,
  MARKET_SIGNAL_SOURCES,
  MarketSignalProvenanceSchema,
  MarketSignalSchema,
  type MarketSignal,
  type MarketSignalAdapter,
  type MarketSignalSource,
} from "@our-platform/shared";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it, vi } from "vitest";
import { MarketSignalNormalizationError, normalizeMarketSignal } from "../src/services/market-signal-normalizer.js";

function signal(source: MarketSignalSource = "youtube"): MarketSignal {
  return {
    source,
    sourceId: " video-123 ",
    url: "HTTPS://Example.COM:443/watch?b=2&a=1#comment",
    query: "  creator tools  ",
    capturedAt: "2026-02-03T04:05:06+00:00",
    text: "  I need a faster workflow.\r\nThe current tool is too slow.  ",
    engagement: { Likes: 3, views: 10 },
    context: "  top-level comment  ",
    pain: null,
    desiredOutcome: null,
    failedAttempt: null,
    currentSolution: null,
    solutionComplaint: null,
    urgency: null,
    specificity: null,
    commercialIntent: null,
    provenance: {
      provider: "youtube-data-api",
      source,
      sourceId: " video-123 ",
      url: "HTTPS://Example.COM:443/watch?b=2&a=1#comment",
      query: "  creator tools  ",
      capturedAt: "2026-02-03T04:05:06+00:00",
      normalizationVersion: "upstream/raw-v0",
    },
  };
}

describe("MarketSignal normalization", () => {
  it("accepts every extensible source vocabulary value", () => {
    for (const source of MARKET_SIGNAL_SOURCES) {
      expect(normalizeMarketSignal(signal(source)).source).toBe(source);
    }
  });

  it("is deterministic, canonicalizes bounded text/URLs/collections, and does not mutate input", () => {
    const input = signal();
    const original = structuredClone(input);

    const first = normalizeMarketSignal(input);
    const second = normalizeMarketSignal(input);

    expect(first).toEqual(second);
    expect(input).toEqual(original);
    expect(first).toMatchObject({
      url: "https://example.com/watch?a=1&b=2",
      query: "creator tools",
      capturedAt: "2026-02-03T04:05:06.000Z",
      text: "I need a faster workflow.\nThe current tool is too slow.",
      engagement: { likes: 3, views: 10 },
      context: "top-level comment",
    });
  });

  it("preserves auditable provenance after canonicalization and stamps the normalizer version", () => {
    const normalized = normalizeMarketSignal(signal("review"));

    expect(normalized.provenance).toEqual({
      provider: "youtube-data-api",
      source: "review",
      sourceId: "video-123",
      url: "https://example.com/watch?a=1&b=2",
      query: "creator tools",
      capturedAt: "2026-02-03T04:05:06.000Z",
      normalizationVersion: MARKET_SIGNAL_NORMALIZATION_VERSION,
    });
  });

  it("rejects public signal and provenance contracts with no auditable identity", () => {
    const withoutIdentity = structuredClone(signal()) as Record<string, unknown>;
    withoutIdentity.sourceId = null;
    withoutIdentity.url = null;
    (withoutIdentity.provenance as Record<string, unknown>).sourceId = null;
    (withoutIdentity.provenance as Record<string, unknown>).url = null;

    expect(Value.Check(MarketSignalSchema, withoutIdentity)).toBe(false);
    expect(Value.Check(MarketSignalProvenanceSchema, withoutIdentity.provenance)).toBe(false);
    expect(() => normalizeMarketSignal(withoutIdentity)).toThrow(/requires sourceId or url/);
  });

  it("rejects impossible calendar, time, and offset values for signal and provenance capture times", () => {
    for (const timestamp of [
      "2025-02-30T04:05:06Z",
      "2026-02-03T24:05:06Z",
      "2026-02-03T04:60:06Z",
      "2026-02-03T04:05:60Z",
      "2026-02-03T04:05:06+24:00",
      "2026-02-03T04:05:06+14:60",
    ]) {
      const invalidSignal = signal();
      invalidSignal.capturedAt = timestamp;
      invalidSignal.provenance.capturedAt = timestamp;
      expect(() => normalizeMarketSignal(invalidSignal)).toThrow(/valid/);

      const invalidProvenance = signal();
      invalidProvenance.provenance.capturedAt = timestamp;
      expect(() => normalizeMarketSignal(invalidProvenance)).toThrow(/valid/);
    }
  });

  it("uses explicit ordinal ordering for punctuation-bearing engagement keys", () => {
    const input = signal();
    input.engagement = { "metric_": 1, "metric.": 2, "metric-": 3 };

    expect(Object.keys(normalizeMarketSignal(input).engagement)).toEqual(["metric-", "metric.", "metric_"]);
  });

  it("rejects unsafe text/URLs, missing provenance, and mismatched provenance before synthesis", () => {
    const unsafeText = signal();
    unsafeText.text = "unsafe\u0000text";
    expect(() => normalizeMarketSignal(unsafeText)).toThrow(MarketSignalNormalizationError);

    const unsafeUrl = signal();
    unsafeUrl.url = "javascript:alert(1)";
    unsafeUrl.provenance.url = "javascript:alert(1)";
    expect(() => normalizeMarketSignal(unsafeUrl)).toThrow(/HTTP\(S\)/);

    const missingProvenance = signal() as unknown as { provenance?: unknown };
    delete missingProvenance.provenance;
    expect(() => normalizeMarketSignal(missingProvenance)).toThrow(/provenance must be an object/);

    const mismatchedProvenance = signal();
    mismatchedProvenance.provenance.sourceId = "different-record";
    expect(() => normalizeMarketSignal(mismatchedProvenance)).toThrow(/provenance must match/);
  });

  it("keeps the adapter boundary limited to normalized signals and performs no integration or persistence", async () => {
    const collect = vi.fn(async () => [normalizeMarketSignal(signal("google"))]);
    const adapter: MarketSignalAdapter = { source: "google", collect };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = await adapter.collect({ query: "creator tools" });

    expect(adapter.source).toBe("google");
    expect(results).toHaveLength(1);
    expect(results[0]?.source).toBe("google");
    expect(Object.keys(adapter).sort()).toEqual(["collect", "source"]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not permit an adapter to expose a signal without a normalized auditable identity", () => {
    const withoutIdentity = structuredClone(signal("google"));
    withoutIdentity.sourceId = null;
    withoutIdentity.url = null;
    withoutIdentity.provenance.sourceId = null;
    withoutIdentity.provenance.url = null;

    // @ts-expect-error MarketSignalAdapter requires a normalizer-branded signal with valid identity.
    const adapter: MarketSignalAdapter = { source: "google", collect: async () => [withoutIdentity] };
    void adapter;
    expect(Value.Check(MarketSignalSchema, withoutIdentity)).toBe(false);
  });
});


  it("accepts the provider-neutral web discovery source", () => {
    const normalized = normalizeMarketSignal(signal("web"));
    expect(normalized.source).toBe("web");
    expect(normalized.provenance.source).toBe("web");
  });