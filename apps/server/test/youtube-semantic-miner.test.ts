import {
  MARKET_RESEARCH_BUDGETS,
  type LlmGenerateRequest,
  type LlmGenerateResult,
  type MarketResearchRun,
  type MarketResearchSignal,
} from "@our-platform/shared";
import { describe, expect, it, vi } from "vitest";

import { IntegrationError } from "../src/integrations/integration-error.js";
import { DEEPSEEK_DEFAULT_MODEL } from "../src/integrations/deepseek-provider.js";
import { GEMINI_ANALYSIS_MODEL } from "../src/services/module-service.js";
import {
  mineMarketResearchFindings,
  type MarketResearchAnalyzerClient,
} from "../src/services/market-research-semantic-miner.js";

const referenceAt = "2026-08-20T00:00:00.000Z";

function youtubeSignal(index: number, overrides: Partial<MarketResearchSignal> = {}): MarketResearchSignal {
  const video = Math.ceil(index / 2);
  return {
    id: `Y${index}`,
    provider: "youtube",
    source: "youtube",
    sourceId: `youtube-comment:${index}`,
    url: `https://www.youtube.com/watch?v=v${String(video).padStart(10, "0")}`,
    capturedAt: "2026-08-01T00:00:00.000Z",
    text: `Comentario ${index}: el viento seca las macetas muy rápido y las plantas se mueren en el balcón`,
    deepened: false,
    youtube: {
      videoId: `v${String(video).padStart(10, "0")}`,
      channelId: `channel-${Math.ceil(video / 2)}`,
      channelTitle: `Canal ${Math.ceil(video / 2)}`,
      query: "huerto de balcón",
      queryAngle: "frustration",
      queryLanguage: index % 2 === 0 ? "es" : "en",
      declaredLanguage: index % 2 === 0 ? "es" : "en",
      channelCountry: null,
    },
    ...overrides,
  };
}

function webSignal(index: number): MarketResearchSignal {
  return {
    id: `W${index}`,
    provider: "tavily",
    source: "web",
    sourceId: `web:${index}`,
    url: `https://example.test/${index}`,
    capturedAt: "2026-08-01T00:00:00.000Z",
    text: `Fuente web ${index} sobre riego y cultivo en espacios pequeños`,
    deepened: false,
  };
}

function analyzer(
  answer: (request: LlmGenerateRequest) => unknown,
  options: { readonly configured?: boolean; readonly inputTokens?: number; readonly outputTokens?: number } = {},
): MarketResearchAnalyzerClient & { readonly generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn(async (request: LlmGenerateRequest): Promise<LlmGenerateResult<unknown>> => ({
    provider: "test",
    requestedModel: request.model,
    output: answer(request),
    usage: {
      inputTokens: options.inputTokens ?? 100,
      outputTokens: options.outputTokens ?? 40,
      usageKind: "provider_reported",
    },
  }));
  return { configured: options.configured ?? true, generate: generate as unknown as MarketResearchAnalyzerClient["generate"] } as MarketResearchAnalyzerClient & { readonly generate: ReturnType<typeof vi.fn> };
}

function failingAnalyzer(): MarketResearchAnalyzerClient & { readonly generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn(async () => { throw new IntegrationError("http_provider_error", "fallo de prueba"); });
  return { configured: true, generate: generate as unknown as MarketResearchAnalyzerClient["generate"] } as MarketResearchAnalyzerClient & { readonly generate: ReturnType<typeof vi.fn> };
}

function mining(signals: readonly MarketResearchSignal[], primary: MarketResearchAnalyzerClient, fallback: MarketResearchAnalyzerClient | undefined = undefined) {
  return mineMarketResearchFindings({
    topic: "personas en departamentos que cultivan en balcones pequeños",
    signals,
    referenceAt,
    primary: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, client: primary },
    fallback: { analyzer: "gemini", model: GEMINI_ANALYSIS_MODEL, client: fallback },
  });
}

function requestSignals(request: LlmGenerateRequest): Array<{ id: string; text: string }> {
  return (JSON.parse(String(request.input)) as { signals: Array<{ id: string; text: string }> }).signals;
}

describe("Phase 20.7C bounded YouTube semantic batches", () => {
  it("divide evidencia limpia en batches pequeños, recorta texto y nunca manda un prompt gigante", async () => {
    const primary = analyzer((request) => {
      const [first] = requestSignals(request);
      return { findings: [{ category: "pains", statement: "El viento seca demasiado rápido las macetas", customerLanguage: "se mueren en el balcón", signalIds: [first!.id] }] };
    });
    const signals = Array.from({ length: 60 }, (_, index) => youtubeSignal(index + 1, { text: "x".repeat(900) + ` evidencia ${index + 1}` }));

    const result = await mining(signals, primary);

    expect(primary.generate).toHaveBeenCalledTimes(3);
    expect(primary.generate.mock.calls.map(([request]) => requestSignals(request as LlmGenerateRequest).length)).toEqual([25, 25, 10]);
    for (const [request] of primary.generate.mock.calls) {
      const typed = request as LlmGenerateRequest;
      expect(requestSignals(typed).length).toBeLessThanOrEqual(MARKET_RESEARCH_BUDGETS.youtubeSemanticBatchSignals);
      expect(requestSignals(typed).every((signal) => signal.text.length <= MARKET_RESEARCH_BUDGETS.youtubeSemanticSignalChars)).toBe(true);
      expect(typed.maxOutputTokens).toBe(MARKET_RESEARCH_BUDGETS.youtubeSemanticMaxOutputTokens);
    }
    expect(result.analysis.youtube).toMatchObject({ semanticBatches: 3, successfulBatches: 3, analyzedSignals: 60 });
    expect(result.analysis.analyzedSignals).toBe(60);
  });

  it("aplica el máximo duro de batches aunque haya más de 300 comentarios", async () => {
    const primary = analyzer(() => ({ findings: [] }));
    const signals = Array.from({ length: 400 }, (_, index) => youtubeSignal(index + 1));

    const result = await mining(signals, primary);

    expect(primary.generate).toHaveBeenCalledTimes(MARKET_RESEARCH_BUDGETS.youtubeSemanticMaxBatches);
    expect(result.analysis.youtube?.analyzedSignals).toBe(
      MARKET_RESEARCH_BUDGETS.youtubeSemanticBatchSignals * MARKET_RESEARCH_BUDGETS.youtubeSemanticMaxBatches,
    );
    expect(result.analyzedSignalIds).toHaveLength(300);
  });

  it("mantiene proveedores no YouTube en la ruta compatible de presupuesto global", async () => {
    const primary = analyzer((request) => {
      const [first] = requestSignals(request);
      return { findings: [{ category: "desires", statement: "Quieren una guía sencilla", customerLanguage: "", signalIds: [first!.id] }] };
    });

    const result = await mining(Array.from({ length: 30 }, (_, index) => webSignal(index + 1)), primary);

    expect(primary.generate).toHaveBeenCalledOnce();
    expect(requestSignals(primary.generate.mock.calls[0]![0] as LlmGenerateRequest)).toHaveLength(MARKET_RESEARCH_BUDGETS.analysisSignals);
    expect(result.analysis.youtube).toMatchObject({ semanticBatches: 0, analyzedSignals: 0 });
    expect(result.findings[0]).toMatchObject({ signalIds: ["W1"] });
  });
});

describe("Phase 20.7C evidence grounding and consolidation", () => {
  it("rechaza IDs alucinados, candidatos sin evidencia y deduplica IDs válidos", async () => {
    const primary = analyzer(() => ({
      findings: [
        { category: "pains", statement: "Dolor válido", customerLanguage: "", signalIds: ["Y1", "Y1", "Y999"] },
        { category: "desires", statement: "Sin evidencia", customerLanguage: "", signalIds: ["Y999"] },
      ],
    }));

    const result = await mining([youtubeSignal(1)], primary);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ statement: "Dolor válido", signalIds: ["Y1"], supportingSignals: 1 });
    expect(result.analysis.rejectedClaims).toBe(1);
  });

  it("separa los rechazos de candidatos YouTube de los claims web", async () => {
    const primary = analyzer((request) => {
      const [first] = requestSignals(request);
      return first?.id === "W1"
        ? { findings: [{ category: "pains", statement: "Claim web sin soporte", customerLanguage: "", signalIds: ["W404"] }] }
        : { findings: [{ category: "pains", statement: "Dolor YouTube válido", customerLanguage: "", signalIds: ["Y1"] }] };
    });

    const result = await mining([webSignal(1), youtubeSignal(1)], primary);

    expect(result.analysis.rejectedClaims).toBe(1);
    expect(result.analysis.youtube?.rejectedCandidates).toBe(0);
  });

  it("muestra customer language únicamente si la cita literal existe en evidencia citada", async () => {
    const primary = analyzer(() => ({
      findings: [
        { category: "pains", statement: "Dolor validado", customerLanguage: "las plantas se mueren", signalIds: ["Y1"] },
        { category: "desires", statement: "Cita inventada", customerLanguage: "pagaría cualquier precio", signalIds: ["Y1"] },
        { category: "complaints", statement: "Cita con caso o puntuación alterados", customerLanguage: "LAS PLANTAS SE MUEREN!", signalIds: ["Y1"] },
        { category: "commercial_intent", statement: "Cita con tilde alterada", customerLanguage: "pagaria", signalIds: ["Y1"] },
        { category: "market_language", statement: "Cita con espacios alterados", customerLanguage: "Una frase con dos espacios", signalIds: ["Y1"] },
        { category: "market_language", statement: "Cita Unicode en forma distinta", customerLanguage: "cafe\u0301", signalIds: ["Y1"] },
        { category: "market_language", statement: "Cita con whitespace de borde alterado", customerLanguage: "\tlas plantas se mueren", signalIds: ["Y1"] },
      ],
    }));
    const signal = youtubeSignal(1, { text: "Con el viento las plantas se mueren cada semana; pagaría por una solución. Una frase con dos  espacios y café." });

    const result = await mining([signal], primary);

    expect(result.findings.find((finding) => finding.statement === "Dolor validado")?.customerLanguage).toBe("las plantas se mueren");
    expect(result.findings.find((finding) => finding.statement === "Cita inventada")?.customerLanguage).toBeNull();
    expect(result.findings.find((finding) => finding.statement === "Cita con caso o puntuación alterados")?.customerLanguage).toBeNull();
    expect(result.findings.find((finding) => finding.statement === "Cita con tilde alterada")?.customerLanguage).toBeNull();
    expect(result.findings.find((finding) => finding.statement === "Cita con espacios alterados")?.customerLanguage).toBeNull();
    expect(result.findings.find((finding) => finding.statement === "Cita Unicode en forma distinta")?.customerLanguage).toBeNull();
    expect(result.findings.find((finding) => finding.statement === "Cita con whitespace de borde alterado")?.customerLanguage).toBeNull();
  });

  it("consolida el mismo concepto entre batches y deriva diversidad real", async () => {
    const primary = analyzer((request) => {
      const [first] = requestSignals(request);
      return {
        findings: [{
          category: "pains",
          statement: "El viento seca demasiado rápido las macetas",
          customerLanguage: "se mueren en el balcón",
          signalIds: [first!.id],
        }],
      };
    });
    const signals = Array.from({ length: 51 }, (_, index) => youtubeSignal(index + 1));

    const result = await mining(signals, primary);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      category: "pains",
      supportingSignals: 3,
      distinctVideos: 3,
      distinctChannels: 3,
      languages: ["en", "es"],
      evidenceStrength: "repeated",
    });
    expect(result.findings[0]?.signalIds).toEqual(["Y1", "Y26", "Y51"]);
    expect(result.analysis.youtube).toMatchObject({ candidateFindings: 3, citedSignals: 3, citedVideos: 3, citedChannels: 3, languages: ["en", "es"] });
  });

  it("etiqueta patrones repetidos fuertes sólo con múltiples señales y diversidad", async () => {
    const primary = analyzer((request) => ({
      findings: [{
        category: "repeated_themes",
        statement: "El viento y el calor secan las macetas",
        customerLanguage: "",
        signalIds: requestSignals(request).slice(0, 6).map((signal) => signal.id),
      }],
    }));
    const signals = Array.from({ length: 6 }, (_, index) => youtubeSignal(index + 1));

    const result = await mining(signals, primary);

    expect(result.findings[0]).toMatchObject({ supportingSignals: 6, distinctVideos: 3, distinctChannels: 2, evidenceStrength: "strong_repeated" });
  });

  it("mantiene los textos originales multilingües: sólo la síntesis sale en español", async () => {
    const english = youtubeSignal(1, { text: "The wind dries my pots too fast" });
    const spanish = youtubeSignal(2, { text: "El viento me seca las macetas demasiado rápido" });
    const primary = analyzer((request) => ({
      findings: [{ category: "pains", statement: "El viento seca demasiado rápido las macetas", customerLanguage: "The wind dries my pots too fast", signalIds: requestSignals(request).map((signal) => signal.id) }],
    }));

    const result = await mining([english, spanish], primary);

    expect(result.findings[0]).toMatchObject({ supportingSignals: 2, languages: ["en", "es"], customerLanguage: "The wind dries my pots too fast" });
    expect(english.text).toBe("The wind dries my pots too fast");
    expect(spanish.text).toBe("El viento me seca las macetas demasiado rápido");
  });

  it("conserva intención comercial y soluciones fallidas sólo cuando tienen IDs de evidencia", async () => {
    const primary = analyzer(() => ({
      findings: [
        { category: "commercial_intent", statement: "Buscan una opción más barata", customerLanguage: "too expensive", signalIds: ["Y1"] },
        { category: "failed_solutions", statement: "Un kit de riego automático no resolvió el secado", customerLanguage: "the automatic watering kit did not work", signalIds: ["Y2"] },
        { category: "commercial_intent", statement: "Compra inventada", customerLanguage: "", signalIds: ["Y404"] },
      ],
    }));
    const signals = [
      youtubeSignal(1, { text: "This setup is too expensive for my small balcony" }),
      youtubeSignal(2, { text: "The automatic watering kit did not work and my herbs dried out" }),
    ];

    const result = await mining(signals, primary);

    expect(result.findings.map((finding) => finding.category)).toEqual(["commercial_intent", "failed_solutions"]);
    expect(result.findings.every((finding) => finding.signalIds.length > 0)).toBe(true);
  });
});

describe("Phase 20.7C analyzer usage and bounded fallback", () => {
  it("agrega tokens de todos los batches exitosos y nunca llama Gemini tras un batch DeepSeek exitoso", async () => {
    const primary = analyzer((request) => ({ findings: [{ category: "pains", statement: `Dolor ${requestSignals(request)[0]!.id}`, customerLanguage: "", signalIds: [requestSignals(request)[0]!.id] }] }), { inputTokens: 111, outputTokens: 22 });
    const fallback = analyzer(() => ({ findings: [] }));

    const result = await mining(Array.from({ length: 51 }, (_, index) => youtubeSignal(index + 1)), primary, fallback);

    expect(primary.generate).toHaveBeenCalledTimes(3);
    expect(fallback.generate).not.toHaveBeenCalled();
    expect(result.analysis).toMatchObject({ analyzer: "deepseek", fallbackUsed: false, inputTokens: 333, outputTokens: 66 });
    expect(result.analysis.youtube).toMatchObject({ fallbackBatches: 0, successfulBatches: 3, failedBatches: 0 });
  });

  it("usa Gemini una sola vez como fallback del batch que falló, sin reintentos", async () => {
    const primary = failingAnalyzer();
    const fallback = analyzer((request) => ({ findings: [{ category: "pains", statement: "Fallo de riego", customerLanguage: "", signalIds: [requestSignals(request)[0]!.id] }] }), { inputTokens: 9, outputTokens: 3 });

    const result = await mining([youtubeSignal(1)], primary, fallback);

    expect(primary.generate).toHaveBeenCalledOnce();
    expect(fallback.generate).toHaveBeenCalledOnce();
    expect(result.analysis).toMatchObject({ analyzer: "gemini", fallbackUsed: true, primaryFailure: "http_provider_error", inputTokens: 9, outputTokens: 3 });
    expect(result.analysis.youtube).toMatchObject({ fallbackBatches: 1, successfulBatches: 1, failedBatches: 0 });
  });

  it("un batch fallido no puede crear un finding sin soporte", async () => {
    const primary = failingAnalyzer();
    const fallback = failingAnalyzer();

    const result = await mining([youtubeSignal(1)], primary, fallback);

    expect(result.findings).toEqual([]);
    expect(result.analyzedSignalIds).toEqual([]);
    expect(result.analysis.youtube).toMatchObject({ semanticBatches: 1, failedBatches: 1, successfulBatches: 0 });
  });
});

describe("Phase 20.7C persisted semantic result reads", () => {
  it("restaura métricas semánticas y evidencia de YouTube sin llamar proveedor o LLM", async () => {
    const [{ AppDatabase }, { ProjectRepository }, { MarketResearchService, MARKET_RESEARCH_AGENT_KEY }] = await Promise.all([
      import("../src/database/database.js"),
      import("../src/repositories/project-repository.js"),
      import("../src/services/market-research-service.js"),
    ]);
    const database = new AppDatabase(":memory:");
    try {
      const project = new ProjectRepository(database).create({ name: "Huerto", niche: "Balcón" });
      const discover = vi.fn();
      const generate = vi.fn();
      const reader = new MarketResearchService(database, {
        clients: { tavily: { name: "tavily", configured: true, discover: discover as never } },
        analyzers: { deepSeek: { configured: true, generate: generate as never, effectiveModel: DEEPSEEK_DEFAULT_MODEL } },
      });
      const run: MarketResearchRun = {
        runId: project.id, projectId: project.id, topic: "huerto de balcón", startedAt: referenceAt, completedAt: referenceAt, durationMs: 1,
        providers: [{ provider: "youtube", state: "available", requested: 300, returned: 500, valid: 300, unique: 300, duplicates: 0, analyzed: 300, scrapedPages: 0, latencyMs: 1, failure: null, usage: null, credits: null, youtube: { queries: 11, videosDiscovered: 40, videosSelected: 30, videosWithComments: 20, videosSkipped: 1, commentsFetched: 500, commentsValid: 300, commentsUnique: 300, commentsDiscarded: 200, structurallyRejected: 5, qualityRejected: 50, exactDuplicatesRemoved: 10, nearDuplicatesRemoved: 5, repliesRetained: 12, distinctVideosRepresented: 20, distinctChannelsRepresented: 15, maxCommentsFromOneVideo: 25, maxCommentsFromOneChannel: 50, lowYieldBatches: 0, stopReason: "target_reached" } }],
        metrics: { requestedSignals: 300, returnedSignals: 500, validSignals: 300, uniqueSignals: 300, duplicatesRemoved: 0, analyzedSignals: 300, discardedByAnalysisBudget: 0, deepenedSignals: 0 },
        analysis: { analyzer: "deepseek", model: DEEPSEEK_DEFAULT_MODEL, fallbackUsed: false, primaryFailure: null, analyzedSignals: 300, rejectedClaims: 2, inputTokens: 1200, outputTokens: 400, failure: null, youtube: { semanticBatches: 12, successfulBatches: 12, failedBatches: 0, analyzedSignals: 300, candidateFindings: 20, rejectedCandidates: 2, citedSignals: 18, citedVideos: 9, citedChannels: 7, languages: ["en", "es"], fallbackBatches: 0 } },
        findings: [{ id: "F1", category: "pains", statement: "El viento seca las macetas", customerLanguage: "se mueren", signalIds: ["Y1"], supportingSignals: 1, independentProviders: 1, domainDiversity: 1, recentSignals: 1, repeatedEvidence: false, contradictingSignals: 0, confidence: "single_signal", evidenceStrength: "isolated", distinctVideos: 1, distinctChannels: 1, languages: ["es"] }],
        signals: [youtubeSignal(1, { id: "Y1" })],
      };
      database.connection.prepare(`INSERT INTO generations (id,project_id,agent_key,provider,model,status,input_snapshot,output_data,prompt_version,input_tokens,output_tokens,estimated_cost,duration_ms,error_code,error_message,created_at,completed_at) VALUES (?,? ,?,'deepseek','deepseek-v4-flash','COMPLETED','{}',?,'market-research-v1',0,0,0,1,NULL,NULL,?,?)`).run(run.runId, run.projectId, MARKET_RESEARCH_AGENT_KEY, JSON.stringify(run), run.completedAt, run.completedAt);

      const restored = reader.latest(project.id);
      expect(restored?.analysis.youtube).toMatchObject({ semanticBatches: 12, citedVideos: 9, languages: ["en", "es"] });
      expect(restored?.providers[0]?.youtube).toMatchObject({ videosSelected: 30, commentsUnique: 300, stopReason: "target_reached" });
      expect(restored?.findings[0]).toMatchObject({ evidenceStrength: "isolated", distinctVideos: 1 });
      expect(restored?.signals[0]?.youtube).toMatchObject({ videoId: youtubeSignal(1).youtube?.videoId, queryLanguage: "en" });

      const corrupted = {
        ...run,
        findings: run.findings.map((finding) => ({ ...finding, signalIds: ["Y404"] })),
      };
      database.connection.prepare("UPDATE generations SET output_data = ? WHERE id = ?").run(JSON.stringify(corrupted), run.runId);
      expect(reader.latest(project.id)).toBeNull();
      expect(reader.history(project.id)).toEqual([]);
      expect(discover).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    } finally {
      database.close();
    }
  });
});
