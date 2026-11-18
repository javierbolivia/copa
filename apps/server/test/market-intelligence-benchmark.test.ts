import type { NormalizedMarketSignal } from "@our-platform/shared";
import { describe, expect, it, vi } from "vitest";

import { BraveSearchProvider } from "../src/integrations/brave-search-provider.js";
import { IntegrationError } from "../src/integrations/integration-error.js";
import { YouTubeAdapter } from "../src/integrations/youtube-adapter.js";
import {
  MARKET_BENCHMARK_BUDGETS,
  MARKET_BENCHMARK_PROVIDER_VERDICTS,
  runMarketIntelligenceBenchmark,
  type MarketBenchmarkAcquirer,
  type MarketBenchmarkAcquisition,
} from "../src/services/market-intelligence-benchmark.js";
import { adaptWebDiscoveryMarketSignals } from "../src/services/web-market-signal-adapter.js";
import { acquireYouTubeBenchmarkSignals } from "../src/services/youtube-market-signal-benchmark-acquisition.js";
import { adaptYouTubeMarketSignals } from "../src/services/youtube-market-signal-adapter.js";

const referenceAt = "2026-03-01T00:00:00.000Z";

function signal(overrides: Partial<NormalizedMarketSignal> = {}): NormalizedMarketSignal {
  const base = {
    source: "web",
    sourceId: "provider:one",
    url: "https://example.test/one",
    query: "workflow",
    capturedAt: "2026-02-15T00:00:00.000Z",
    text: "A bounded explicit signal",
    engagement: {},
    context: null,
    pain: null,
    desiredOutcome: null,
    failedAttempt: null,
    currentSolution: null,
    solutionComplaint: null,
    urgency: null,
    specificity: null,
    commercialIntent: null,
    provenance: {
      provider: "provider",
      source: "web",
      sourceId: "provider:one",
      url: "https://example.test/one",
      query: "workflow",
      capturedAt: "2026-02-15T00:00:00.000Z",
      normalizationVersion: "market-signal/v1",
    },
  } as NormalizedMarketSignal;
  const { provenance: provenanceOverride, ...signalOverrides } = overrides;
  const value = { ...base, ...signalOverrides } as NormalizedMarketSignal;
  return {
    ...value,
    provenance: {
      ...base.provenance,
      ...provenanceOverride,
      source: value.source,
      sourceId: value.sourceId,
      url: value.url,
      query: value.query,
      capturedAt: value.capturedAt,
    },
  } as NormalizedMarketSignal;
}

function acquisition(signals: readonly NormalizedMarketSignal[], overrides: Partial<Omit<MarketBenchmarkAcquisition, "signals" | "valid">> = {}): MarketBenchmarkAcquisition {
  return {
    requested: signals.length,
    returned: signals.length,
    valid: signals.length,
    signals,
    latencyMs: 3,
    usage: null,
    credits: null,
    ...overrides,
  };
}

describe("Phase 20.3 market intelligence benchmark", () => {
  it("adapts bounded web discovery through the normalizer and isolates malformed records", () => {
    const adaptation = adaptWebDiscoveryMarketSignals({
      provider: "brave-search",
      query: "workflow",
      retrievedAt: referenceAt,
      results: [
        { id: "a", url: "https://example.test/a", title: "Result", snippet: "x".repeat(2_000) },
        { id: "bad", url: "javascript:alert(1)", text: "Invalid URL" },
        {},
      ],
    });

    expect(adaptation.signals).toHaveLength(1);
    expect(adaptation.signals[0]).toMatchObject({ source: "web", sourceId: "brave-search:a", query: "workflow" });
    expect(adaptation.signals[0]?.text).toHaveLength(1_500);
    expect(adaptation.signals[0]?.context?.length).toBeLessThanOrEqual(2_000);
    expect(adaptation.rejected).toHaveLength(2);
  });

  it("uses Brave official GET authentication, applies its budget before I/O, and never requests on missing credentials", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ web: { results: Array.from({ length: 21 }, (_, index) => ({ title: `R${index}`, url: `https://example.test/${index}` })) } }), { status: 200 }));
    const provider = new BraveSearchProvider({ apiKey: "brave-test-key", fetch: fetchMock as typeof fetch });
    const discovery = await provider.discover("workflow", { maxResults: 99 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(discovery.results).toHaveLength(20);
    expect(url.searchParams.get("count")).toBe("20");
    expect(init).toMatchObject({ method: "GET", headers: { "X-Subscription-Token": "brave-test-key" } });

    const missingFetch = vi.fn();
    await expect(new BraveSearchProvider({ fetch: missingFetch as typeof fetch }).discover("x")).rejects.toMatchObject({ code: "missing_api_key" });
    expect(missingFetch).not.toHaveBeenCalled();
  });

  it("keeps YouTube acquisition to one selected video, a one-result search, and the bounded thread budget before I/O", async () => {
    const video = { videoId: "dQw4w9WgXcQ", title: "Video", channelId: "channel", channelTitle: "Channel", publishedAt: "2026-02-01T00:00:00Z" };
    const thread = (index: number) => ({
      threadId: `thread-${index}`,
      totalReplyCount: 0,
      embeddedReplies: [],
      topLevelComment: { commentId: `comment-${index}`, parentCommentId: null, author: "A", text: `signal ${index}`, likes: 0, publishedAt: "2026-02-02T00:00:00Z", updatedAt: "2026-02-02T00:00:00Z", isReply: false },
    });
    const adapter = {
      searchVideos: vi.fn(async () => ({ items: [{ ...video, description: "", publishedAt: video.publishedAt } as const] })),
      getVideo: vi.fn(async () => video),
      listCommentThreads: vi.fn(async () => ({ items: Array.from({ length: 11 }, (_, index) => thread(index)) })),
    };
    const result = await acquireYouTubeBenchmarkSignals(adapter, { query: "workflow", maxSignals: 3 });
    expect(result).toMatchObject({ requested: 3, returned: 11, valid: 3, usage: null, credits: null });
    expect(adapter.searchVideos).toHaveBeenCalledWith("workflow", undefined, 1);
    expect(adapter.getVideo).toHaveBeenCalledWith(video.videoId);
    expect(adapter.listCommentThreads).toHaveBeenCalledWith({ videoId: video.videoId, maxResults: 3 });
    expect(adaptYouTubeMarketSignals).toBeTypeOf("function");
  });

  it("supports bounded search maxResults compatibly", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const adapter = new YouTubeAdapter({ apiKey: "youtube-test-key", fetch: fetchMock as typeof fetch });
    await adapter.searchVideos("workflow", undefined, 99);
    await adapter.searchVideos("workflow", undefined, 0);
    const calls = fetchMock.mock.calls as unknown as readonly [URL, RequestInit?][];
    const first = calls[0]![0];
    const second = calls[1]![0];
    expect(first.searchParams.get("maxResults")).toBe("25");
    expect(second.searchParams.get("maxResults")).toBe("1");
  });

  it("reports complete provider metrics and keeps explicit cost distinct from usage and credits", async () => {
    const acquirer: MarketBenchmarkAcquirer = {
      provider: "measured",
      kind: "web",
      acquire: async () => acquisition([
        signal({ sourceId: "one", url: "https://one.example/a", commercialIntent: "pricing request" }),
        signal({ sourceId: "two", url: "https://two.example/a", text: "A second signal" }),
      ], { requested: 5, returned: 4, latencyMs: 12, usage: 7, credits: 2, estimatedCost: 1.5 }),
    };
    const benchmark = await runMarketIntelligenceBenchmark([acquirer], { query: "workflow", referenceAt });
    const provider = benchmark.providers[0]!;

    expect(provider).toEqual(expect.objectContaining({
      requested: 5,
      returned: 4,
      valid: 2,
      duplicates: 0,
      unique: 2,
      diversity: 2,
      usableTextRate: 1,
      evidenceDensity: 0.5,
      explicitCommercialCandidates: 1,
      freshnessCoverage: 1,
      latencyMs: 12,
      usage: 7,
      credits: 2,
      estimatedCost: 1.5,
      failure: null,
      verdict: "KEEP_PRIMARY",
    }));
    expect(MARKET_BENCHMARK_PROVIDER_VERDICTS).toEqual(["KEEP_PRIMARY", "KEEP_SECONDARY", "EXTRACTION_ONLY", "LOW_VALUE", "INSUFFICIENT_DATA"]);
  });

  it("uses source and sourceId as primary dedupe identity, preserving distinct YouTube comments sharing a video URL", async () => {
    const first = signal({ source: "youtube", sourceId: "youtube-comment:first", url: "https://www.youtube.com/watch?v=video", text: "same" });
    const second = signal({ source: "youtube", sourceId: "youtube-comment:second", url: first.url, text: "same" });
    const duplicate = signal({ source: "youtube", sourceId: "youtube-comment:first", url: "https://other.example/changed", text: "changed" });
    const benchmark = await runMarketIntelligenceBenchmark([{
      provider: "youtube",
      kind: "youtube",
      acquire: async () => acquisition([first, second, duplicate]),
    }], { query: "workflow", referenceAt });

    expect(benchmark.signals).toEqual([first, second]);
    expect(benchmark.metrics).toMatchObject({ duplicatesRemoved: 1, discardedByAnalysisBudget: 0, uniqueSignals: 2 });
    expect(benchmark.providers[0]).toMatchObject({ duplicates: 1, unique: 2 });
  });

  it("rejects duplicate provider names before executing any acquisition", async () => {
    const acquire = vi.fn(async () => acquisition([signal()]));
    const duplicateProviders: readonly MarketBenchmarkAcquirer[] = [
      { provider: "duplicate", kind: "web", acquire },
      { provider: "duplicate", kind: "web", acquire },
    ];
    await expect(runMarketIntelligenceBenchmark(duplicateProviders, { query: "workflow", referenceAt })).rejects.toThrow("provider names must be unique");
    expect(acquire).not.toHaveBeenCalled();
  });

  it("counts analysis-budget discards separately from true duplicates and isolates failures", async () => {
    const batch = (provider: string) => Array.from({ length: 10 }, (_, index) => signal({ sourceId: `${provider}:${index}`, url: `https://${provider}.example/${index}`, text: `${provider} ${index}` }));
    const acquirers: readonly MarketBenchmarkAcquirer[] = [
      { provider: "first", kind: "youtube", acquire: async () => acquisition(batch("first")) },
      { provider: "second", kind: "youtube", acquire: async () => acquisition(batch("second")) },
      { provider: "third", kind: "youtube", acquire: async () => acquisition(batch("third")) },
      { provider: "failed", kind: "web", acquire: async () => { throw new IntegrationError("missing_api_key", "missing"); } },
    ];
    const benchmark = await runMarketIntelligenceBenchmark(acquirers, { query: " workflow ", referenceAt });

    expect(benchmark.metrics).toMatchObject({
      requestedSignals: 35,
      returnedSignals: 30,
      validSignals: 30,
      uniqueSignals: 30,
      retainedSignals: 20,
      duplicatesRemoved: 0,
      discardedByAnalysisBudget: 10,
    });
    expect(benchmark.providers).toContainEqual(expect.objectContaining({ provider: "third", duplicates: 0, unique: 10 }));
    expect(benchmark.providers).toContainEqual(expect.objectContaining({ provider: "failed", succeeded: false, failure: "missing_api_key", verdict: "INSUFFICIENT_DATA" }));
    expect(benchmark.verdicts).toEqual({ evidence: "FRESH_EVIDENCE", commercial: "NO_EXPLICIT_COMMERCIAL_CANDIDATES" });
    expect(MARKET_BENCHMARK_BUDGETS.analysisSignals).toBe(20);
  });

  it("uses only explicit commercial intent and classifies stale evidence deterministically", async () => {
    const acquirer: MarketBenchmarkAcquirer = {
      provider: "web",
      kind: "web",
      acquire: async () => acquisition([signal({ capturedAt: "2025-01-01T00:00:00.000Z", commercialIntent: "pricing request" })]),
    };
    const benchmark = await runMarketIntelligenceBenchmark([acquirer], { query: "workflow", referenceAt });
    expect(benchmark.metrics.explicitCommercialCandidates).toBe(1);
    expect(benchmark.verdicts).toEqual({ evidence: "STALE_EVIDENCE", commercial: "EXPLICIT_COMMERCIAL_CANDIDATES" });
  });
});
