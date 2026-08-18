import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";

import { WORKSPACE_ROOT } from "../config.js";
import { BraveSearchProvider } from "../integrations/brave-search-provider.js";
import { ExaProvider } from "../integrations/exa-provider.js";
import { FirecrawlProvider } from "../integrations/firecrawl-provider.js";
import { TavilyProvider } from "../integrations/tavily-provider.js";
import type { WebDiscoveryProvider } from "../integrations/web-discovery.js";
import { YouTubeAdapter } from "../integrations/youtube-adapter.js";
import {
  runMarketIntelligenceBenchmark,
  type MarketBenchmarkAcquirer,
  type MarketBenchmarkAcquisition,
} from "../services/market-intelligence-benchmark.js";
import { adaptWebDiscoveryMarketSignals } from "../services/web-market-signal-adapter.js";
import { acquireYouTubeBenchmarkSignals } from "../services/youtube-market-signal-benchmark-acquisition.js";

loadDotEnv({ path: resolve(WORKSPACE_ROOT, ".env"), quiet: true });

const topic = process.env.MARKET_BENCHMARK_TOPIC?.trim() || "creator workflow pain points";
const retrievedAt = new Date().toISOString();
const youtube = new YouTubeAdapter({ ...(process.env.YOUTUBE_API_KEY ? { apiKey: process.env.YOUTUBE_API_KEY } : {}) });
const webProviders: readonly WebDiscoveryProvider[] = [
  new TavilyProvider({ ...(process.env.TAVILY_API_KEY ? { apiKey: process.env.TAVILY_API_KEY } : {}) }),
  new ExaProvider({ ...(process.env.EXA_API_KEY ? { apiKey: process.env.EXA_API_KEY } : {}) }),
  new FirecrawlProvider({ ...(process.env.FIRECRAWL_API_KEY ? { apiKey: process.env.FIRECRAWL_API_KEY } : {}) }),
  new BraveSearchProvider({ ...(process.env.BRAVE_SEARCH_API_KEY ? { apiKey: process.env.BRAVE_SEARCH_API_KEY } : {}) }),
];

async function acquireWebBenchmarkSignals(
  provider: WebDiscoveryProvider,
  budget: Parameters<MarketBenchmarkAcquirer["acquire"]>[0],
): Promise<MarketBenchmarkAcquisition> {
  const startedAt = Date.now();
  const discovery = await provider.discover(budget.query, { maxResults: budget.maxDiscoveryResults });
  const adaptation = adaptWebDiscoveryMarketSignals({
    provider: provider.name,
    query: budget.query,
    retrievedAt,
    results: discovery.results,
  });
  return {
    requested: budget.maxDiscoveryResults,
    returned: discovery.results.length,
    valid: adaptation.signals.length,
    signals: adaptation.signals,
    latencyMs: Date.now() - startedAt,
    usage: discovery.metadata.usage ?? null,
    credits: discovery.metadata.credits ?? null,
    ...(discovery.metadata.estimatedCost === undefined ? {} : { estimatedCost: discovery.metadata.estimatedCost }),
  };
}

const acquirers: readonly MarketBenchmarkAcquirer[] = [
  {
    provider: "youtube",
    kind: "youtube",
    acquire: (budget) => acquireYouTubeBenchmarkSignals(youtube, { query: budget.query, maxSignals: budget.maxSignals }),
  },
  ...webProviders.map((provider): MarketBenchmarkAcquirer => ({
    provider: provider.name,
    kind: "web",
    acquire: (budget) => acquireWebBenchmarkSignals(provider, budget),
  })),
];

const benchmark = await runMarketIntelligenceBenchmark(acquirers, { query: topic, referenceAt: retrievedAt });
console.log(JSON.stringify({ providers: benchmark.providers, metrics: benchmark.metrics, verdicts: benchmark.verdicts }));
