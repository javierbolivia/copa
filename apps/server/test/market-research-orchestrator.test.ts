import { MARKET_RESEARCH_BUDGETS } from "@our-platform/shared";
import { describe, expect, it, vi } from "vitest";

import { BraveSearchProvider } from "../src/integrations/brave-search-provider.js";
import { ExaProvider } from "../src/integrations/exa-provider.js";
import { FirecrawlProvider } from "../src/integrations/firecrawl-provider.js";
import { TavilyProvider } from "../src/integrations/tavily-provider.js";
import {
  acquireMarketResearchSignals,
  boundedAnalysisText,
  type MarketResearchClients,
  type MarketResearchYouTubeClient,
} from "../src/services/market-research-orchestrator.js";

const retrievedAt = "2026-03-01T00:00:00.000Z";
const TOPIC = "organización de fotografías digitales";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function youtubeClient(count: number, overrides: Partial<MarketResearchYouTubeClient> = {}): MarketResearchYouTubeClient {
  const video = { videoId: "dQw4w9WgXcQ", title: "Organización de fotografías digitales", channelId: "channel", channelTitle: "Organización de fotografías", publishedAt: "2026-02-01T00:00:00Z" };
  const enrichedVideo = {
    ...video,
    description: "Guía para organización de fotografías digitales",
    duration: "PT8M",
    tags: ["organización", "fotografías", "digitales"],
    defaultAudioLanguage: "es",
  };
  const thread = (index: number) => ({
    threadId: `thread-${index}`,
    totalReplyCount: 0,
    embeddedReplies: [],
    topLevelComment: {
      commentId: `comment-${index}`,
      parentCommentId: null,
      author: "Autor",
      text: `La organización de fotografías digitales es demasiado lenta y no funciona para mí, caso ${index}`,
      likes: index,
      publishedAt: "2026-02-02T00:00:00Z",
      updatedAt: "2026-02-02T00:00:00Z",
      isReply: false,
    },
  });
  return {
    configured: true,
    searchVideos: vi.fn(async () => ({ items: [{ ...video, description: "" }] })),
    getVideo: vi.fn(async () => enrichedVideo),
    getVideos: vi.fn(async () => [enrichedVideo]),
    listCommentThreads: vi.fn(async () => ({ items: Array.from({ length: count }, (_, index) => thread(index)) })),
    ...overrides,
  } as unknown as MarketResearchYouTubeClient;
}

function tavily(results: number, fetchMock = vi.fn(async () => json({
  results: Array.from({ length: results }, (_, index) => ({ url: `https://tavily.test/${index}`, title: `T${index}`, content: `Evidencia de Tavily suficientemente larga ${index}` })),
  usage: 3,
}))): { provider: TavilyProvider; fetchMock: typeof fetchMock } {
  return { provider: new TavilyProvider({ apiKey: "tavily-key", fetch: fetchMock as unknown as typeof fetch }), fetchMock };
}

function exa(results: number, fetchMock = vi.fn(async () => json({
  results: Array.from({ length: results }, (_, index) => ({ url: `https://exa.test/${index}`, title: `E${index}`, text: `Evidencia de Exa suficientemente larga ${index}` })),
}))): { provider: ExaProvider; fetchMock: typeof fetchMock } {
  return { provider: new ExaProvider({ apiKey: "exa-key", fetch: fetchMock as unknown as typeof fetch }), fetchMock };
}

function brave(results: number, fetchMock = vi.fn(async () => json({
  web: { results: Array.from({ length: results }, (_, index) => ({ url: `https://brave.test/${index}`, title: `B${index}`, description: `Evidencia de Brave suficientemente larga ${index}` })) },
}))): { provider: BraveSearchProvider; fetchMock: typeof fetchMock } {
  return { provider: new BraveSearchProvider({ apiKey: "brave-key", fetch: fetchMock as unknown as typeof fetch }), fetchMock };
}

function firecrawl(results: number): { provider: FirecrawlProvider; fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn(async (input: unknown) => String(input).includes("/scrape")
    ? json({ data: { markdown: "Contenido profundo extraído por Firecrawl con mucho más detalle que el snippet original." } })
    : json({ data: Array.from({ length: results }, (_, index) => ({ url: `https://firecrawl.test/${index}`, title: `F${index}`, description: `Snippet corto de Firecrawl ${index}` })) }));
  return { provider: new FirecrawlProvider({ apiKey: "firecrawl-key", fetch: fetchMock as unknown as typeof fetch }), fetchMock };
}

describe("Phase 20.4 market research acquisition", () => {
  it("integra los cinco proveedores reales aplicando los límites antes de la red", async () => {
    const youtube = youtubeClient(3);
    const tavilyClient = tavily(6);
    const exaClient = exa(6);
    const braveClient = brave(6);
    const firecrawlClient = firecrawl(6);
    const clients: MarketResearchClients = {
      youtube,
      tavily: tavilyClient.provider,
      exa: exaClient.provider,
      brave: braveClient.provider,
      firecrawl: firecrawlClient.provider,
    };

    const result = await acquireMarketResearchSignals(clients, { topic: TOPIC, retrievedAt });

    expect(result.providers.map((report) => report.provider)).toEqual(["youtube", "tavily", "exa", "brave", "firecrawl"]);
    expect(result.providers.every((report) => report.state === "available" && report.failure === null)).toBe(true);
    expect(result.providers.find((report) => report.provider === "tavily")).toMatchObject({ requested: 5, returned: 5, valid: 5, unique: 5 });
    expect(result.providers.find((report) => report.provider === "youtube")).toMatchObject({ requested: MARKET_RESEARCH_BUDGETS.youtubeTargetComments, returned: 3, valid: 3, unique: 3 });
    expect(result.metrics).toMatchObject({ validSignals: 23, uniqueSignals: 23, analyzedSignals: 23, discardedByAnalysisBudget: 0, duplicatesRemoved: 0 });
    expect(result.signals).toHaveLength(23);
    expect(result.signals.filter((signal) => signal.provider === "youtube")).toHaveLength(3);
    expect(result.signals.filter((signal) => signal.provider === "youtube").every((signal) => signal.youtube?.query === TOPIC)).toBe(true);

    // Budgets are applied at the network boundary, not merely post-filtered.
    expect(JSON.parse(String((tavilyClient.fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ max_results: 5 });
    expect(JSON.parse(String((exaClient.fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ numResults: 5 });
    expect((braveClient.fetchMock.mock.calls[0] as unknown as [URL])[0].searchParams.get("count")).toBe("5");
    expect(youtube.listCommentThreads).toHaveBeenCalledWith({ videoId: "dQw4w9WgXcQ", maxResults: MARKET_RESEARCH_BUDGETS.youtubeCommentPageSize });
    const firecrawlSearch = firecrawlClient.fetchMock.mock.calls.find((call) => !String(call[0]).includes("/scrape")) as unknown as [string, RequestInit];
    expect(JSON.parse(String(firecrawlSearch[1].body))).toMatchObject({ limit: 5, sources: ["web"] });

    // Deep extraction happens only after dedupe, on at most two selected URLs.
    const scrapes = firecrawlClient.fetchMock.mock.calls.filter((call) => String(call[0]).includes("/scrape"));
    expect(scrapes).toHaveLength(MARKET_RESEARCH_BUDGETS.firecrawlScrapePages);
    expect(scrapes).toHaveLength(2);
    expect(result.metrics.deepenedSignals).toBeGreaterThan(0);
    expect(result.providers.find((report) => report.provider === "firecrawl")?.scrapedPages).toBe(2);
  });

  it("aísla el fallo de un proveedor y mantiene el resto de la investigación", async () => {
    const failing = new ExaProvider({ apiKey: "exa-key", fetch: (async () => json({ error: { type: "invalid_api_key", message: "exa-key" } }, 401)) as unknown as typeof fetch });
    const clients: MarketResearchClients = { youtube: youtubeClient(2), tavily: tavily(2).provider, exa: failing };

    const result = await acquireMarketResearchSignals(clients, { topic: TOPIC, retrievedAt });
    const exaReport = result.providers.find((report) => report.provider === "exa");

    expect(exaReport).toMatchObject({ state: "temporary_error", valid: 0, unique: 0 });
    expect(exaReport?.failure).toBe("authentication_failed");
    expect(JSON.stringify(result)).not.toContain("exa-key");
    expect(result.metrics.analyzedSignals).toBe(4);
    expect(result.providers.filter((report) => report.failure === null)).toHaveLength(2);
  });

  it("continúa cuando varios proveedores fallan y no llama a los no configurados", async () => {
    const unconfiguredFetch = vi.fn();
    const clients: MarketResearchClients = {
      youtube: youtubeClient(2),
      tavily: new TavilyProvider({ fetch: unconfiguredFetch as unknown as typeof fetch }),
      exa: new ExaProvider({ apiKey: "exa-key", fetch: (async () => { throw new TypeError("socket"); }) as unknown as typeof fetch }),
      brave: new BraveSearchProvider({ apiKey: "brave-key", fetch: (async () => json({}, 429)) as unknown as typeof fetch }),
    };

    const result = await acquireMarketResearchSignals(clients, { topic: TOPIC, retrievedAt });

    expect(result.providers.find((report) => report.provider === "tavily")).toMatchObject({ state: "not_configured", failure: null, latencyMs: 0 });
    expect(result.providers.find((report) => report.provider === "exa")?.failure).toBe("network_error");
    expect(result.providers.find((report) => report.provider === "brave")?.failure).toBe("rate_limited");
    expect(unconfiguredFetch).not.toHaveBeenCalled();
    expect(result.metrics.analyzedSignals).toBe(2);
  });

  it("aplica dedupe determinista por identidad antes del presupuesto de análisis", async () => {
    const shared = (host: string) => vi.fn(async () => json(host === "tavily"
      ? { results: [{ url: "https://shared.test/a", title: "A", content: "Evidencia compartida entre proveedores distintos" }] }
      : { results: [{ url: "https://shared.test/a", title: "A", text: "Evidencia compartida entre proveedores distintos" }] }));
    const clients: MarketResearchClients = {
      tavily: new TavilyProvider({ apiKey: "tavily-key", fetch: shared("tavily") as unknown as typeof fetch }),
      exa: new ExaProvider({ apiKey: "exa-key", fetch: shared("exa") as unknown as typeof fetch }),
    };

    const result = await acquireMarketResearchSignals(clients, { topic: TOPIC, retrievedAt });

    expect(result.metrics).toMatchObject({ validSignals: 2, uniqueSignals: 1, duplicatesRemoved: 1, analyzedSignals: 1 });
    expect(result.providers.find((report) => report.provider === "exa")).toMatchObject({ valid: 1, unique: 0, duplicates: 1 });
    expect(result.signals.map((signal) => signal.id)).toEqual(["S1"]);
  });

  it("colapsa el mismo documento web aunque un proveedor devuelva ID estable y otro no", async () => {
    // Exa devuelve id (sourceId "exa:<id>") y Brave no: sin identidad secundaria
    // de documento, la misma página contaría como dos proveedores independientes.
    const clients: MarketResearchClients = {
      exa: new ExaProvider({
        apiKey: "exa-key",
        fetch: (async () => json({ results: [{ id: "doc-1", url: "https://www.shared.test/guia/", title: "G", text: "Evidencia del mismo documento web compartido" }] })) as unknown as typeof fetch,
      }),
      brave: new BraveSearchProvider({
        apiKey: "brave-key",
        fetch: (async () => json({ web: { results: [{ url: "https://shared.test/guia", title: "G", description: "Evidencia del mismo documento web compartido" }] } })) as unknown as typeof fetch,
      }),
    };

    const result = await acquireMarketResearchSignals(clients, { topic: TOPIC, retrievedAt });

    expect(result.metrics).toMatchObject({ validSignals: 2, uniqueSignals: 1, duplicatesRemoved: 1, analyzedSignals: 1 });
    expect(result.signals).toHaveLength(1);
    expect(result.providers.find((report) => report.provider === "brave")).toMatchObject({ valid: 1, unique: 0, duplicates: 1 });
  });

  it("no deja que un snippet inservible bloquee una extracción útil del mismo documento", async () => {
    const clients: MarketResearchClients = {
      tavily: new TavilyProvider({
        apiKey: "tavily-key",
        fetch: (async () => json({ results: [{ url: "https://shared.test/guia", title: "G", content: "cookies" }] })) as unknown as typeof fetch,
      }),
      exa: new ExaProvider({
        apiKey: "exa-key",
        fetch: (async () => json({ results: [{ url: "https://shared.test/guia", title: "G", text: "Evidencia útil y suficientemente detallada del documento compartido." }] })) as unknown as typeof fetch,
      }),
    };

    const result = await acquireMarketResearchSignals(clients, { topic: TOPIC, retrievedAt });

    expect(result.metrics).toMatchObject({ validSignals: 2, uniqueSignals: 1, duplicatesRemoved: 0, analyzedSignals: 1 });
    expect(result.signals).toMatchObject([{ provider: "exa", text: "Evidencia útil y suficientemente detallada del documento compartido." }]);
  });

  it("conserva comentarios distintos de YouTube que comparten la URL del vídeo", async () => {
    const clients: MarketResearchClients = { youtube: youtubeClient(3) };

    const result = await acquireMarketResearchSignals(clients, { topic: TOPIC, retrievedAt });

    expect(result.metrics).toMatchObject({ validSignals: 3, uniqueSignals: 3, duplicatesRemoved: 0 });
    expect(new Set(result.signals.map((signal) => signal.url)).size).toBe(1);
  });

  it("recorta el texto de cada señal al presupuesto de análisis y descarta contenido inservible", async () => {
    const long = "d".repeat(4_000);
    const clients: MarketResearchClients = {
      tavily: new TavilyProvider({
        apiKey: "tavily-key",
        fetch: (async () => json({ results: [
          { url: "https://tavily.test/long", title: "L", content: long },
          { url: "https://tavily.test/short", title: "S", content: "corto" },
        ] })) as unknown as typeof fetch,
      }),
    };

    const result = await acquireMarketResearchSignals(clients, { topic: TOPIC, retrievedAt });

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.text).toHaveLength(MARKET_RESEARCH_BUDGETS.analysisSignalChars);
    expect(result.signals[0]?.text.length).toBeLessThanOrEqual(1_500);
  });

  it("permite restringir proveedores sin ampliar límites ni activar los ausentes", async () => {
    const tavilyClient = tavily(6);
    const exaClient = exa(6);
    const clients: MarketResearchClients = { tavily: tavilyClient.provider, exa: exaClient.provider };

    const result = await acquireMarketResearchSignals(clients, { topic: TOPIC, retrievedAt, providers: ["tavily", "firecrawl"] });

    expect(result.providers.map((report) => report.provider)).toEqual(["tavily"]);
    expect(exaClient.fetchMock).not.toHaveBeenCalled();
    expect(result.providers[0]).toMatchObject({ requested: 5, valid: 5 });
  });

  it("normaliza el texto de análisis de forma determinista", () => {
    expect(boundedAnalysisText("  Cookies\nDolor real del mercado\r\n\r\nSubscribe  ")).toBe("Dolor real del mercado");
    expect(boundedAnalysisText("x".repeat(2_000))).toHaveLength(MARKET_RESEARCH_BUDGETS.analysisSignalChars);
  });
});
