import {
  MARKET_RESEARCH_BUDGETS,
  MARKET_RESEARCH_PROVIDERS,
  MarketResearchYouTubeRelevanceProvenanceSchema,
  marketResearchProviderBudget,
  type MarketResearchMetrics,
  type MarketResearchProvider,
  type MarketResearchProviderReport,
  type MarketResearchProviderState,
  type MarketResearchSignal,
  type MarketResearchYouTubeMetadata,
  type MarketResearchYouTubeRelevanceProvenance,
  type NormalizedMarketSignal,
  type YouTubeQueryPlan,
} from "@our-platform/shared";
import { Value } from "@sinclair/typebox/value";

import { IntegrationError } from "../integrations/integration-error.js";
import type { WebDiscoveryProvider, WebDiscoveryResponse } from "../integrations/web-discovery.js";
import type { YouTubeAdapter } from "../integrations/youtube-adapter.js";
import { marketSignalDedupeKey } from "./market-intelligence-benchmark.js";
import { adaptWebDiscoveryMarketSignals } from "./web-market-signal-adapter.js";
import { acquireYouTubeDeepResearchSignals, type YouTubeDeepAcquisitionMetrics } from "./youtube-deep-research-acquisition.js";
import type { YouTubeRelevanceReviewer } from "./youtube-relevance-reviewer.js";
import { resolveYouTubeMinimumDurationSeconds } from "./youtube-research-relevance.js";

export type MarketResearchYouTubeClient =
  Pick<YouTubeAdapter, "searchVideos" | "getVideo" | "listCommentThreads">
  & Partial<Pick<YouTubeAdapter, "getVideos" | "getChannels" | "listReplies">>
  & { readonly configured: boolean };

/** Firecrawl is the only provider that also deepens a single explicit URL. */
export interface MarketResearchScrapeProvider extends WebDiscoveryProvider {
  scrape(url: string): Promise<WebDiscoveryResponse>;
}

export interface MarketResearchClients {
  readonly youtube?: MarketResearchYouTubeClient;
  readonly tavily?: WebDiscoveryProvider;
  readonly exa?: WebDiscoveryProvider;
  readonly brave?: WebDiscoveryProvider;
  readonly firecrawl?: MarketResearchScrapeProvider;
}

export interface MarketResearchAcquisitionInput {
  readonly topic: string;
  /** Local shadow telemetry only; never replaces the current executor queries. */
  readonly youtubeShadowQueryPlan?: YouTubeQueryPlan;
  /** Caller-supplied retrieval time so signal adapters stay pure. */
  readonly retrievedAt: string;
  /** Optional bounded metadata review, composed by MarketResearchService. */
  readonly youtubeRelevanceReviewer?: YouTubeRelevanceReviewer;
  readonly youtubeMinimumDurationSeconds?: number;
  /** Optional narrowing only; it can never raise a budget or add a provider. */
  readonly providers?: readonly MarketResearchProvider[];
}

export interface MarketResearchAcquisition {
  readonly providers: readonly MarketResearchProviderReport[];
  /** Deduped, ranked and budget-capped signals ready for semantic analysis. */
  readonly signals: readonly MarketResearchSignal[];
  readonly metrics: MarketResearchMetrics;
}

interface ProviderAcquisition {
  readonly provider: MarketResearchProvider;
  readonly state: MarketResearchProviderState;
  readonly requested: number;
  readonly returned: number;
  readonly valid: number;
  readonly signals: readonly NormalizedMarketSignal[];
  readonly latencyMs: number;
  readonly failure: string | null;
  readonly usage: number | null;
  readonly credits: number | null;
  readonly youtube?: YouTubeDeepAcquisitionMetrics;
}

const RECENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;
const MIN_USABLE_TEXT_LENGTH = 20;
const BOILERPLATE_LINE = /^(?:cookies?|aceptar cookies|accept cookies|subscribe|suscr[ií]bete|share|compartir|advertisement|publicidad|men[uú]|skip to content|sign in|log in|iniciar sesi[oó]n)\b/iu;

/** Safe failure category only; provider bodies and headers are never surfaced. */
function failureCode(error: unknown): string {
  return error instanceof IntegrationError ? error.code : "unknown";
}

function parsedYouTubeRelevance(value: unknown): MarketResearchYouTubeRelevanceProvenance | undefined {
  if (!Value.Check(MarketResearchYouTubeRelevanceProvenanceSchema, value)) return undefined;
  const relevance = value as MarketResearchYouTubeRelevanceProvenance;
  return {
    version: relevance.version,
    deterministic: {
      decision: relevance.deterministic.decision,
      reason: relevance.deterministic.reason,
      matchedTerms: [...relevance.deterministic.matchedTerms],
      durationSeconds: relevance.deterministic.durationSeconds,
      minimumDurationSeconds: relevance.deterministic.minimumDurationSeconds,
    },
    reviewer: relevance.reviewer === null ? null : {
      decision: relevance.reviewer.decision,
      provider: relevance.reviewer.provider,
      model: relevance.reviewer.model,
      fallback: relevance.reviewer.fallback,
      reason: relevance.reviewer.reason,
      matchedAspects: [...relevance.reviewer.matchedAspects],
      failure: relevance.reviewer.failure,
    },
    final: {
      eligible: relevance.final.eligible,
      rejectionReason: relevance.final.rejectionReason,
    },
  };
}

function youtubeMetadata(signal: NormalizedMarketSignal): MarketResearchYouTubeMetadata | undefined {
  if (signal.source !== "youtube" || signal.query === null || signal.context === null) return undefined;
  try {
    const context: unknown = JSON.parse(signal.context);
    if (typeof context !== "object" || context === null || Array.isArray(context)) return undefined;
    const record = context as Record<string, unknown>;
    const video = record.video;
    const discovery = record.discovery;
    if (typeof video !== "object" || video === null || Array.isArray(video)) return undefined;
    const videoRecord = video as Record<string, unknown>;
    const discoveryRecord = typeof discovery === "object" && discovery !== null && !Array.isArray(discovery)
      ? discovery as Record<string, unknown> : null;
    if (typeof videoRecord.videoId !== "string" || typeof videoRecord.channelId !== "string" || typeof videoRecord.channelTitle !== "string") return undefined;
    const text = (value: unknown): string | null => typeof value === "string" && value.trim().length > 0 ? value : null;
    const relevance = parsedYouTubeRelevance(discoveryRecord?.relevance);
    return {
      videoId: videoRecord.videoId,
      channelId: videoRecord.channelId,
      channelTitle: videoRecord.channelTitle,
      query: signal.query,
      queryAngle: text(discoveryRecord?.angle),
      queryLanguage: text(discoveryRecord?.language),
      declaredLanguage: text(discoveryRecord?.declaredLanguage),
      channelCountry: text(discoveryRecord?.channelCountry),
      ...(relevance === undefined ? {} : { relevance }),
    };
  } catch {
    return undefined;
  }
}

function analyzedSignalCap(): number {
  return MARKET_RESEARCH_BUDGETS.youtubeSemanticBatchSignals * MARKET_RESEARCH_BUDGETS.youtubeSemanticMaxBatches;
}

/**
 * Deterministic bounded analysis text: canonical whitespace, obvious navigation
 * boilerplate removed, then hard-capped at the contract character budget.
 */
export function boundedAnalysisText(value: string): string {
  const lines = value
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/gu, " ").trim())
    .filter((line) => line.length > 0 && !BOILERPLATE_LINE.test(line));
  return lines.join(" ").trim().slice(0, MARKET_RESEARCH_BUDGETS.analysisSignalChars);
}

function hostnameOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Secondary identity for web documents. Providers disagree on whether they
 * return a stable record ID, so the same page reached through two providers
 * would otherwise survive identity dedupe and inflate cross-source
 * corroboration. YouTube keeps its per-comment identity untouched.
 */
function webDocumentKey(signal: NormalizedMarketSignal): string | null {
  if (signal.source !== "web" || signal.url === null) return null;
  try {
    const url = new URL(signal.url);
    const host = url.hostname.toLowerCase().replace(/^www\./u, "");
    const path = url.pathname.replace(/\/+$/u, "");
    return `web-document:${host}${path}${url.search}`;
  } catch {
    return null;
  }
}

function isRecent(capturedAt: string, referenceAt: number): boolean {
  const age = referenceAt - new Date(capturedAt).getTime();
  return age >= 0 && age <= RECENT_WINDOW_MS;
}

function requestedProviders(
  clients: MarketResearchClients,
  requested: readonly MarketResearchProvider[] | undefined,
): readonly MarketResearchProvider[] {
  const allowed = requested === undefined ? MARKET_RESEARCH_PROVIDERS : MARKET_RESEARCH_PROVIDERS.filter((provider) => requested.includes(provider));
  return allowed.filter((provider) => clients[provider] !== undefined);
}

function webProvider(clients: MarketResearchClients, provider: MarketResearchProvider): WebDiscoveryProvider | undefined {
  return provider === "youtube" ? undefined : clients[provider];
}

async function acquireProvider(
  clients: MarketResearchClients,
  provider: MarketResearchProvider,
  input: Readonly<MarketResearchAcquisitionInput>,
): Promise<ProviderAcquisition> {
  const requested = marketResearchProviderBudget(provider);
  const startedAt = Date.now();
  const empty = {
    provider,
    requested,
    returned: 0,
    valid: 0,
    signals: [] as readonly NormalizedMarketSignal[],
    usage: null,
    credits: null,
  };

  if (provider === "youtube") {
    const youtube = clients.youtube;
    if (!youtube?.configured) {
      return { ...empty, state: "not_configured", latencyMs: 0, failure: null };
    }
    try {
      const acquisition = await acquireYouTubeDeepResearchSignals(youtube, {
        topic: input.topic,
        ...(input.youtubeShadowQueryPlan === undefined ? {} : { shadowQueryPlan: input.youtubeShadowQueryPlan }),
        ...(input.youtubeMinimumDurationSeconds === undefined
          ? {}
          : { youtubeMinimumDurationSeconds: input.youtubeMinimumDurationSeconds }),
        ...(input.youtubeRelevanceReviewer === undefined ? {} : { relevanceReviewer: input.youtubeRelevanceReviewer }),
      });
      return {
        ...empty,
        state: "available",
        returned: acquisition.returned,
        valid: acquisition.valid,
        signals: acquisition.signals,
        latencyMs: acquisition.latencyMs,
        failure: null,
        youtube: acquisition.metrics,
      };
    } catch (error) {
      return { ...empty, state: "temporary_error", latencyMs: Date.now() - startedAt, failure: failureCode(error) };
    }
  }

  const client = webProvider(clients, provider);
  if (client === undefined || !client.configured) {
    return { ...empty, state: "not_configured", latencyMs: 0, failure: null };
  }
  try {
    const discovery = await client.discover(input.topic, { maxResults: requested });
    const adaptation = adaptWebDiscoveryMarketSignals({
      provider,
      query: input.topic,
      retrievedAt: input.retrievedAt,
      results: discovery.results,
    });
    return {
      ...empty,
      state: "available",
      returned: discovery.results.length,
      valid: adaptation.signals.length,
      signals: adaptation.signals,
      latencyMs: Date.now() - startedAt,
      failure: null,
      usage: discovery.metadata.usage ?? null,
      credits: discovery.metadata.credits ?? null,
    };
  } catch (error) {
    return { ...empty, state: "temporary_error", latencyMs: Date.now() - startedAt, failure: failureCode(error) };
  }
}

interface RankedSignal {
  readonly provider: MarketResearchProvider;
  readonly signal: NormalizedMarketSignal;
  readonly text: string;
  readonly key: string;
}

/**
 * Deterministic usefulness ranking. Providers are interleaved in contract order
 * so the analysis budget can never be consumed by a single provider, and each
 * provider contributes its longest, most recent evidence first.
 */
function rankForAnalysis(byProvider: ReadonlyMap<MarketResearchProvider, readonly RankedSignal[]>): readonly RankedSignal[] {
  const queues = MARKET_RESEARCH_PROVIDERS.map((provider) => [...(byProvider.get(provider) ?? [])].sort((left, right) =>
    right.text.length - left.text.length
    || Date.parse(right.signal.capturedAt) - Date.parse(left.signal.capturedAt)
    || left.key.localeCompare(right.key)));
  const ordered: RankedSignal[] = [];
  for (let round = 0; ordered.length < queues.reduce((total, queue) => total + queue.length, 0); round += 1) {
    let progressed = false;
    for (const queue of queues) {
      const candidate = queue[round];
      if (candidate === undefined) continue;
      ordered.push(candidate);
      progressed = true;
    }
    if (!progressed) break;
  }
  return ordered;
}

async function deepenSignals(
  firecrawl: MarketResearchScrapeProvider | undefined,
  enabled: boolean,
  signals: readonly MarketResearchSignal[],
): Promise<{ readonly signals: readonly MarketResearchSignal[]; readonly scrapedPages: number }> {
  if (!enabled || firecrawl === undefined || !firecrawl.configured || MARKET_RESEARCH_BUDGETS.firecrawlScrapePages < 1) {
    return { signals, scrapedPages: 0 };
  }
  // Deepen only the thinnest URL-bearing evidence that survived dedupe, never every result.
  const candidates = signals
    .filter((signal): signal is MarketResearchSignal & { url: string } => signal.provider !== "youtube" && signal.url !== null)
    .sort((left, right) => left.text.length - right.text.length || left.url.localeCompare(right.url))
    .slice(0, MARKET_RESEARCH_BUDGETS.firecrawlScrapePages);

  const deepened = new Map<string, string>();
  let scrapedPages = 0;
  for (const candidate of candidates) {
    try {
      const response = await firecrawl.scrape(candidate.url);
      scrapedPages += 1;
      const extracted = boundedAnalysisText(response.results[0]?.text ?? response.results[0]?.snippet ?? "");
      if (extracted.length > candidate.text.length) deepened.set(candidate.id, extracted);
    } catch {
      // Deep extraction is optional enrichment: a failure never aborts the run.
      scrapedPages += 1;
    }
  }
  return {
    signals: signals.map((signal) => {
      const text = deepened.get(signal.id);
      return text === undefined ? signal : { ...signal, text, deepened: true };
    }),
    scrapedPages,
  };
}

/**
 * One bounded acquisition pass: per-provider budgets are applied before any I/O,
 * provider failures are isolated, identity dedupe runs before the analysis gate,
 * and Firecrawl deepening happens only after dedupe on selected URLs.
 */
export async function acquireMarketResearchSignals(
  clients: MarketResearchClients,
  input: Readonly<MarketResearchAcquisitionInput>,
): Promise<MarketResearchAcquisition> {
  const topic = input.topic.trim();
  if (!topic) throw new Error("market research topic must not be empty");
  const referenceAt = new Date(input.retrievedAt).getTime();
  if (Number.isNaN(referenceAt)) throw new Error("market research retrievedAt must be valid");
  const youtubeMinimumDurationSeconds = resolveYouTubeMinimumDurationSeconds(input.youtubeMinimumDurationSeconds);

  const selected = requestedProviders(clients, input.providers);
  const acquisitions = await Promise.all(selected.map((provider) => acquireProvider(clients, provider, {
    ...input,
    topic,
    youtubeMinimumDurationSeconds,
  })));

  const seen = new Set<string>();
  const uniqueByProvider = new Map<MarketResearchProvider, RankedSignal[]>();
  const duplicatesByProvider = new Map<MarketResearchProvider, number>();
  let requestedSignals = 0;
  let returnedSignals = 0;
  let validSignals = 0;
  let uniqueSignals = 0;
  let duplicatesRemoved = 0;

  for (const acquisition of acquisitions) {
    requestedSignals += acquisition.requested;
    returnedSignals += acquisition.returned;
    validSignals += acquisition.valid;
    const unique: RankedSignal[] = [];
    let duplicates = 0;
    for (const signal of acquisition.signals) {
      // Unusable snippets must not reserve an identity: a later provider can
      // legitimately have a substantive extraction of the same document.
      const text = boundedAnalysisText(signal.text);
      if (text.length < MIN_USABLE_TEXT_LENGTH) continue;
      const key = marketSignalDedupeKey(signal);
      const documentKey = webDocumentKey(signal);
      if (seen.has(key) || (documentKey !== null && seen.has(documentKey))) {
        duplicates += 1;
        duplicatesRemoved += 1;
        continue;
      }
      seen.add(key);
      if (documentKey !== null) seen.add(documentKey);
      unique.push({ provider: acquisition.provider, signal, text, key });
    }
    uniqueSignals += unique.length;
    uniqueByProvider.set(acquisition.provider, unique);
    duplicatesByProvider.set(acquisition.provider, duplicates);
  }

  const ranked = rankForAnalysis(uniqueByProvider);
  // Persist every cleaned YouTube signal for traceability and Evidence Explorer;
  // the semantic miner enforces its own 12×25 batch ceiling. Other providers
  // retain the established global analysis budget.
  const youtubeRanked = uniqueByProvider.get("youtube") ?? [];
  const nonYoutubeRanked = ranked.filter((entry) => entry.provider !== "youtube");
  const retained = [
    ...youtubeRanked,
    ...nonYoutubeRanked.slice(0, MARKET_RESEARCH_BUDGETS.analysisSignals),
  ];
  const initial: readonly MarketResearchSignal[] = retained.map((entry, index) => ({
    id: `S${index + 1}`,
    provider: entry.provider,
    source: entry.signal.source,
    sourceId: entry.signal.sourceId,
    url: entry.signal.url,
    capturedAt: entry.signal.capturedAt,
    text: entry.text,
    deepened: false,
    ...(entry.provider === "youtube" ? (() => {
      const metadata = youtubeMetadata(entry.signal);
      return metadata === undefined ? {} : { youtube: metadata };
    })() : {}),
  }));

  const firecrawlEnabled = selected.includes("firecrawl");
  const { signals, scrapedPages } = await deepenSignals(clients.firecrawl, firecrawlEnabled, initial);
  const analyzedByProvider = new Map<MarketResearchProvider, number>();
  for (const signal of signals) {
    analyzedByProvider.set(signal.provider, (analyzedByProvider.get(signal.provider) ?? 0) + 1);
  }

  const providers: MarketResearchProviderReport[] = acquisitions.map((acquisition) => ({
    provider: acquisition.provider,
    state: acquisition.state,
    requested: acquisition.requested,
    returned: acquisition.returned,
    valid: acquisition.valid,
    unique: (uniqueByProvider.get(acquisition.provider) ?? []).length,
    duplicates: duplicatesByProvider.get(acquisition.provider) ?? 0,
    analyzed: analyzedByProvider.get(acquisition.provider) ?? 0,
    scrapedPages: acquisition.provider === "firecrawl" ? scrapedPages : 0,
    latencyMs: Math.max(0, Math.round(acquisition.latencyMs)),
    failure: acquisition.failure,
    usage: acquisition.usage,
    credits: acquisition.credits,
    ...(acquisition.youtube === undefined ? {} : { youtube: acquisition.youtube }),
  }));

  return {
    providers,
    signals,
    metrics: {
      requestedSignals,
      returnedSignals,
      validSignals,
      uniqueSignals,
      duplicatesRemoved,
      analyzedSignals: signals.length,
      discardedByAnalysisBudget: Math.max(
        0,
        nonYoutubeRanked.length - Math.min(nonYoutubeRanked.length, MARKET_RESEARCH_BUDGETS.analysisSignals),
      ) + Math.max(0, youtubeRanked.length - analyzedSignalCap()),
      deepenedSignals: signals.filter((signal) => signal.deepened).length,
    },
  };
}

export interface MarketResearchSignalStats {
  readonly providers: number;
  readonly domains: number;
  readonly recent: number;
}

/** Deterministic corroboration inputs for one set of supporting signals. */
export function marketResearchSignalStats(
  signals: readonly MarketResearchSignal[],
  referenceAt: string,
): MarketResearchSignalStats {
  const reference = new Date(referenceAt).getTime();
  const providers = new Set<MarketResearchProvider>();
  const domains = new Set<string>();
  let recent = 0;
  for (const signal of signals) {
    providers.add(signal.provider);
    const hostname = hostnameOf(signal.url);
    if (hostname !== null) domains.add(hostname);
    if (!Number.isNaN(reference) && isRecent(signal.capturedAt, reference)) recent += 1;
  }
  return { providers: providers.size, domains: domains.size, recent };
}
