import {
  MARKET_RESEARCH_BUDGETS,
  groupMarketResearchFindings,
  marketResearchAnalyzerLabel,
  marketResearchFindingCategoryLabel,
  marketResearchFindingEvidence,
  marketResearchProviderLabel,
  marketResearchProviderStateLabel,
  summarizeMarketResearchRun,
  type Generation,
  type LlmGenerateRequest,
  type LlmGenerateResult,
  type MarketResearchRun,
  type MarketResearchSignal,
  type MarketResearchStatus,
  type Project,
} from "@our-platform/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { DEEPSEEK_DEFAULT_MODEL, DeepSeekProvider } from "../src/integrations/deepseek-provider.js";
import { IntegrationError } from "../src/integrations/integration-error.js";
import type { WebDiscoveryProvider } from "../src/integrations/web-discovery.js";
import { GEMINI_ANALYSIS_MODEL } from "../src/services/module-service.js";
import {
  mineMarketResearchFindings,
  type MarketResearchAnalyzerClient,
} from "../src/services/market-research-semantic-miner.js";

const referenceAt = "2026-03-01T00:00:00.000Z";

function signal(index: number, overrides: Partial<MarketResearchSignal> = {}): MarketResearchSignal {
  return {
    id: `S${index}`,
    provider: "tavily",
    source: "web",
    sourceId: `tavily:${index}`,
    url: `https://tavily.test/${index}`,
    capturedAt: "2026-02-20T00:00:00.000Z",
    text: `Evidencia normalizada número ${index} con dolor explícito`,
    deepened: false,
    ...overrides,
  };
}

function analyzer(output: unknown, options: { readonly configured?: boolean } = {}): MarketResearchAnalyzerClient & { readonly generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn(async (): Promise<LlmGenerateResult<unknown>> => ({
    provider: "test",
    requestedModel: "test-model",
    output,
    usage: { inputTokens: 120, outputTokens: 45, usageKind: "provider_reported" },
  }));
  return { configured: options.configured ?? true, generate: generate as unknown as MarketResearchAnalyzerClient["generate"] } as MarketResearchAnalyzerClient & { readonly generate: ReturnType<typeof vi.fn> };
}

function failingAnalyzer(error: unknown): MarketResearchAnalyzerClient & { readonly generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn(async () => { throw error; });
  return { configured: true, generate: generate as unknown as MarketResearchAnalyzerClient["generate"] } as MarketResearchAnalyzerClient & { readonly generate: ReturnType<typeof vi.fn> };
}

const findingsOutput = {
  findings: [
    { category: "pains", statement: "Los usuarios pierden tiempo buscando fotos duplicadas", customerLanguage: "no encuentro nada", signalIds: ["S1", "S2"] },
    { category: "risks", statement: "Existe miedo a borrar recuerdos al depurar", customerLanguage: "", signalIds: ["S2"] },
  ],
};

describe("Phase 20.4 semantic mining", () => {
  it("usa DeepSeek como primario, valida evidencia y nunca invoca Gemini tras un éxito", async () => {
    const primary = analyzer(findingsOutput);
    const fallback = analyzer({ findings: [] });
    const signals = [signal(1), signal(2, { provider: "brave", sourceId: null, url: "https://brave.test/2" })];

    const result = await mineMarketResearchFindings({
      topic: "organización de fotografías",
      signals,
      referenceAt,
      primary: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, client: primary },
      fallback: { analyzer: "gemini", model: GEMINI_ANALYSIS_MODEL, client: fallback },
    });

    expect(primary.generate).toHaveBeenCalledOnce();
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(result.analysis).toMatchObject({
      analyzer: "deepseek",
      model: DEEPSEEK_DEFAULT_MODEL,
      fallbackUsed: false,
      primaryFailure: null,
      analyzedSignals: 2,
      rejectedClaims: 0,
      inputTokens: 120,
      outputTokens: 45,
    });
    const pain = result.findings.find((finding) => finding.category === "pains");
    expect(pain).toMatchObject({
      signalIds: ["S1", "S2"],
      supportingSignals: 2,
      independentProviders: 2,
      domainDiversity: 2,
      confidence: "cross_provider",
      repeatedEvidence: true,
      contradictingSignals: 1,
    });
    const request = primary.generate.mock.calls[0]?.[0] as LlmGenerateRequest;
    expect(request.model).toBe(DEEPSEEK_DEFAULT_MODEL);
    expect(request.maxOutputTokens).toBe(MARKET_RESEARCH_BUDGETS.analysisMaxOutputTokens);
  });

  it("recurre a Gemini sólo cuando el proveedor primario falla", async () => {
    const primary = failingAnalyzer(new IntegrationError("http_provider_error", "DeepSeek respondió con HTTP 500"));
    const fallback = analyzer(findingsOutput);

    const result = await mineMarketResearchFindings({
      topic: "organización de fotografías",
      signals: [signal(1), signal(2)],
      referenceAt,
      primary: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, client: primary },
      fallback: { analyzer: "gemini", model: GEMINI_ANALYSIS_MODEL, client: fallback },
    });

    expect(primary.generate).toHaveBeenCalledOnce();
    expect(fallback.generate).toHaveBeenCalledOnce();
    expect(result.analysis).toMatchObject({
      analyzer: "gemini",
      model: GEMINI_ANALYSIS_MODEL,
      fallbackUsed: true,
      primaryFailure: "http_provider_error",
      failure: null,
    });
    expect(result.findings).toHaveLength(2);
  });

  it("descarta claims sin respaldo y no analiza dos veces el mismo payload", async () => {
    const primary = analyzer({
      findings: [
        { category: "pains", statement: "Dolor válido respaldado", customerLanguage: "", signalIds: ["S1", "S99"] },
        { category: "inventado", statement: "Categoría inexistente", customerLanguage: "", signalIds: ["S1"] },
        { category: "desires", statement: "   ", customerLanguage: "", signalIds: ["S1"] },
        { category: "desires", statement: "Sin evidencia citada", customerLanguage: "", signalIds: ["S42"] },
        "no es un objeto",
      ],
    });
    const fallback = analyzer(findingsOutput);

    const result = await mineMarketResearchFindings({
      topic: "organización de fotografías",
      signals: [signal(1)],
      referenceAt,
      primary: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, client: primary },
      fallback: { analyzer: "gemini", model: GEMINI_ANALYSIS_MODEL, client: fallback },
    });

    expect(fallback.generate).not.toHaveBeenCalled();
    expect(result.analysis).toMatchObject({ analyzer: "deepseek", rejectedClaims: 4 });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ signalIds: ["S1"], supportingSignals: 1, confidence: "single_signal" });
  });

  it("sólo muestra citas que aparecen literalmente en la evidencia citada", async () => {
    const primary = analyzer({
      findings: [
        { category: "pains", statement: "Cita verificable", customerLanguage: "dolor explícito", signalIds: ["S1"] },
        { category: "desires", statement: "Cita inventada", customerLanguage: "pagaría lo que sea por esto", signalIds: ["S1"] },
      ],
    });

    const result = await mineMarketResearchFindings({
      topic: "organización de fotografías",
      signals: [signal(1)],
      referenceAt,
      primary: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, client: primary },
      fallback: { analyzer: "gemini", model: GEMINI_ANALYSIS_MODEL, client: analyzer({ findings: [] }) },
    });

    expect(result.findings.find((finding) => finding.statement === "Cita verificable")?.customerLanguage).toBe("dolor explícito");
    expect(result.findings.find((finding) => finding.statement === "Cita inventada")?.customerLanguage).toBeNull();
  });

  it("limita la entrada semántica a 20 señales y respeta el corte de texto", async () => {
    const primary = analyzer({ findings: [] });
    const signals = Array.from({ length: 25 }, (_, index) => signal(index + 1, { text: "y".repeat(MARKET_RESEARCH_BUDGETS.analysisSignalChars) }));

    const result = await mineMarketResearchFindings({
      topic: "organización de fotografías",
      signals,
      referenceAt,
      primary: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, client: primary },
      fallback: { analyzer: "gemini", model: GEMINI_ANALYSIS_MODEL, client: analyzer({ findings: [] }) },
    });

    const payload = JSON.parse(String((primary.generate.mock.calls[0]?.[0] as LlmGenerateRequest).input)) as { signals: Array<{ text: string }> };
    expect(payload.signals).toHaveLength(MARKET_RESEARCH_BUDGETS.analysisSignals);
    expect(payload.signals.every((item) => item.text.length <= MARKET_RESEARCH_BUDGETS.analysisSignalChars)).toBe(true);
    expect(result.analysis.analyzedSignals).toBe(20);
  });

  it("informa la ausencia de analizadores sin inventar hallazgos", async () => {
    const result = await mineMarketResearchFindings({
      topic: "organización de fotografías",
      signals: [signal(1)],
      referenceAt,
      primary: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, client: undefined },
      fallback: { analyzer: "gemini", model: GEMINI_ANALYSIS_MODEL, client: analyzer({ findings: [] }, { configured: false }) },
    });

    expect(result.findings).toEqual([]);
    expect(result.analysis).toMatchObject({ analyzer: null, primaryFailure: "missing_api_key" });
  });

  it("bloquea DeepSeek V4 Pro antes de cualquier red", () => {
    expect(() => new DeepSeekProvider({ apiKey: "k", model: "deepseek-v4-pro" })).toThrow(IntegrationError);
    expect(() => new DeepSeekProvider({ apiKey: "k", model: "DeepSeek V4 Pro" })).toThrowError(/V4 Pro/);
    expect(new DeepSeekProvider({ apiKey: "k" }).effectiveModel).toBe("deepseek-v4-flash");
  });
});

describe("Phase 20.4 market research route", () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const webDouble = (): WebDiscoveryProvider => ({
    name: "tavily",
    configured: true,
    discover: async () => ({
      results: [
        { url: "https://tavily.test/a", title: "A", text: "Los usuarios pierden tiempo buscando fotos duplicadas" },
        { url: "https://tavily.test/b", title: "B", text: "Quieren una rutina mensual sostenible de respaldo" },
      ],
      metadata: { status: 200, resultCount: 2, usage: 2 },
    }),
  });

  async function createResearchApp(analyzers: Parameters<typeof createApp>[0]["marketResearch"] extends infer T ? T extends { analyzers?: infer A } ? A : never : never) {
    return createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      marketResearch: { clients: { tavily: webDouble() }, analyzers, now: () => new Date(referenceAt) },
    });
  }

  it("expone estado de proveedores, ejecuta la investigación real y no filtra secretos", async () => {
    const primary = analyzer(findingsOutput);
    app = await createResearchApp({ deepSeek: Object.assign(primary, { effectiveModel: DEEPSEEK_DEFAULT_MODEL }), gemini: analyzer({ findings: [] }) });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Investigación", niche: "Fotografía" } })).json<Project>();

    const status = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/market-research/status` })).json<MarketResearchStatus>();
    expect(status.providers.map((provider) => provider.provider)).toEqual(["youtube", "tavily", "exa", "brave", "firecrawl"]);
    expect(status.providers.find((provider) => provider.provider === "tavily")).toMatchObject({ state: "available", budget: 5 });
    expect(status.providers.find((provider) => provider.provider === "exa")).toMatchObject({ state: "not_configured" });
    expect(status.analyzers.primary).toMatchObject({ analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, state: "available" });
    expect(status.analyzers.fallback).toMatchObject({ analyzer: "gemini", model: GEMINI_ANALYSIS_MODEL });
    expect(status.budgets).toMatchObject({ analysisSignals: 20, analysisSignalChars: 1_500, firecrawlScrapePages: 2 });

    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/market-research`, payload: { topic: "organización de fotografías digitales" } });
    expect(response.statusCode).toBe(200);
    const run = response.json<MarketResearchRun>();
    expect(run).toMatchObject({ topic: "organización de fotografías digitales", projectId: project.id });
    expect(run.metrics).toMatchObject({ validSignals: 2, uniqueSignals: 2, analyzedSignals: 2, duplicatesRemoved: 0 });
    expect(run.analysis).toMatchObject({ analyzer: "deepseek", fallbackUsed: false });
    expect(run.signals.map((item) => item.id)).toEqual(["S1", "S2"]);
    expect(run.findings.length).toBeGreaterThan(0);
    const payload = JSON.stringify(run);
    for (const secret of ["authorization", "Bearer", "apiKey", "api_key"]) expect(payload.toLowerCase()).not.toContain(secret.toLowerCase());

    // Persistence reuses the existing generation ledger; no new tables required.
    const generations = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/generations` })).json<{ generations: Generation[] }>();
    const persisted = generations.generations.find((generation) => generation.agentKey === "market_research");
    expect(persisted).toMatchObject({ provider: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, status: "COMPLETED", inputTokens: 120, outputTokens: 45 });
  });

  it("valida el tema y el proyecto sin ejecutar proveedores", async () => {
    const primary = analyzer(findingsOutput);
    app = await createResearchApp({ deepSeek: Object.assign(primary, { effectiveModel: DEEPSEEK_DEFAULT_MODEL }), gemini: analyzer({ findings: [] }) });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Investigación", niche: "Fotografía" } })).json<Project>();

    expect((await app.inject({ method: "POST", url: `/api/projects/${project.id}/market-research`, payload: { topic: "ab" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/api/projects/${project.id}/market-research`, payload: { topic: "tema válido", providers: ["invalido"] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/projects/019ff678-1319-71c2-a129-3294c901efbc/market-research/status" })).statusCode).toBe(404);
    expect(primary.generate).not.toHaveBeenCalled();
  });
});

describe("Phase 20.4 Research UI derivations", () => {
  const run: MarketResearchRun = {
    runId: "run-1",
    projectId: "019ff678-1319-71c2-a129-3294c901efbc",
    topic: "organización de fotografías",
    startedAt: referenceAt,
    completedAt: referenceAt,
    durationMs: 1_200,
    providers: [
      { provider: "youtube", state: "available", requested: 10, returned: 3, valid: 3, unique: 3, duplicates: 0, analyzed: 3, scrapedPages: 0, latencyMs: 10, failure: null, usage: null, credits: null },
      { provider: "tavily", state: "available", requested: 5, returned: 5, valid: 5, unique: 5, duplicates: 0, analyzed: 5, scrapedPages: 0, latencyMs: 12, failure: null, usage: 3, credits: null },
      { provider: "exa", state: "temporary_error", requested: 5, returned: 0, valid: 0, unique: 0, duplicates: 0, analyzed: 0, scrapedPages: 0, latencyMs: 8, failure: "http_rate_limit", usage: null, credits: null },
      { provider: "brave", state: "not_configured", requested: 5, returned: 0, valid: 0, unique: 0, duplicates: 0, analyzed: 0, scrapedPages: 0, latencyMs: 0, failure: null, usage: null, credits: null },
      { provider: "firecrawl", state: "available", requested: 5, returned: 5, valid: 5, unique: 4, duplicates: 1, analyzed: 4, scrapedPages: 2, latencyMs: 30, failure: null, usage: 2, credits: null },
    ],
    metrics: { requestedSignals: 30, returnedSignals: 13, validSignals: 13, uniqueSignals: 12, duplicatesRemoved: 1, analyzedSignals: 12, discardedByAnalysisBudget: 0, deepenedSignals: 2 },
    analysis: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, fallbackUsed: false, primaryFailure: null, analyzedSignals: 12, rejectedClaims: 1, inputTokens: 100, outputTokens: 50, failure: null },
    findings: [
      { id: "F1", category: "pains", statement: "Pierden tiempo buscando fotos", customerLanguage: "no encuentro nada", signalIds: ["S1", "S2"], supportingSignals: 2, independentProviders: 2, domainDiversity: 2, recentSignals: 2, repeatedEvidence: true, contradictingSignals: 0, confidence: "cross_provider" },
      { id: "F2", category: "risks", statement: "Miedo a borrar recuerdos", customerLanguage: null, signalIds: ["S2"], supportingSignals: 1, independentProviders: 1, domainDiversity: 1, recentSignals: 1, repeatedEvidence: false, contradictingSignals: 0, confidence: "single_signal" },
    ],
    signals: [signal(1), signal(2, { provider: "youtube", source: "youtube" })],
  };

  it("resume el estado de proveedores para la interfaz", () => {
    expect(marketResearchProviderLabel("firecrawl")).toBe("Firecrawl");
    expect(run.providers.map((provider) => marketResearchProviderStateLabel(provider.state))).toEqual([
      "Disponible", "Disponible", "Error temporal", "No configurado", "Disponible",
    ]);
    expect(marketResearchAnalyzerLabel("deepseek")).toBe("DeepSeek V4 Flash");
  });

  it("resume el resultado completado y mantiene la evidencia inspeccionable", () => {
    expect(summarizeMarketResearchRun(run)).toMatchObject({
      totalFound: 13,
      valid: 13,
      unique: 12,
      analyzed: 12,
      providersUsed: ["youtube", "tavily", "firecrawl"],
      providersFailed: ["exa"],
      analysisLabel: "DeepSeek V4 Flash",
      findingCount: 2,
    });
    expect(groupMarketResearchFindings(run).map(([category]) => marketResearchFindingCategoryLabel(category))).toEqual(["Dolores", "Riesgos"]);
    expect(marketResearchFindingEvidence(run, run.findings[0]!).map((item) => item.id)).toEqual(["S1", "S2"]);
    expect(marketResearchFindingEvidence(run, run.findings[1]!).map((item) => item.provider)).toEqual(["youtube"]);
  });
});
