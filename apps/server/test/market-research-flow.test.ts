import {
  MARKET_RESEARCH_BUDGETS,
  filterMarketResearchSignalEvidence,
  groupMarketResearchFindings,
  marketResearchAnalyzerLabel,
  marketResearchEvidenceFilterLabel,
  marketResearchEvidenceFilters,
  marketResearchFindingCategoryLabel,
  marketResearchFindingEvidence,
  marketResearchProviderLabel,
  marketResearchProviderStateLabel,
  marketResearchSignalEvidence,
  marketResearchSignalSourceLabel,
  researchTopicDefault,
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
    expect(new DeepSeekProvider({ apiKey: "k" }).effectiveModel).toBe("deepseek-flash");
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
    expect(status.providers.find((provider) => provider.provider === "tavily")).toMatchObject({ state: "available", budget: 20 });
    expect(status.providers.find((provider) => provider.provider === "exa")).toMatchObject({ state: "not_configured" });
    expect(status.analyzers.primary).toMatchObject({ analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, state: "available" });
    expect(status.analyzers.fallback).toMatchObject({ analyzer: "gemini", model: GEMINI_ANALYSIS_MODEL });
    expect(status.budgets).toMatchObject({ analysisSignals: 20, analysisSignalChars: 1_500, firecrawlScrapePages: 8 });

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

  it("conserva todas las señales web únicas aunque el análisis use una muestra", async () => {
    const primary = analyzer(findingsOutput);
    const web = (name: string): WebDiscoveryProvider => ({
      name,
      configured: true,
      discover: async (_query, { maxResults } = {}) => {
        const results = Array.from({ length: maxResults ?? 0 }, (_, index) => ({
          url: `https://${name}.test/${index}`,
          title: `Fuente ${index}`,
          text: `Los usuarios pierden tiempo organizando fotos de la colección ${index} en ${name}.`,
        }));
        return { results, metadata: { status: 200, resultCount: results.length } };
      },
    });
    app = await createApp({
      databasePath: ":memory:",
      marketResearch: { clients: { tavily: web("tavily"), exa: web("exa") }, analyzers: { deepSeek: primary } },
    });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Evidencia completa", niche: "Fotografía" } })).json<Project>();
    const path = `/api/projects/${project.id}/market-research`;
    const response = await app.inject({ method: "POST", url: path, payload: { topic: "organización de fotografías digitales", providers: ["tavily", "exa"] } });
    expect(response.statusCode).toBe(200);
    const run = response.json<MarketResearchRun>();
    expect(run.metrics).toMatchObject({ uniqueSignals: 40, analyzedSignals: 20, discardedByAnalysisBudget: 20 });
    expect(run.signals).toHaveLength(40);
    const evidence = marketResearchSignalEvidence(run);
    for (const provider of ["tavily", "exa"] as const) {
      expect(filterMarketResearchSignalEvidence(evidence, provider)).toHaveLength(20);
      expect(run.providers.find(report => report.provider === provider)).toMatchObject({ returned: 20, unique: 20, analyzed: 10 });
    }
    expect(primary.generate).toHaveBeenCalledOnce();
    const { signals } = JSON.parse(String((primary.generate.mock.calls[0]?.[0] as LlmGenerateRequest).input)) as { signals: unknown[] };
    expect(signals).toHaveLength(20);
    expect((await app.inject({ method: "GET", url: `${path}/latest` })).json()).toEqual(run);
  });

  it("adjunta el Markdown del mismo proyecto a su investigación guardada sin repetir el análisis", async () => {
    const primary = analyzer(findingsOutput);
    app = await createResearchApp({ deepSeek: primary });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Investigación con informe", niche: "Fotografía" } })).json<Project>();
    const other = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Otro proyecto", niche: "Fotografía" } })).json<Project>();
    const projectPath = `/api/projects/${project.id}`;
    const run = (await app.inject({ method: "POST", url: `${projectPath}/market-research`, payload: { topic: "organización de fotografías digitales" } })).json<MarketResearchRun>();
    const supplementPath = `${projectPath}/market-research/${run.runId}/supplement`;
    const library = (await app.inject({ method: "POST", url: `${projectPath}/knowledge/libraries`, payload: { name: "Archivo del estudio", scope: "PROJECT" } })).json<{ id: string }>();
    await app.inject({ method: "PUT", url: `${projectPath}/knowledge/libraries/${library.id}/selection`, payload: { enabled: false } });

    const markdown = "# Investigación ampliada\n\nInforme complementario con evidencia independiente.";
    const uploaded = await app.inject({
      method: "POST", url: `${projectPath}/knowledge/libraries/${library.id}/documents`,
      payload: { title: "Informe", fileType: "md", filename: "informe.md", contentBase64: Buffer.from(markdown).toString("base64") },
    });
    expect(uploaded.statusCode).toBe(201);
    const documentId = uploaded.json<{ id: string }>().id;

    const unattached = await app.inject({ method: "GET", url: supplementPath });
    expect(unattached.statusCode).toBe(200);
    expect(unattached.json()).toBeNull();
    expect((await app.inject({
      method: "PUT", url: `/api/projects/${other.id}/market-research/${run.runId}/supplement`, payload: { documentId },
    })).statusCode).toBe(404);

    const attached = await app.inject({ method: "PUT", url: supplementPath, payload: { documentId } });
    expect(attached.statusCode).toBe(200);
    expect(attached.json()).toEqual({ documentId, title: "Informe", markdown });
    expect((await app.inject({ method: "GET", url: supplementPath })).json()).toEqual(attached.json());
    expect((await app.inject({ method: "GET", url: `${projectPath}/market-research/latest` })).json()).toEqual(run);
    expect(primary.generate).toHaveBeenCalledOnce();

    expect((await app.inject({ method: "DELETE", url: `${projectPath}/knowledge/documents/${documentId}` })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: supplementPath })).json()).toBeNull();
  });

  it("rechaza antes de adquirir señales si no hay analizador configurado", async () => {
    const discover = vi.fn(webDouble().discover);
    app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      marketResearch: {
        clients: { tavily: { name: "tavily", configured: true, discover } },
        analyzers: {},
        now: () => new Date(referenceAt),
      },
    });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Sin analizador", niche: "Fotografía" } })).json<Project>();

    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/market-research`, payload: { topic: "fotos guardadas", providers: ["tavily"] } });
    expect(response.statusCode).toBe(503);
    expect(discover).not.toHaveBeenCalled();
    expect((await app.inject({ method: "GET", url: `/api/projects/${project.id}/generations` })).json<{ generations: Generation[] }>().generations).toEqual([]);
  });

  it("conserva una investigación fallida tras recargar latest e history", async () => {
    const discover = vi.fn(webDouble().discover);
    const primary = failingAnalyzer(new Error("analyzer unavailable"));
    const fallback = failingAnalyzer(new Error("fallback unavailable"));
    app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      marketResearch: {
        clients: { tavily: { name: "tavily", configured: true, discover } },
        analyzers: { deepSeek: primary, gemini: fallback },
        now: () => new Date(referenceAt),
      },
    });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Fallida", niche: "Fotografía" } })).json<Project>();

    const created = (await app.inject({ method: "POST", url: `/api/projects/${project.id}/market-research`, payload: { topic: "fotos guardadas", providers: ["tavily"] } })).json<MarketResearchRun>();
    expect(created.analysis.analyzer).toBeNull();
    expect(created.analysis.failure).not.toBeNull();
    expect(created.findings).toEqual([]);
    const generations = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/generations` })).json<{ generations: Generation[] }>();
    expect(generations.generations.find((generation) => generation.agentKey === "market_research")?.status).toBe("FAILED");
    discover.mockClear();
    primary.generate.mockClear();
    fallback.generate.mockClear();

    expect((await app.inject({ method: "GET", url: `/api/projects/${project.id}/market-research/latest` })).json()).toEqual(created);
    expect((await app.inject({ method: "GET", url: `/api/projects/${project.id}/market-research/history` })).json()).toEqual({ runs: [created] });
    expect(discover).not.toHaveBeenCalled();
    expect(primary.generate).not.toHaveBeenCalled();
    expect(fallback.generate).not.toHaveBeenCalled();
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


describe("Phase 20.5 persisted Market Research reads", () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("restores only validated completed Market Research runs without provider or LLM calls", async () => {
    const [{ AppDatabase }, { ProjectRepository }, { MarketResearchService, MARKET_RESEARCH_AGENT_KEY }] = await Promise.all([
      import("../src/database/database.js"),
      import("../src/repositories/project-repository.js"),
      import("../src/services/market-research-service.js"),
    ]);
    const database = new AppDatabase(":memory:");
    try {
      const projects = new ProjectRepository(database);
      const project = projects.create({ name: "Persistencia", niche: "Fotografía" });
      const otherProject = projects.create({ name: "Aislado", niche: "Música" });
      const noRunsProject = projects.create({ name: "Vacío", niche: "Cocina" });
      const discover = vi.fn();
      const primary = analyzer({ findings: [] });
      const reader = new MarketResearchService(database, {
        clients: { tavily: { name: "tavily", configured: true, discover: discover as WebDiscoveryProvider["discover"] } },
        analyzers: { deepSeek: Object.assign(primary, { effectiveModel: DEEPSEEK_DEFAULT_MODEL }) },
      });
      const persistedRun = (runId: string, topic: string, completedAt: string, projectId = project.id): MarketResearchRun => ({
        runId,
        projectId,
        topic,
        startedAt: completedAt,
        completedAt,
        durationMs: 1,
        providers: [{ provider: "tavily", state: "available", requested: 5, returned: 1, valid: 1, unique: 1, duplicates: 0, analyzed: 1, scrapedPages: 0, latencyMs: 1, failure: null, usage: null, credits: null }],
        metrics: { requestedSignals: 5, returnedSignals: 1, validSignals: 1, uniqueSignals: 1, duplicatesRemoved: 0, analyzedSignals: 1, discardedByAnalysisBudget: 0, deepenedSignals: 0 },
        analysis: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, fallbackUsed: false, primaryFailure: null, analyzedSignals: 1, rejectedClaims: 0, inputTokens: 1, outputTokens: 1, failure: null },
        findings: [],
        signals: [signal(1)],
      });
      const insert = (run: MarketResearchRun, options: { status?: "COMPLETED"|"FAILED"|"RUNNING"; agentKey?: string; output?: string; generationProjectId?: string } = {}) => {
        database.connection.prepare(`
          INSERT INTO generations (
            id, project_id, agent_key, provider, model, status, input_snapshot, output_data,
            prompt_version, input_tokens, output_tokens, estimated_cost, duration_ms,
            error_code, error_message, created_at, completed_at
          ) VALUES (?, ?, ?, 'deepseek', 'deepseek-v4-flash', ?, ?, ?, 'market-research-v1', 0, 0, 0, 1, NULL, NULL, ?, ?)
        `).run(
          run.runId, options.generationProjectId ?? project.id, options.agentKey ?? MARKET_RESEARCH_AGENT_KEY,
          options.status ?? "COMPLETED", JSON.stringify({ prompt: "prompt-not-returned" }), options.output ?? JSON.stringify(run),
          run.completedAt, run.completedAt,
        );
      };

      for (let index = 1; index <= 13; index += 1) {
        const run = persistedRun(`run-${index}`, `Tema ${index}`, new Date(Date.UTC(2026, 0, index)).toISOString());
        insert(run, index === 12 ? { output: JSON.stringify({ ...run, internalSecret: "must-not-leak", metrics: { ...run.metrics, providerHeader: "must-not-leak" } }) } : {});
      }
      const malformed = persistedRun("malformed", "Malformado", "2026-02-14T00:00:00.000Z");
      insert(malformed, { output: "{not-json" });
      // A corrupted but JSON-valid timestamp must be rejected, not normalized.
      const impossibleDate = persistedRun("impossible-date", "Fecha imposible", "2026-02-20T00:00:00.000Z");
      insert(impossibleDate, { output: JSON.stringify({ ...impossibleDate, startedAt: "2026-02-29T00:00:00Z" }) });
      const mismatched = persistedRun("mismatched", "Otro proyecto", "2026-02-15T00:00:00.000Z", otherProject.id);
      insert(mismatched);
      insert(persistedRun("failed", "Fallido", "2026-02-16T00:00:00.000Z"), { status: "FAILED" });
      insert(persistedRun("running", "En curso", "2026-02-17T00:00:00.000Z"), { status: "RUNNING" });
      insert(persistedRun("unrelated", "No investigación", "2026-02-18T00:00:00.000Z"), { agentKey: "problems" });
      insert(persistedRun("other", "Proyecto aislado", "2026-02-19T00:00:00.000Z", otherProject.id), { generationProjectId: otherProject.id });

      expect(reader.latest(noRunsProject.id)).toBeNull();
      expect(reader.history(noRunsProject.id)).toEqual([]);
      const latest = reader.latest(project.id);
      const history = reader.history(project.id, 200);
      expect(latest).toMatchObject({ runId: "run-13", topic: "Tema 13", projectId: project.id });
      expect(history).toHaveLength(10);
      expect(history[0]).toMatchObject({ runId: "run-13" });
      expect(history.every((run) => run.projectId === project.id && run.topic !== "Malformado" && run.topic !== "Fecha imposible" && run.topic !== "Otro proyecto" && run.topic !== "Fallido" && run.topic !== "En curso" && run.topic !== "No investigación")).toBe(true);
      // Valid UTC and offset timestamps still restore; only impossible dates are skipped.
      expect(reader.history(project.id, 1)[0]?.startedAt).toBe("2026-01-13T00:00:00.000Z");
      expect(JSON.stringify(history)).not.toContain("must-not-leak");
      expect(JSON.stringify(history)).not.toContain("prompt-not-returned");
      expect(discover).not.toHaveBeenCalled();
      expect(primary.generate).not.toHaveBeenCalled();
    } finally {
      database.close();
    }
  });

  it("returns the latest persisted run through the read routes without re-running research", async () => {
    const primary = analyzer(findingsOutput);
    const discover = vi.fn(async () => ({
      results: [
        { url: "https://tavily.test/a", title: "A", text: "Los usuarios pierden tiempo buscando fotos duplicadas" },
        { url: "https://tavily.test/b", title: "B", text: "Quieren una rutina mensual sostenible de respaldo" },
      ],
      metadata: { status: 200, resultCount: 2, usage: 2 },
    }));
    app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      marketResearch: {
        clients: { tavily: { name: "tavily", configured: true, discover: discover as WebDiscoveryProvider["discover"] } },
        analyzers: { deepSeek: Object.assign(primary, { effectiveModel: DEEPSEEK_DEFAULT_MODEL }) },
        now: () => new Date(referenceAt),
      },
    });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Ruta", niche: "Fotografía" } })).json<Project>();

    expect((await app.inject({ method: "GET", url: `/api/projects/${project.id}/market-research/latest` })).json()).toBeNull();
    expect((await app.inject({ method: "GET", url: `/api/projects/${project.id}/market-research/history` })).json()).toEqual({ runs: [] });
    const created = (await app.inject({ method: "POST", url: `/api/projects/${project.id}/market-research`, payload: { topic: "fotos guardadas" } })).json<MarketResearchRun>();
    primary.generate.mockClear();
    discover.mockClear();

    const latest = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/market-research/latest` })).json<MarketResearchRun>();
    const history = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/market-research/history` })).json<{ runs: MarketResearchRun[] }>();
    expect(latest).toEqual(created);
    expect(history.runs).toEqual([created]);
    expect(JSON.stringify(latest)).not.toContain("input_snapshot");
    expect(JSON.stringify(latest)).not.toContain("prompt");
    expect(primary.generate).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
  });
});


describe("Phase 20.6 research topic sync and evidence traceability", () => {
  const persisted: MarketResearchRun = {
    runId: "01a018ce-d56f-74c3-b925-ab2b4a8aabae",
    projectId: "019ff678-1319-71c2-a129-3294c901efbc",
    topic: "huerto de balcón",
    startedAt: referenceAt,
    completedAt: referenceAt,
    durationMs: 900,
    providers: [
      { provider: "youtube", state: "available", requested: 10, returned: 2, valid: 2, unique: 2, duplicates: 0, analyzed: 2, scrapedPages: 0, latencyMs: 10, failure: null, usage: null, credits: null },
      { provider: "tavily", state: "available", requested: 5, returned: 1, valid: 1, unique: 1, duplicates: 0, analyzed: 1, scrapedPages: 0, latencyMs: 11, failure: null, usage: 1, credits: null },
    ],
    metrics: { requestedSignals: 15, returnedSignals: 3, validSignals: 3, uniqueSignals: 3, duplicatesRemoved: 0, analyzedSignals: 3, discardedByAnalysisBudget: 0, deepenedSignals: 0 },
    analysis: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, fallbackUsed: false, primaryFailure: null, analyzedSignals: 3, rejectedClaims: 0, inputTokens: 10, outputTokens: 5, failure: null },
    findings: [
      { id: "F1", category: "pains", statement: "El sustrato se seca demasiado rápido", customerLanguage: "se seca en un día", signalIds: ["Y1", "T1"], supportingSignals: 2, independentProviders: 2, domainDiversity: 2, recentSignals: 2, repeatedEvidence: true, contradictingSignals: 0, confidence: "cross_provider" },
      { id: "F2", category: "risks", statement: "Riesgo de plagas en macetas", customerLanguage: null, signalIds: ["Y1"], supportingSignals: 1, independentProviders: 1, domainDiversity: 1, recentSignals: 1, repeatedEvidence: false, contradictingSignals: 0, confidence: "single_signal" },
    ],
    signals: [
      signal(1, { id: "Y1", provider: "youtube", source: "youtube", sourceId: "yt:abc", url: "https://www.youtube.com/watch?v=abc", text: "El sustrato se seca en un día en mi balcón" }),
      signal(2, { id: "Y2", provider: "youtube", source: "youtube", sourceId: null, url: null, text: "Comentario capturado sin citar" }),
      signal(3, { id: "T1", provider: "tavily", source: "web", url: "https://tavily.test/riego", text: "Guía de riego para huerto de balcón" }),
    ],
  };

  it("usa el Research Focus activo como tema por defecto en ambos campos", () => {
    expect(researchTopicDefault("huerto de balcón", "", false)).toBe("huerto de balcón");
    expect(researchTopicDefault("  huerto de balcón  ", "", false)).toBe("huerto de balcón");
    // The same pure default seeds Fuentes Automáticas and the manual YouTube field.
    expect(researchTopicDefault("huerto de balcón", "", false)).toBe(researchTopicDefault("huerto de balcón", "", false));
  });

  it("no arrastra el tema del proyecto anterior ni pisa la edición del usuario", () => {
    // A project switch resets local state, so the previous topic cannot survive.
    expect(researchTopicDefault(null, "", false)).toBe("");
    expect(researchTopicDefault("", "", false)).toBe("");
    // While the field is being edited the user's text always wins.
    expect(researchTopicDefault("huerto de balcón", "tomates en maceta", true)).toBe("tomates en maceta");
    expect(researchTopicDefault("huerto de balcón", "", true)).toBe("");
    // Without an active focus a pristine field keeps whatever it already had.
    expect(researchTopicDefault(null, "tomates en maceta", false)).toBe("tomates en maceta");
  });

  it("agrupa la evidencia persistida por proveedor y expone YouTube sin proveedores", () => {
    expect(marketResearchEvidenceFilters(persisted)).toEqual(["all", "youtube", "tavily"]);
    expect(marketResearchEvidenceFilters({ ...persisted, signals: [] })).toEqual([]);
    expect(marketResearchEvidenceFilterLabel("all")).toBe("Todos");
    expect(marketResearchEvidenceFilterLabel("youtube")).toBe("YouTube");

    const evidence = marketResearchSignalEvidence(persisted);
    expect(filterMarketResearchSignalEvidence(evidence, "all").map((item) => item.signal.id)).toEqual(["Y1", "Y2", "T1"]);
    const youtube = filterMarketResearchSignalEvidence(evidence, "youtube");
    expect(youtube.map((item) => item.signal.id)).toEqual(["Y1", "Y2"]);
    expect(youtube[0]?.signal.url).toBe("https://www.youtube.com/watch?v=abc");
    expect(marketResearchSignalSourceLabel(youtube[0]!.signal.source)).toBe("YouTube");
    expect(filterMarketResearchSignalEvidence(evidence, "brave")).toEqual([]);
  });

  it("sólo declara citas deterministas y nunca inventa estado analizado por señal", () => {
    const evidence = marketResearchSignalEvidence(persisted);
    const [cited, captured, web] = evidence;
    expect(cited).toMatchObject({ cited: true });
    expect(cited?.citedBy.map((finding) => finding.id)).toEqual(["F1", "F2"]);
    expect(cited?.categories.map(marketResearchFindingCategoryLabel)).toEqual(["Dolores", "Riesgos"]);
    // Y2 is stored but no finding cites it: it stays "Capturada".
    expect(captured).toMatchObject({ cited: false, citedBy: [], categories: [] });
    expect(web?.categories).toEqual(["pains"]);
    // Provider-level analyzed counts keep coming from persisted metrics only.
    expect(persisted.providers.map((report) => report.analyzed)).toEqual([2, 1]);
  });

  it("renderiza con seguridad señales sin URL, sin sourceId o sin hallazgos", () => {
    const sparse: MarketResearchRun = {
      ...persisted,
      findings: [],
      signals: [signal(9, { id: "S9", sourceId: null, url: null, deepened: true })],
    };
    const evidence = marketResearchSignalEvidence(sparse);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ cited: false, categories: [] });
    expect(evidence[0]?.signal.url).toBeNull();
    expect(evidence[0]?.signal.sourceId).toBeNull();
    expect(marketResearchEvidenceFilters(sparse)).toEqual(["all", "tavily"]);
  });

  it("mantiene el aislamiento por proyecto y la restauración latest/history intactas", async () => {
    const [{ AppDatabase }, { ProjectRepository }, { MarketResearchService, MARKET_RESEARCH_AGENT_KEY }] = await Promise.all([
      import("../src/database/database.js"),
      import("../src/repositories/project-repository.js"),
      import("../src/services/market-research-service.js"),
    ]);
    const database = new AppDatabase(":memory:");
    try {
      const projects = new ProjectRepository(database);
      const balcony = projects.create({ name: "Huerto", niche: "Balcón" });
      const other = projects.create({ name: "Fotos", niche: "Fotografía" });
      const discover = vi.fn();
      const primary = analyzer({ findings: [] });
      const reader = new MarketResearchService(database, {
        clients: { tavily: { name: "tavily", configured: true, discover: discover as WebDiscoveryProvider["discover"] } },
        analyzers: { deepSeek: Object.assign(primary, { effectiveModel: DEEPSEEK_DEFAULT_MODEL }) },
      });
      const insert = (run: MarketResearchRun) => {
        database.connection.prepare(`
          INSERT INTO generations (
            id, project_id, agent_key, provider, model, status, input_snapshot, output_data,
            prompt_version, input_tokens, output_tokens, estimated_cost, duration_ms,
            error_code, error_message, created_at, completed_at
          ) VALUES (?, ?, ?, 'deepseek', 'deepseek-v4-flash', 'COMPLETED', '{}', ?, 'market-research-v1', 0, 0, 0, 1, NULL, NULL, ?, ?)
        `).run(run.runId, run.projectId, MARKET_RESEARCH_AGENT_KEY, JSON.stringify(run), run.completedAt, run.completedAt);
      };
      insert({ ...persisted, runId: balcony.id, projectId: balcony.id });
      insert({ ...persisted, runId: other.id, projectId: other.id, topic: "organización de fotografías digitales" });

      const restored = reader.latest(balcony.id);
      expect(restored?.topic).toBe("huerto de balcón");
      expect(reader.history(balcony.id).map((item) => item.topic)).toEqual(["huerto de balcón"]);
      expect(reader.latest(other.id)?.topic).toBe("organización de fotografías digitales");
      // Evidence traceability is derived from the restored run, not from a new call.
      expect(marketResearchSignalEvidence(restored!).filter((item) => item.cited).map((item) => item.signal.id)).toEqual(["Y1", "T1"]);
      expect(filterMarketResearchSignalEvidence(marketResearchSignalEvidence(restored!), "youtube")).toHaveLength(2);
      expect(discover).not.toHaveBeenCalled();
      expect(primary.generate).not.toHaveBeenCalled();
    } finally {
      database.close();
    }
  });
});
