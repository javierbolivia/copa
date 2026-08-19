import { MARKET_RESEARCH_BUDGETS, type MarketResearchRun } from "@our-platform/shared";
import { describe, expect, it, vi } from "vitest";

import { IntegrationError } from "../src/integrations/integration-error.js";
import type { YouTubeComment, YouTubeSearchResult, YouTubeThread } from "../src/integrations/youtube-adapter.js";
import {
  acquireYouTubeDeepResearchSignals,
  selectDiverseYouTubeCandidates,
  type YouTubeDeepResearchClient,
} from "../src/services/youtube-deep-research-acquisition.js";
import {
  YOUTUBE_RESEARCH_ANGLES,
  YOUTUBE_RESEARCH_MAX_QUERIES,
  deriveYouTubeResearchQueries,
} from "../src/services/youtube-research-queries.js";

const TOPIC = "huerto de balcón";

/** Deterministic 11-character IDs, the only shape the signal adapter accepts. */
function videoId(index: number): string {
  return `v${String(index).padStart(10, "0")}`;
}

function comment(id: string, text: string, overrides: Partial<YouTubeComment> = {}): YouTubeComment {
  return {
    commentId: id,
    parentCommentId: null,
    author: "Autor",
    text,
    likes: 1,
    publishedAt: "2026-02-02T00:00:00Z",
    updatedAt: "2026-02-02T00:00:00Z",
    isReply: false,
    ...overrides,
  };
}

function thread(videoIndex: number, threadIndex: number, options: { readonly text?: string; readonly totalReplyCount?: number; readonly embedded?: number } = {}): YouTubeThread {
  const topId = `c-${videoIndex}-${threadIndex}`;
  const embedded = options.embedded ?? 0;
  return {
    threadId: `t-${videoIndex}-${threadIndex}`,
    topLevelComment: comment(topId, options.text ?? `El sustrato del video ${videoIndex} se seca en un día, comentario ${threadIndex}`),
    totalReplyCount: options.totalReplyCount ?? embedded,
    embeddedReplies: Array.from({ length: embedded }, (_, replyIndex) =>
      comment(`${topId}-r${replyIndex}`, `Respuesta ${replyIndex} del hilo ${threadIndex}`, { parentCommentId: topId, isReply: true })),
  };
}

function searchResult(index: number, channelIndex = index): YouTubeSearchResult {
  return {
    videoId: videoId(index),
    title: `Video ${index}`,
    description: `Descripción del video ${index}`,
    channelId: `channel-${channelIndex}`,
    channelTitle: `Canal ${channelIndex}`,
    publishedAt: "2026-02-01T00:00:00Z",
  };
}

interface ClientOptions {
  readonly results?: readonly YouTubeSearchResult[];
  readonly threadsPerVideo?: number;
  readonly threadOptions?: { readonly totalReplyCount?: number; readonly embedded?: number };
  readonly nextPageToken?: string;
  readonly disabledVideoIds?: readonly string[];
  readonly withEnrichment?: boolean;
  readonly withReplies?: boolean;
}

/** Fully mocked client shape; every method is a spy so calls can be asserted. */
interface MockedYouTubeClient {
  readonly searchVideos: ReturnType<typeof vi.fn>;
  readonly getVideo: ReturnType<typeof vi.fn>;
  readonly listCommentThreads: ReturnType<typeof vi.fn>;
  readonly getVideos?: ReturnType<typeof vi.fn> | undefined;
  readonly getChannels?: ReturnType<typeof vi.fn> | undefined;
  readonly listReplies?: ReturnType<typeof vi.fn> | undefined;
}

/** The only cast in this suite: mocked doubles stand in for the real client. */
function acquire(youtube: MockedYouTubeClient, topic: string = TOPIC) {
  return acquireYouTubeDeepResearchSignals(youtube as unknown as YouTubeDeepResearchClient, { topic });
}

function client(options: ClientOptions = {}): MockedYouTubeClient {
  const results = options.results ?? [searchResult(1)];
  const threadsPerVideo = options.threadsPerVideo ?? 3;
  const disabled = new Set(options.disabledVideoIds ?? []);
  const base = {
    searchVideos: vi.fn(async () => ({ items: results })),
    getVideo: vi.fn(async () => undefined),
    listCommentThreads: vi.fn(async (request: { videoId: string }) => {
      if (disabled.has(request.videoId)) {
        throw new IntegrationError("http_provider_error", "YouTube respondió con HTTP 403.");
      }
      const index = Number(request.videoId.replace(/^v0*/u, "")) || 0;
      return {
        items: Array.from({ length: threadsPerVideo }, (_, threadIndex) =>
          thread(index, threadIndex, options.threadOptions ?? {})),
        ...(options.nextPageToken === undefined ? {} : { nextPageToken: options.nextPageToken }),
      };
    }),
  };
  return {
    ...base,
    ...(options.withEnrichment !== true ? {} : {
      getVideos: vi.fn(async (ids: readonly string[]) => ids.map((id) => ({
        videoId: id,
        title: `Video enriquecido ${id}`,
        channelId: "channel-1",
        channelTitle: "Canal 1",
        publishedAt: "2026-02-01T00:00:00Z",
        viewCount: 12_000,
        likeCount: 400,
        commentCount: 250,
        duration: "PT8M20S",
        tags: ["huerto", "balcón"],
        categoryId: "26",
        defaultAudioLanguage: "es",
      }))),
      getChannels: vi.fn(async (ids: readonly string[]) => ids.map((id) => ({
        channelId: id,
        title: `Canal ${id}`,
        country: "MX",
      }))),
    }),
    ...(options.withReplies !== true ? {} : {
      listReplies: vi.fn(async (request: { parentCommentId: string }) => ({
        items: Array.from({ length: 5 }, (_, index) =>
          comment(`${request.parentCommentId}-x${index}`, `Respuesta extra ${index} sobre el riego del balcón`, {
            parentCommentId: request.parentCommentId,
            isReply: true,
          })),
      })),
    }),
  } as unknown as MockedYouTubeClient;
}

describe("Phase 20.7A YouTube discovery plan", () => {
  it("deriva ángulos deterministas en español, inglés y una vía global sin LLM", () => {
    const queries = deriveYouTubeResearchQueries(TOPIC);

    expect(queries).toEqual(deriveYouTubeResearchQueries(TOPIC));
    expect(queries.length).toBeGreaterThanOrEqual(3);
    expect(queries.length).toBeLessThanOrEqual(YOUTUBE_RESEARCH_MAX_QUERIES);
    expect([...new Set(queries.map((query) => query.language))]).toEqual(["global", "es", "en"]);
    // Every angle class is represented in both decorated lanes.
    for (const angle of YOUTUBE_RESEARCH_ANGLES) {
      expect(queries.some((query) => query.language === "es" && query.angle === angle)).toBe(true);
      expect(queries.some((query) => query.language === "en" && query.angle === angle)).toBe(true);
    }
    // The global lane is the undecorated topic; Spanish and English are bounded variants.
    expect(queries[0]).toMatchObject({ query: TOPIC, language: "global" });
    expect(queries.filter((query) => query.language === "es").map((query) => query.query)).toEqual([
      "huerto de balcón problemas",
      "huerto de balcón no funciona",
      "errores huerto de balcón",
      "cómo solucionar huerto de balcón",
      "huerto de balcón resultados reales",
    ]);
    expect(queries.filter((query) => query.language === "en").map((query) => query.query)).toEqual([
      "huerto de balcón problems",
      "huerto de balcón not working",
      "huerto de balcón mistakes",
      "how to fix huerto de balcón",
      "huerto de balcón real results",
    ]);
  });

  it("normaliza el tema, colapsa variantes repetidas y no inventa consultas", () => {
    expect(deriveYouTubeResearchQueries("   ")).toEqual([]);
    expect(deriveYouTubeResearchQueries('  "huerto"  de   balcón  ')[0]?.query).toBe("huerto de balcón");
    // Query strings are unique and the plan stays inside the hard query ceiling.
    const repeated = deriveYouTubeResearchQueries("errores de riego");
    expect(new Set(repeated.map((query) => query.query)).size).toBe(repeated.length);
    expect(repeated).toHaveLength(11);
    expect(repeated.length).toBeLessThanOrEqual(YOUTUBE_RESEARCH_MAX_QUERIES);
  });

  it("selecciona con diversidad de canal sin superar el máximo por canal", () => {
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      videoId: videoId(index),
      channelId: `channel-${index % 2}`,
    })) as never;
    const selected = selectDiverseYouTubeCandidates(candidates, { maxVideos: 40, maxPerChannel: 3 });

    expect(selected).toHaveLength(6);
    expect(selected.filter((candidate) => candidate.channelId === "channel-0")).toHaveLength(3);
    expect(selected.filter((candidate) => candidate.channelId === "channel-1")).toHaveLength(3);
  });
});

describe("Phase 20.7A YouTube acquisition bounds", () => {
  it("consulta las vías multilingües y deduplica vídeos entre consultas e idiomas", async () => {
    const youtube = client({ results: [searchResult(1), searchResult(2, 2)] });

    const acquisition = await acquire(youtube);

    const searched = youtube.searchVideos.mock.calls.map((call) => call[0] as string);
    expect(searched).toContain(TOPIC);
    expect(searched).toContain("huerto de balcón problemas");
    expect(searched).toContain("how to fix huerto de balcón");
    expect(youtube.searchVideos.mock.calls.every((call) => call[1] === undefined)).toBe(true);
    // The same two videos come back from every lane and are counted once.
    expect(acquisition.metrics).toMatchObject({ videosDiscovered: 2, videosSelected: 2 });
    expect(acquisition.metrics.queryLanguages).toEqual(["global", "es", "en"]);
    expect(new Set(acquisition.candidates.map((candidate) => candidate.videoId)).size).toBe(2);
  });

  it("no descarta resultados globales por idioma y nunca infiere idioma o país", async () => {
    const youtube = client({
      results: [
        { ...searchResult(1), title: "Balcony garden mistakes", channelTitle: "Global Channel" },
        { ...searchResult(2, 2), title: "ベランダ菜園", channelTitle: "日本チャンネル" },
      ],
    });

    const acquisition = await acquire(youtube);

    expect(acquisition.metrics.videosSelected).toBe(2);
    expect(acquisition.candidates.map((candidate) => candidate.title)).toEqual(["Balcony garden mistakes", "ベランダ菜園"]);
    // Without declared metadata the language and country stay null, never guessed.
    expect(acquisition.candidates.every((candidate) => candidate.defaultAudioLanguage === null
      && candidate.defaultLanguage === null
      && candidate.channelCountry === null
      && candidate.enriched === false)).toBe(true);
    expect(acquisition.metrics.declaredLanguages).toEqual([]);
    expect(acquisition.valid).toBe(6);
  });

  it("respeta el máximo duro de 40 vídeos y el máximo por canal", async () => {
    const many = Array.from({ length: 90 }, (_, index) => searchResult(index + 1, index % 30));
    const youtube = client({ results: many, threadsPerVideo: 1 });

    const acquisition = await acquire(youtube);

    // The candidate pool is bounded, and selection never exceeds the video ceiling.
    expect(acquisition.metrics.videosDiscovered).toBe(90);
    expect(acquisition.metrics.videosDiscovered).toBeLessThanOrEqual(MARKET_RESEARCH_BUDGETS.youtubeMaxCandidates);
    expect(acquisition.metrics.videosSelected).toBeLessThanOrEqual(MARKET_RESEARCH_BUDGETS.youtubeMaxVideos);
    expect(acquisition.metrics.videosSelected).toBe(40);
    const perChannel = new Map<string, number>();
    for (const candidate of acquisition.candidates) {
      perChannel.set(candidate.channelId, (perChannel.get(candidate.channelId) ?? 0) + 1);
    }
    expect(Math.max(...perChannel.values())).toBeLessThanOrEqual(MARKET_RESEARCH_BUDGETS.youtubeMaxVideosPerChannel);
  });

  it("enriquece los vídeos seleccionados con metadatos declarados en peticiones acotadas", async () => {
    const youtube = client({ results: [searchResult(1)], withEnrichment: true });

    const acquisition = await acquire(youtube);

    expect(youtube.getVideos).toHaveBeenCalledTimes(1);
    expect(youtube.getChannels).toHaveBeenCalledTimes(1);
    expect(acquisition.metrics.enrichmentRequests).toBe(2);
    expect(acquisition.candidates[0]).toMatchObject({
      enriched: true,
      viewCount: 12_000,
      likeCount: 400,
      commentCount: 250,
      duration: "PT8M20S",
      tags: ["huerto", "balcón"],
      categoryId: "26",
      defaultAudioLanguage: "es",
      channelCountry: "MX",
    });
    expect(acquisition.metrics.declaredLanguages).toEqual(["es"]);
  });

  it("continúa cuando el enriquecimiento falla y mantiene la adquisición", async () => {
    const youtube = client({ results: [searchResult(1)], withEnrichment: true });
    (youtube.getVideos as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new IntegrationError("http_rate_limit", "límite"));

    const acquisition = await acquire(youtube);

    expect(acquisition.candidates[0]).toMatchObject({ enriched: false, viewCount: null, duration: null });
    expect(acquisition.valid).toBe(3);
  });

  it("omite con seguridad los vídeos con comentarios desactivados y sigue con el resto", async () => {
    const youtube = client({ results: [searchResult(1), searchResult(2, 2), searchResult(3, 3)], disabledVideoIds: [videoId(2)] });

    const acquisition = await acquire(youtube);

    expect(acquisition.metrics).toMatchObject({ videosSelected: 3, videosWithComments: 2, videosSkipped: 1 });
    expect(new Set(acquisition.signals.map((signal) => signal.url))).not.toContain(`https://www.youtube.com/watch?v=${videoId(2)}`);
    // A disabled video is requested once and never retried.
    expect(youtube.listCommentThreads.mock.calls.filter((call) => (call[0] as { videoId: string }).videoId === videoId(2))).toHaveLength(1);
    expect(acquisition.valid).toBe(6);
  });

  it("acota la paginación de comentarios aunque YouTube siempre devuelva pageToken", async () => {
    const youtube = client({ results: [searchResult(1)], threadsPerVideo: 5, nextPageToken: "siempre-hay-mas" });

    const acquisition = await acquire(youtube);

    expect(youtube.listCommentThreads).toHaveBeenCalledTimes(MARKET_RESEARCH_BUDGETS.youtubeMaxCommentPagesPerVideo);
    expect(acquisition.metrics.commentRequests).toBe(2);
    expect(youtube.listCommentThreads.mock.calls[0]?.[0]).toMatchObject({
      videoId: videoId(1),
      maxResults: MARKET_RESEARCH_BUDGETS.youtubeCommentPageSize,
    });
    expect(youtube.listCommentThreads.mock.calls[1]?.[0]).toMatchObject({ pageToken: "siempre-hay-mas" });
  });

  it("limita a 25 comentarios válidos por vídeo para que ninguno domine", async () => {
    const youtube = client({ results: [searchResult(1), searchResult(2, 2)], threadsPerVideo: 60 });

    const acquisition = await acquire(youtube);

    const perVideo = new Map<string, number>();
    for (const signal of acquisition.signals) {
      const url = signal.url ?? "";
      perVideo.set(url, (perVideo.get(url) ?? 0) + 1);
    }
    expect([...perVideo.values()]).toEqual([
      MARKET_RESEARCH_BUDGETS.youtubeMaxCommentsPerVideo,
      MARKET_RESEARCH_BUDGETS.youtubeMaxCommentsPerVideo,
    ]);
    expect(acquisition.valid).toBe(50);
  });

  it("se detiene al alcanzar el objetivo de comentarios sin superar el máximo duro", async () => {
    const many = Array.from({ length: 40 }, (_, index) => searchResult(index + 1, index % 20));
    const youtube = client({ results: many, threadsPerVideo: 30 });

    const acquisition = await acquire(youtube);

    expect(acquisition.valid).toBe(MARKET_RESEARCH_BUDGETS.youtubeTargetComments);
    expect(acquisition.valid).toBeLessThanOrEqual(MARKET_RESEARCH_BUDGETS.youtubeMaxComments);
    expect(acquisition.metrics.stopReason).toBe("target_reached");
    // Acquisition stopped early: later selected videos were never requested.
    expect(acquisition.metrics.videosWithComments).toBe(12);
    expect(youtube.listCommentThreads.mock.calls.length).toBeLessThan(acquisition.metrics.videosSelected);
  });

  it("informa que no hubo vídeos sin inventar un motivo de parada", async () => {
    const youtube = client({ results: [] });

    const acquisition = await acquire(youtube);

    expect(acquisition).toMatchObject({ valid: 0, returned: 0 });
    expect(acquisition.metrics).toMatchObject({ stopReason: "no_videos", videosDiscovered: 0, commentsFetched: 0 });
    expect(youtube.listCommentThreads).not.toHaveBeenCalled();
  });

  it("acota las respuestas y conserva la relación con su comentario padre", async () => {
    const youtube = client({
      results: [searchResult(1)],
      threadsPerVideo: 2,
      threadOptions: { embedded: 1, totalReplyCount: 40 },
      withReplies: true,
    });

    const acquisition = await acquire(youtube);

    expect(youtube.listReplies).toHaveBeenCalled();
    expect(acquisition.metrics.replyRequests).toBeLessThanOrEqual(MARKET_RESEARCH_BUDGETS.youtubeMaxReplyRequests);
    for (const call of (youtube.listReplies as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toMatchObject({ maxResults: MARKET_RESEARCH_BUDGETS.youtubeMaxRepliesPerThread });
    }
    // No reply thread is expanded beyond the per-thread ceiling.
    const replySignals = acquisition.signals.filter((signal) => {
      const context = JSON.parse(signal.context ?? "{}") as { comment?: { isReply?: boolean } };
      return context.comment?.isReply === true;
    });
    expect(replySignals.length).toBeGreaterThan(0);
    for (const signal of replySignals) {
      const context = JSON.parse(signal.context ?? "{}") as { comment?: { parentCommentId?: string; threadId?: string } };
      expect(context.comment?.parentCommentId).toMatch(/^c-1-\d$/u);
      expect(context.comment?.threadId).toMatch(/^t-1-\d$/u);
    }
    expect(acquisition.valid).toBeLessThanOrEqual(MARKET_RESEARCH_BUDGETS.youtubeMaxCommentsPerVideo);
  });

  it("conserva la trazabilidad consulta -> vídeo -> comentario y el texto original intacto", async () => {
    const original = "  El sustrato   se seca en un día\ny nada sobrevive  ";
    const youtube = client({ results: [searchResult(7, 3)], threadsPerVideo: 1, withEnrichment: true });
    youtube.listCommentThreads.mockImplementation(async () => ({
      items: [{
        threadId: "t-7-0",
        topLevelComment: comment("c-7-0", original),
        totalReplyCount: 0,
        embeddedReplies: [],
      }],
    }));

    const acquisition = await acquire(youtube);
    const signal = acquisition.signals[0];

    expect(signal).toMatchObject({
      source: "youtube",
      sourceId: "youtube-comment:c-7-0",
      url: `https://www.youtube.com/watch?v=${videoId(7)}`,
      capturedAt: "2026-02-02T00:00:00.000Z",
      query: TOPIC,
    });
    expect(signal?.provenance).toMatchObject({ provider: "youtube-data-api/v3", source: "youtube", query: TOPIC });
    // Only the surrounding whitespace is trimmed: inner spacing, line breaks and
    // wording stay byte-for-byte as the customer wrote them.
    expect(signal?.text).toBe("El sustrato   se seca en un día\ny nada sobrevive");
    const context = JSON.parse(signal?.context ?? "{}") as { video?: Record<string, unknown>; comment?: Record<string, unknown> };
    expect(context.video).toMatchObject({ videoId: videoId(7), viewCount: 12_000, commentCount: 250 });
    expect(context.comment).toMatchObject({ commentId: "c-7-0", threadId: "t-7-0", isReply: false });
    expect(acquisition.candidates[0]).toMatchObject({ videoId: videoId(7), query: TOPIC, angle: "direct_problem", queryLanguage: "global" });
  });

  it("cuenta señales únicas y descartadas sin exponer secretos", async () => {
    const youtube = client({ results: [searchResult(1)], threadsPerVideo: 40 });

    const acquisition = await acquire(youtube);

    expect(acquisition.metrics.commentsFetched).toBe(40);
    expect(acquisition.metrics.commentsValid).toBe(25);
    expect(acquisition.metrics.commentsUnique).toBe(25);
    expect(acquisition.metrics.commentsDiscarded).toBe(15);
    expect(acquisition.metrics.channelsRepresented).toBe(1);
    const payload = JSON.stringify(acquisition);
    for (const secret of ["apiKey", "api_key", "authorization", "Bearer", "key="]) {
      expect(payload.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it("propaga el fallo del proveedor sin reintentos cuando no descubrió nada", async () => {
    const youtube = client();
    youtube.searchVideos.mockRejectedValue(new IntegrationError("http_rate_limit", "YouTube limitó las solicitudes."));

    await expect(acquire(youtube)).rejects.toBeInstanceOf(IntegrationError);
    // One attempt per failing lane is impossible: discovery stops at the first error.
    expect(youtube.searchVideos).toHaveBeenCalledTimes(1);
    expect(youtube.listCommentThreads).not.toHaveBeenCalled();
  });

  it("detiene el descubrimiento tras un fallo pero conserva lo ya encontrado", async () => {
    const youtube = client({ results: [searchResult(1)] });
    youtube.searchVideos
      .mockResolvedValueOnce({ items: [searchResult(1)] })
      .mockRejectedValue(new IntegrationError("http_rate_limit", "límite"));

    const acquisition = await acquire(youtube);

    expect(youtube.searchVideos).toHaveBeenCalledTimes(2);
    expect(acquisition.metrics).toMatchObject({ videosDiscovered: 1, searchRequests: 2 });
    expect(acquisition.valid).toBe(3);
  });
});

describe("Phase 20.7A persisted Research compatibility", () => {
  it("no consulta YouTube al restaurar latest/history ni al recorrer la evidencia", async () => {
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
      const youtube = client();
      const reader = new MarketResearchService(database, {
        clients: { youtube: Object.assign(youtube, { configured: true }) as never },
        analyzers: {},
      });
      const run = (projectId: string, topic: string): MarketResearchRun => ({
        runId: projectId,
        projectId,
        topic,
        startedAt: "2026-03-01T00:00:00.000Z",
        completedAt: "2026-03-01T00:00:00.000Z",
        durationMs: 10,
        providers: [{ provider: "youtube", state: "available", requested: MARKET_RESEARCH_BUDGETS.youtubeTargetComments, returned: 40, valid: 25, unique: 25, duplicates: 0, analyzed: 20, scrapedPages: 0, latencyMs: 5, failure: null, usage: null, credits: null }],
        metrics: { requestedSignals: 300, returnedSignals: 40, validSignals: 25, uniqueSignals: 25, duplicatesRemoved: 0, analyzedSignals: 20, discardedByAnalysisBudget: 5, deepenedSignals: 0 },
        analysis: { analyzer: "deepseek", model: "deepseek-v4-flash", fallbackUsed: false, primaryFailure: null, analyzedSignals: 20, rejectedClaims: 0, inputTokens: 10, outputTokens: 5, failure: null },
        findings: [{ id: "F1", category: "pains", statement: "El sustrato se seca", customerLanguage: null, signalIds: ["S1"], supportingSignals: 1, independentProviders: 1, domainDiversity: 1, recentSignals: 1, repeatedEvidence: false, contradictingSignals: 0, confidence: "single_signal" }],
        signals: [{ id: "S1", provider: "youtube", source: "youtube", sourceId: "youtube-comment:c-1-0", url: `https://www.youtube.com/watch?v=${videoId(1)}`, capturedAt: "2026-02-02T00:00:00.000Z", text: "El sustrato se seca en un día en mi balcón", deepened: false }],
      });
      for (const project of [balcony, other]) {
        const persisted = run(project.id, project.id === balcony.id ? "huerto de balcón" : "organización de fotografías");
        database.connection.prepare(`
          INSERT INTO generations (
            id, project_id, agent_key, provider, model, status, input_snapshot, output_data,
            prompt_version, input_tokens, output_tokens, estimated_cost, duration_ms,
            error_code, error_message, created_at, completed_at
          ) VALUES (?, ?, ?, 'deepseek', 'deepseek-v4-flash', 'COMPLETED', '{}', ?, 'market-research-v1', 0, 0, 0, 1, NULL, NULL, ?, ?)
        `).run(persisted.runId, persisted.projectId, MARKET_RESEARCH_AGENT_KEY, JSON.stringify(persisted), persisted.completedAt, persisted.completedAt);
      }

      // Deeper acquisition did not change the persisted contract: runs still restore.
      expect(reader.latest(balcony.id)?.topic).toBe("huerto de balcón");
      expect(reader.history(balcony.id).map((item) => item.topic)).toEqual(["huerto de balcón"]);
      expect(reader.latest(other.id)?.topic).toBe("organización de fotografías");
      expect(reader.latest(balcony.id)?.signals[0]?.provider).toBe("youtube");
      expect(youtube.searchVideos).not.toHaveBeenCalled();
      expect(youtube.listCommentThreads).not.toHaveBeenCalled();
    } finally {
      database.close();
    }
  });
});
