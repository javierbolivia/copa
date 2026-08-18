import type { NormalizedMarketSignal } from "@our-platform/shared";
import { IntegrationError } from "../integrations/integration-error.js";

export const MARKET_BENCHMARK_BUDGETS = {
  youtubeSignals: 10,
  webDiscoveryResults: 5,
  firecrawlScrapePages: 3,
  analysisSignals: 20,
} as const;

export const MARKET_BENCHMARK_EVIDENCE_VERDICTS = ["NO_EVIDENCE", "FRESH_EVIDENCE", "STALE_EVIDENCE"] as const;
export type MarketBenchmarkEvidenceVerdict = typeof MARKET_BENCHMARK_EVIDENCE_VERDICTS[number];
export const MARKET_BENCHMARK_COMMERCIAL_VERDICTS = ["EXPLICIT_COMMERCIAL_CANDIDATES", "NO_EXPLICIT_COMMERCIAL_CANDIDATES"] as const;
export type MarketBenchmarkCommercialVerdict = typeof MARKET_BENCHMARK_COMMERCIAL_VERDICTS[number];
export const MARKET_BENCHMARK_PROVIDER_VERDICTS = ["KEEP_PRIMARY", "KEEP_SECONDARY", "EXTRACTION_ONLY", "LOW_VALUE", "INSUFFICIENT_DATA"] as const;
export type MarketBenchmarkProviderVerdict = typeof MARKET_BENCHMARK_PROVIDER_VERDICTS[number];

export interface MarketBenchmarkAcquireInput {
  readonly query: string;
  readonly maxSignals: number;
  readonly maxDiscoveryResults: number;
  readonly maxFirecrawlScrapePages: number;
}

/**
 * Typed, transient account of one bounded provider acquisition. `estimatedCost`
 * is deliberately optional: it may only be supplied when a provider returned an
 * explicit monetary cost, never inferred from usage or credits.
 */
export interface MarketBenchmarkAcquisition {
  readonly requested: number;
  readonly returned: number;
  readonly valid: number;
  readonly signals: readonly NormalizedMarketSignal[];
  readonly latencyMs: number;
  readonly usage: number | null;
  readonly credits: number | null;
  readonly estimatedCost?: number;
}

export interface MarketBenchmarkAcquirer {
  readonly provider: string;
  readonly kind: "youtube" | "web";
  acquire(input: Readonly<MarketBenchmarkAcquireInput>): Promise<MarketBenchmarkAcquisition>;
}

export interface MarketBenchmarkInput {
  readonly query: string;
  /** Deterministic benchmark reference time, also used for freshness. */
  readonly referenceAt: string;
}

export interface MarketBenchmarkProviderResult {
  readonly provider: string;
  readonly succeeded: boolean;
  /** Safe IntegrationError code, or `invalid_acquisition`/`unknown`. */
  readonly failure: string | null;
  readonly requested: number;
  readonly returned: number;
  readonly valid: number;
  readonly duplicates: number;
  /** Distinct signals after identity dedupe, before the analysis budget gate. */
  readonly unique: number;
  /** Number of distinct URL hostnames among unique signals. */
  readonly diversity: number;
  readonly usableTextRate: number;
  /** Valid normalised signals divided by raw returned records. */
  readonly evidenceDensity: number;
  readonly explicitCommercialCandidates: number;
  readonly freshnessCoverage: number;
  readonly latencyMs: number;
  readonly usage: number | null;
  readonly credits: number | null;
  readonly estimatedCost: number | null;
  readonly verdict: MarketBenchmarkProviderVerdict;
}

export interface MarketIntelligenceBenchmark {
  readonly signals: readonly NormalizedMarketSignal[];
  readonly providers: readonly MarketBenchmarkProviderResult[];
  readonly metrics: {
    readonly requestedSignals: number;
    readonly returnedSignals: number;
    readonly validSignals: number;
    readonly uniqueSignals: number;
    readonly retainedSignals: number;
    readonly duplicatesRemoved: number;
    readonly discardedByAnalysisBudget: number;
    readonly evidenceSignals: number;
    readonly freshEvidenceSignals: number;
    readonly staleEvidenceSignals: number;
    readonly explicitCommercialCandidates: number;
  };
  readonly verdicts: {
    readonly evidence: MarketBenchmarkEvidenceVerdict;
    readonly commercial: MarketBenchmarkCommercialVerdict;
  };
}

function failureCode(error: unknown): string {
  return error instanceof IntegrationError ? error.code : "unknown";
}

function isFiniteCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function validateAcquisition(acquisition: MarketBenchmarkAcquisition): void {
  if (!isFiniteCount(acquisition.requested) || !isFiniteCount(acquisition.returned)
    || !isFiniteCount(acquisition.valid) || acquisition.valid > acquisition.returned || acquisition.valid !== acquisition.signals.length
    || !Number.isFinite(acquisition.latencyMs) || acquisition.latencyMs < 0
    || (acquisition.usage !== null && (!Number.isFinite(acquisition.usage) || acquisition.usage < 0))
    || (acquisition.credits !== null && (!Number.isFinite(acquisition.credits) || acquisition.credits < 0))
    || (acquisition.estimatedCost !== undefined && (!Number.isFinite(acquisition.estimatedCost) || acquisition.estimatedCost < 0))) {
    throw new Error("invalid_acquisition");
  }
}

/** Stable identity wins; URL is only an identity fallback, then text for future identity-less contracts. */
function dedupeKey(signal: NormalizedMarketSignal): string {
  if (signal.sourceId !== null) return `id:${signal.source}:${signal.sourceId}`;
  if (signal.url !== null) return `url:${signal.url}`;
  return `text:${signal.text}`;
}

function isFresh(signal: NormalizedMarketSignal, referenceAt: number): boolean {
  const age = referenceAt - new Date(signal.capturedAt).getTime();
  return age >= 0 && age <= 90 * 24 * 60 * 60 * 1_000;
}

function domainCount(signals: readonly NormalizedMarketSignal[]): number {
  const domains = new Set<string>();
  for (const signal of signals) {
    if (signal.url === null) continue;
    domains.add(new URL(signal.url).hostname);
  }
  return domains.size;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Provider verdicts are deterministic diagnostics, not Research quality gates:
 * valid/returned is the auditable evidence density; freshness and explicit
 * commercial fields are the only promotion signals. Raw but otherwise usable
 * stale signals remain extraction-only rather than being represented as proof.
 */
function providerVerdict(input: {
  readonly failed: boolean;
  readonly valid: number;
  readonly unique: number;
  readonly evidenceDensity: number;
  readonly freshCoverage: number;
  readonly explicitCommercialCandidates: number;
}): MarketBenchmarkProviderVerdict {
  if (input.failed || input.valid === 0) return "INSUFFICIENT_DATA";
  if (input.unique === 0 || input.evidenceDensity < 0.5) return "LOW_VALUE";
  if (input.freshCoverage > 0 && input.explicitCommercialCandidates > 0) return "KEEP_PRIMARY";
  if (input.freshCoverage > 0) return "KEEP_SECONDARY";
  return "EXTRACTION_ONLY";
}

function validateUniqueProviders(acquirers: readonly MarketBenchmarkAcquirer[]): void {
  const providers = new Set<string>();
  for (const acquirer of acquirers) {
    const provider = acquirer.provider.trim();
    if (!provider || providers.has(provider)) throw new Error("benchmark provider names must be unique");
    providers.add(provider);
  }
}

/**
 * Deterministic, transient budget gate. Concrete acquirers must apply request
 * budgets before I/O; this service validates names before starting any work,
 * invokes no LLM, and never persists. Analysis-budget discards are counted
 * separately from true identity duplicates.
 */
export async function runMarketIntelligenceBenchmark(
  acquirers: readonly MarketBenchmarkAcquirer[],
  input: Readonly<MarketBenchmarkInput>,
): Promise<MarketIntelligenceBenchmark> {
  const query = input.query.trim();
  const referenceAt = new Date(input.referenceAt).getTime();
  if (!query) throw new Error("benchmark query must not be empty");
  if (Number.isNaN(referenceAt)) throw new Error("benchmark referenceAt must be valid");
  validateUniqueProviders(acquirers);

  const providerRuns = await Promise.all(acquirers.map(async (acquirer) => {
    const maxSignals = acquirer.kind === "youtube"
      ? MARKET_BENCHMARK_BUDGETS.youtubeSignals
      : MARKET_BENCHMARK_BUDGETS.webDiscoveryResults;
    const startedAt = Date.now();
    try {
      const acquisition = await acquirer.acquire({
        query,
        maxSignals,
        maxDiscoveryResults: MARKET_BENCHMARK_BUDGETS.webDiscoveryResults,
        maxFirecrawlScrapePages: MARKET_BENCHMARK_BUDGETS.firecrawlScrapePages,
      });
      validateAcquisition(acquisition);
      return { acquirer, acquisition, failure: null as string | null };
    } catch (error) {
      return {
        acquirer,
        acquisition: null,
        requested: maxSignals,
        failure: error instanceof Error && error.message === "invalid_acquisition" ? "invalid_acquisition" : failureCode(error),
        latencyMs: Date.now() - startedAt,
      };
    }
  }));

  const seen = new Set<string>();
  const retained: NormalizedMarketSignal[] = [];
  const providers: MarketBenchmarkProviderResult[] = [];
  let requestedSignals = 0;
  let returnedSignals = 0;
  let validSignals = 0;
  let uniqueSignals = 0;
  let duplicatesRemoved = 0;
  let discardedByAnalysisBudget = 0;

  for (const run of providerRuns) {
    const acquisition = run.acquisition;
    if (acquisition === null) {
      requestedSignals += run.requested;
      providers.push({
        provider: run.acquirer.provider,
        succeeded: false,
        failure: run.failure,
        requested: run.requested,
        returned: 0,
        valid: 0,
        duplicates: 0,
        unique: 0,
        diversity: 0,
        usableTextRate: 0,
        evidenceDensity: 0,
        explicitCommercialCandidates: 0,
        freshnessCoverage: 0,
        latencyMs: run.latencyMs,
        usage: null,
        credits: null,
        estimatedCost: null,
        verdict: "INSUFFICIENT_DATA",
      });
      continue;
    }

    requestedSignals += acquisition.requested;
    returnedSignals += acquisition.returned;
    validSignals += acquisition.valid;
    const providerUnique: NormalizedMarketSignal[] = [];
    let duplicates = 0;
    for (const signal of acquisition.signals) {
      const key = dedupeKey(signal);
      if (seen.has(key)) {
        duplicates += 1;
        duplicatesRemoved += 1;
        continue;
      }
      seen.add(key);
      providerUnique.push(signal);
      if (retained.length >= MARKET_BENCHMARK_BUDGETS.analysisSignals) {
        discardedByAnalysisBudget += 1;
        continue;
      }
      retained.push(signal);
    }
    uniqueSignals += providerUnique.length;
    const usableTextRate = rate(providerUnique.filter((signal) => signal.text.trim().length > 0).length, acquisition.valid);
    const freshnessCoverage = rate(providerUnique.filter((signal) => isFresh(signal, referenceAt)).length, providerUnique.length);
    const explicitCommercialCandidates = providerUnique.filter((signal) => signal.commercialIntent !== null).length;
    const evidenceDensity = rate(acquisition.valid, acquisition.returned);
    providers.push({
      provider: run.acquirer.provider,
      succeeded: true,
      failure: null,
      requested: acquisition.requested,
      returned: acquisition.returned,
      valid: acquisition.valid,
      duplicates,
      unique: providerUnique.length,
      diversity: domainCount(providerUnique),
      usableTextRate,
      evidenceDensity,
      explicitCommercialCandidates,
      freshnessCoverage,
      latencyMs: acquisition.latencyMs,
      usage: acquisition.usage,
      credits: acquisition.credits,
      estimatedCost: acquisition.estimatedCost ?? null,
      verdict: providerVerdict({
        failed: false,
        valid: acquisition.valid,
        unique: providerUnique.length,
        evidenceDensity,
        freshCoverage: freshnessCoverage,
        explicitCommercialCandidates,
      }),
    });
  }

  const freshEvidenceSignals = retained.filter((signal) => isFresh(signal, referenceAt)).length;
  const explicitCommercialCandidates = retained.filter((signal) => signal.commercialIntent !== null).length;
  const evidence = retained.length === 0
    ? "NO_EVIDENCE"
    : freshEvidenceSignals > 0 ? "FRESH_EVIDENCE" : "STALE_EVIDENCE";
  return {
    signals: retained,
    providers,
    metrics: {
      requestedSignals,
      returnedSignals,
      validSignals,
      uniqueSignals,
      retainedSignals: retained.length,
      duplicatesRemoved,
      discardedByAnalysisBudget,
      evidenceSignals: retained.length,
      freshEvidenceSignals,
      staleEvidenceSignals: retained.length - freshEvidenceSignals,
      explicitCommercialCandidates,
    },
    verdicts: {
      evidence,
      commercial: explicitCommercialCandidates > 0 ? "EXPLICIT_COMMERCIAL_CANDIDATES" : "NO_EXPLICIT_COMMERCIAL_CANDIDATES",
    },
  };
}
