import { MARKET_RESEARCH_BUDGETS, type MarketResearchRun } from "@our-platform/shared";
import { describe, expect, it, vi } from "vitest";

import { IntegrationError } from "../src/integrations/integration-error.js";
import type { YouTubeComment, YouTubeSearchResult, YouTubeThread } from "../src/integrations/youtube-adapter.js";
import {
  acquireYouTubeDeepResearchSignals,
  type YouTubeDeepResearchClient,
} from "../src/services/youtube-deep-research-acquisition.js";
import {
  YouTubeEvidenceDeduper,
  youtubeCommentRejection,
  youtubeEvidenceComparable,
} from "../src/services/youtube-evidence-quality.js";

const TOPIC = "huerto de balcón";

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

function searchResult(index: number, channelIndex = index): YouTubeSearchResult {
  return {
    videoId: videoId(index),
    title: `Video ${index}`,
    description: `Descripción ${index}`,
    channelId: `channel-${channelIndex}`,
    channelTitle: `Canal ${channelIndex}`,
    publishedAt: "2026-02-01T00:00:00Z",
  };
}

interface MockedYouTubeClient {
  readonly searchVideos: ReturnType<typeof vi.fn>;
  readonly getVideo: ReturnType<typeof vi.fn>;
  readonly listCommentThreads: ReturnType<typeof vi.fn>;
  readonly getVideos?: ReturnType<typeof vi.fn> | undefined;
  readonly listReplies?: ReturnType<typeof vi.fn> | undefined;
}

function acquire(youtube: MockedYouTubeClient, topic: string = TOPIC) {
  return acquireYouTubeDeepResearchSignals(youtube as unknown as YouTubeDeepResearchClient, { topic });
}

/** Builds a client whose videos return exactly the supplied comment texts. */
function clientWithTexts(
  textsByVideo: readonly (readonly string[])[],
  options: { readonly author?: string; readonly channelIndexes?: readonly number[] } = {},
): MockedYouTubeClient {
  const results = textsByVideo.map((_, index) =>
    searchResult(index + 1, options.channelIndexes?.[index] ?? index + 1));
  return {
    searchVideos: vi.fn(async () => ({ items: results })),
    getVideo: vi.fn(async () => undefined),
    listCommentThreads: vi.fn(async (request: { videoId: string }) => {
      const index = (Number(request.videoId.replace(/^v0*/u, "")) || 1) - 1;
      const texts = textsByVideo[index] ?? [];
      return {
        items: texts.map((text, threadIndex): YouTubeThread => ({
          threadId: `t-${index}-${threadIndex}`,
          topLevelComment: comment(`c-${index}-${threadIndex}`, text, ...(options.author === undefined ? [] : [{ author: options.author }])),
          totalReplyCount: 0,
          embeddedReplies: [],
        })),
      };
    }),
  };
}

describe("Phase 20.7B deterministic quality filter", () => {
  it("rechaza evidencia estructuralmente inservible", () => {
    expect(youtubeCommentRejection({ text: "" })).toBe("blank");
    expect(youtubeCommentRejection({ text: "   \n\t  " })).toBe("blank");
    expect(youtubeCommentRejection({ text: "https://spam.test/oferta" })).toBe("link_only");
    expect(youtubeCommentRejection({ text: "mira www.spam.test/promo" })).toBeNull();
    expect(youtubeCommentRejection({ text: "www.spam.test/promo https://otro.test" })).toBe("link_only");
    expect(youtubeCommentRejection({ text: "🔥🔥🔥" })).toBe("symbols_only");
    expect(youtubeCommentRejection({ text: "!!!! ???? ..." })).toBe("symbols_only");
    expect(youtubeCommentRejection({ text: "aaaaaaaaaa" })).toBe("repeated_characters");
    expect(youtubeCommentRejection({ text: "jajajajaja" })).toBe("repeated_characters");
    expect(youtubeCommentRejection({ text: "ok" })).toBe("low_information");
    expect(youtubeCommentRejection({ text: "gracias" })).toBe("low_information");
    expect(youtubeCommentRejection({ text: "primero" })).toBe("low_information");
    expect(youtubeCommentRejection({ text: "ok gracias" })).toBe("low_information");
  });

  it("conserva quejas y objeciones cortas pero significativas", () => {
    // Short, negative and simple is still real customer language.
    for (const text of [
      "se me mueren todas",
      "too expensive",
      "this didn't work",
      "carísimo",
      "no germina nada",
      "se seca en un día",
      "muy bueno el sustrato",
      "太高い です",
    ]) {
      expect(youtubeCommentRejection({ text })).toBeNull();
    }
  });

  it("sólo descarta plantilla de creador cuando el autor es el propio canal", () => {
    const promo = "Suscríbete y activa la campanita, link en la descripción";
    expect(youtubeCommentRejection({ text: promo, author: "Canal 1", channelTitle: "Canal 1" })).toBe("creator_boilerplate");
    // The same words from a viewer are not creator boilerplate.
    expect(youtubeCommentRejection({ text: promo, author: "Espectadora", channelTitle: "Canal 1" })).toBeNull();
    // A creator comment that is not boilerplate stays as evidence.
    expect(youtubeCommentRejection({ text: "El sustrato se seca porque riegas de más", author: "Canal 1", channelTitle: "Canal 1" })).toBeNull();
  });

  it("deriva la forma de comparación sin tocar el texto original", () => {
    const original = "  El   SUSTRATO se Seca!!!  https://x.test/a  ";
    expect(youtubeEvidenceComparable(original)).toBe("el sustrato se seca");
    expect(original).toBe("  El   SUSTRATO se Seca!!!  https://x.test/a  ");
  });
});

describe("Phase 20.7B exact and near duplicate detection", () => {
  it("colapsa duplicados exactos normalizados y cuenta un solo representante", () => {
    const deduper = new YouTubeEvidenceDeduper();
    expect(deduper.classify({ text: "El sustrato se seca en un día" })).toBe("unique");
    expect(deduper.classify({ text: "el   SUSTRATO se seca en un día!!!" })).toBe("exact_duplicate");
    expect(deduper.classify({ text: "El sustrato se seca en un día." })).toBe("exact_duplicate");
    expect(deduper.size).toBe(1);
  });

  it("colapsa reposts casi idénticos de forma conservadora", () => {
    const deduper = new YouTubeEvidenceDeduper();
    expect(deduper.classify({ text: "Gran video, me ayudó mucho a entender el riego del balcón" })).toBe("unique");
    expect(deduper.classify({ text: "Gran video, me ayudó mucho a entender el riego del balcon amigo" })).toBe("near_duplicate");
    expect(deduper.size).toBe(1);
  });

  it("no fusiona experiencias distintas ni detalles numéricos diferentes", () => {
    const deduper = new YouTubeEvidenceDeduper();
    expect(deduper.classify({ text: "El sustrato se secó en 3 semanas y perdí los tomates" })).toBe("unique");
    // Same wording, different number: a different reported experience.
    expect(deduper.classify({ text: "El sustrato se secó en 5 semanas y perdí los tomates" })).toBe("unique");
    // Same vocabulary, different order and meaning.
    expect(deduper.classify({ text: "Perdí los tomates y el sustrato se secó en 8 semanas" })).toBe("unique");
    expect(deduper.classify({ text: "Mis plantas se mueren por exceso de riego en el balcón" })).toBe("unique");
    expect(deduper.classify({ text: "Mis plantas crecen perfectas con poco riego en el balcón" })).toBe("unique");
    expect(deduper.size).toBe(5);
  });

  it("nunca fusiona comentarios cortos ni de idiomas declarados distintos", () => {
    const deduper = new YouTubeEvidenceDeduper();
    // Below the token floor, near matching never applies.
    expect(deduper.classify({ text: "too expensive" })).toBe("unique");
    expect(deduper.classify({ text: "too expensive!" })).toBe("exact_duplicate");
    expect(deduper.classify({ text: "very expensive" })).toBe("unique");
    expect(deduper.classify({ text: "no funciona" })).toBe("unique");
    expect(deduper.classify({ text: "this did not work for me at all", language: "en" })).toBe("unique");
    expect(deduper.classify({ text: "this did not work for me at all", language: "es" })).toBe("exact_duplicate");
    // Declared languages differ, so a near match is refused outright.
    expect(deduper.classify({ text: "this did not work for me at home", language: "es-419" })).toBe("unique");
  });

  it("mantiene acotadas las comparaciones en el techo de 500 comentarios", () => {
    const deduper = new YouTubeEvidenceDeduper();
    for (let index = 0; index < MARKET_RESEARCH_BUDGETS.youtubeMaxComments; index += 1) {
      deduper.classify({ text: `Comentario número ${index} sobre el riego y el sustrato del balcón` });
    }
    // Every item is distinct, and the bounded index still admits all of them.
    expect(deduper.size).toBe(MARKET_RESEARCH_BUDGETS.youtubeMaxComments);
    expect(MARKET_RESEARCH_BUDGETS.youtubeNearDuplicateMaxComparisons).toBeLessThanOrEqual(64);
  });
});

describe("Phase 20.7B filtering during acquisition", () => {
  it("descuenta la basura y cuenta cada motivo de rechazo", async () => {
    const youtube = clientWithTexts([[
      "El sustrato se seca en un solo día y pierdo las plantas",
      "   ",
      "https://spam.test/oferta",
      "🔥🔥🔥",
      "jajajajaja",
      "gracias",
      "El sustrato se seca en un solo día y pierdo las plantas",
      "Mis tomates no germinan con este riego automático",
    ]]);

    const acquisition = await acquire(youtube);

    expect(acquisition.metrics.commentsFetched).toBe(8);
    // Whitespace-only text cannot even be normalized, so it is a structural
    // rejection; the quality gate reports the four it is responsible for.
    expect(acquisition.metrics.structurallyRejected).toBe(1);
    expect(acquisition.metrics.qualityRejected).toBe(4);
    expect(acquisition.metrics.qualityRejections).toMatchObject({
      blank: 0, link_only: 1, symbols_only: 1, repeated_characters: 1, low_information: 1, creator_boilerplate: 0,
    });
    expect(acquisition.metrics.exactDuplicatesRemoved).toBe(1);
    expect(acquisition.valid).toBe(2);
    expect(acquisition.metrics.commentsValid).toBe(2);
    expect(acquisition.signals.map((signal) => signal.text)).toEqual([
      "El sustrato se seca en un solo día y pierdo las plantas",
      "Mis tomates no germinan con este riego automático",
    ]);
  });

  it("el objetivo de 300 cuenta evidencia usable y única, no comentarios crudos", async () => {
    // Each video interleaves 25 unusable items with 25 usable ones, so the gate
    // must actually reject to reach the per-video allowance.
    const texts = Array.from({ length: 20 }, (_, videoIndex) =>
      Array.from({ length: 50 }, (_, index) => index % 2 === 0
        ? "🔥"
        : `Video ${videoIndex + 1} problema ${index}: el sustrato se seca y las plantas mueren`));
    const youtube = clientWithTexts(texts);

    const acquisition = await acquire(youtube);

    expect(acquisition.valid).toBe(MARKET_RESEARCH_BUDGETS.youtubeTargetComments);
    expect(acquisition.metrics.stopReason).toBe("target_reached");
    expect(acquisition.metrics.qualityRejected).toBeGreaterThan(0);
    // Raw fetched greatly exceeds retained, and retained is the target.
    expect(acquisition.metrics.commentsFetched).toBeGreaterThan(acquisition.valid);
    expect(acquisition.metrics.commentsFetched).toBeLessThanOrEqual(MARKET_RESEARCH_BUDGETS.youtubeMaxRawComments);
    expect(acquisition.metrics.commentsValid).toBe(300);
  });

  it("no supera el techo de comentarios crudos mientras persigue el objetivo", async () => {
    // Every video returns 50 unusable comments: the target is unreachable.
    const texts = Array.from({ length: 40 }, () => Array.from({ length: 50 }, (_, index) => `🔥${"!".repeat(index % 3)}`));
    const youtube = clientWithTexts(texts);

    const acquisition = await acquire(youtube);

    expect(acquisition.valid).toBe(0);
    expect(acquisition.metrics.commentsFetched).toBeLessThanOrEqual(MARKET_RESEARCH_BUDGETS.youtubeMaxRawComments);
    // Saturation ends the run long before the raw ceiling is approached.
    expect(acquisition.metrics.stopReason).toBe("acquisition_saturation");
    expect(youtube.listCommentThreads.mock.calls.length).toBeLessThanOrEqual(MARKET_RESEARCH_BUDGETS.youtubeMaxVideos);
  });

  it("conserva el bound por vídeo y la diversidad de canales en la evidencia retenida", async () => {
    const texts = Array.from({ length: 6 }, (_, videoIndex) =>
      Array.from({ length: 40 }, (_, index) => `Video ${videoIndex + 1} caso ${index}: el riego automático falla y el sustrato se seca`));
    // Two videos per channel: three channels in total.
    const youtube = clientWithTexts(texts, { channelIndexes: [1, 1, 2, 2, 3, 3] });

    const acquisition = await acquire(youtube);

    expect(acquisition.metrics.maxCommentsFromOneVideo).toBe(MARKET_RESEARCH_BUDGETS.youtubeMaxCommentsPerVideo);
    expect(acquisition.metrics.distinctVideosRepresented).toBe(6);
    expect(acquisition.metrics.distinctChannelsRepresented).toBe(3);
    expect(acquisition.metrics.maxCommentsFromOneChannel).toBe(50);
    expect(acquisition.valid).toBe(150);
  });

  it("las respuestas participan en el filtro y el dedupe sin perder su relación", async () => {
    const parentText = "El sustrato se seca en un día entero y pierdo el cultivo";
    const youtube: MockedYouTubeClient = {
      searchVideos: vi.fn(async () => ({ items: [searchResult(1)] })),
      getVideo: vi.fn(async () => undefined),
      listCommentThreads: vi.fn(async () => ({
        items: [{
          threadId: "t-1-0",
          topLevelComment: comment("c-1-0", parentText),
          totalReplyCount: 4,
          embeddedReplies: [
            // Rejected: emoji only.
            comment("c-1-0-r0", "🔥", { parentCommentId: "c-1-0", isReply: true }),
            // Rejected: exact duplicate of its parent.
            comment("c-1-0-r1", parentText, { parentCommentId: "c-1-0", isReply: true }),
            // Retained: genuine additional evidence.
            comment("c-1-0-r2", "A mí me pasó igual pero con lechugas en pleno agosto", { parentCommentId: "c-1-0", isReply: true }),
          ],
        }],
      })),
    };

    const acquisition = await acquire(youtube);

    expect(acquisition.valid).toBe(2);
    expect(acquisition.metrics).toMatchObject({ repliesRetained: 1, exactDuplicatesRemoved: 1, qualityRejected: 1 });
    const reply = acquisition.signals[1];
    expect(reply?.text).toBe("A mí me pasó igual pero con lechugas en pleno agosto");
    const context = JSON.parse(reply?.context ?? "{}") as { comment?: { parentCommentId?: string; threadId?: string; isReply?: boolean } };
    expect(context.comment).toMatchObject({ parentCommentId: "c-1-0", threadId: "t-1-0", isReply: true });
  });

  it("conserva toda la procedencia y la compatibilidad con MarketSignal tras filtrar", async () => {
    const youtube = clientWithTexts([["🔥", "El riego automático del balcón nunca funcionó como prometían"]]);

    const acquisition = await acquire(youtube);
    const signal = acquisition.signals[0];

    expect(signal).toMatchObject({
      source: "youtube",
      sourceId: "youtube-comment:c-0-1",
      url: `https://www.youtube.com/watch?v=${videoId(1)}`,
      query: TOPIC,
      capturedAt: "2026-02-02T00:00:00.000Z",
    });
    expect(signal?.text).toBe("El riego automático del balcón nunca funcionó como prometían");
    expect(signal?.provenance).toMatchObject({
      provider: "youtube-data-api/v3",
      source: "youtube",
      query: TOPIC,
      normalizationVersion: "market-signal/v1",
    });
    expect(acquisition.candidates[0]).toMatchObject({ query: TOPIC, angle: "direct_problem", queryLanguage: "global" });
  });
});

describe("Phase 20.7B acquisition saturation", () => {
  const lowYield = (videoIndex: number) => [
    `Video ${videoIndex} único: el sustrato se seca demasiado rápido en verano`,
    "🔥",
    "gracias",
  ];
  const highYield = (videoIndex: number) =>
    Array.from({ length: 10 }, (_, index) => `Video ${videoIndex} caso ${index}: el riego automático falla siempre`);

  it("no se detiene por un solo lote pobre", async () => {
    const youtube = clientWithTexts([lowYield(1), highYield(2), highYield(3), highYield(4)]);

    const acquisition = await acquire(youtube);

    expect(acquisition.metrics.stopReason).toBe("videos_exhausted");
    expect(acquisition.metrics.distinctVideosRepresented).toBe(4);
    expect(acquisition.metrics.lowYieldBatches).toBe(0);
  });

  it("se detiene tras los lotes de bajo rendimiento consecutivos requeridos", async () => {
    const youtube = clientWithTexts([
      highYield(1), lowYield(2), lowYield(3), lowYield(4), highYield(5), highYield(6),
    ]);

    const acquisition = await acquire(youtube);

    expect(acquisition.metrics.stopReason).toBe("acquisition_saturation");
    expect(acquisition.metrics.lowYieldBatches).toBe(MARKET_RESEARCH_BUDGETS.youtubeSaturationBatches);
    // Acquisition stopped: the later productive videos were never requested.
    expect(youtube.listCommentThreads).toHaveBeenCalledTimes(4);
    expect(acquisition.metrics.distinctVideosRepresented).toBe(4);
  });

  it("la evidencia nueva y útil reinicia el contador de bajo rendimiento", async () => {
    const youtube = clientWithTexts([
      lowYield(1), lowYield(2), highYield(3), lowYield(4), lowYield(5), highYield(6),
    ]);

    const acquisition = await acquire(youtube);

    expect(acquisition.metrics.stopReason).toBe("videos_exhausted");
    expect(youtube.listCommentThreads).toHaveBeenCalledTimes(6);
    expect(acquisition.metrics.lowYieldBatches).toBe(0);
  });

  it("los vídeos sin comentarios no cuentan como saturación de adquisición", async () => {
    const youtube = clientWithTexts([highYield(1), [], [], [], highYield(5)]);
    youtube.listCommentThreads.mockImplementation(async (request: { videoId: string }) => {
      if ([videoId(2), videoId(3), videoId(4)].includes(request.videoId)) {
        throw new IntegrationError("http_provider_error", "YouTube respondió con HTTP 403.");
      }
      const index = (Number(request.videoId.replace(/^v0*/u, "")) || 1) - 1;
      return {
        items: highYield(index + 1).map((text, threadIndex) => ({
          threadId: `t-${index}-${threadIndex}`,
          topLevelComment: comment(`c-${index}-${threadIndex}`, text),
          totalReplyCount: 0,
          embeddedReplies: [],
        })),
      };
    });

    const acquisition = await acquire(youtube);

    // Unavailable comments are reported as skipped videos, never as saturation.
    expect(acquisition.metrics).toMatchObject({ videosSkipped: 3, stopReason: "videos_exhausted", lowYieldBatches: 0 });
    expect(acquisition.metrics.distinctVideosRepresented).toBe(2);
  });
});

describe("Phase 20.7B persisted Research compatibility", () => {
  it("mantiene restore, aislamiento por proyecto y cero llamadas a proveedores", async () => {
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
      const youtube = clientWithTexts([["El sustrato se seca en un día y pierdo todo el cultivo"]]);
      const reader = new MarketResearchService(database, {
        clients: { youtube: Object.assign(youtube, { configured: true }) as never },
        analyzers: {},
      });
      const persisted = (projectId: string, topic: string): MarketResearchRun => ({
        runId: projectId,
        projectId,
        topic,
        startedAt: "2026-03-01T00:00:00.000Z",
        completedAt: "2026-03-01T00:00:00.000Z",
        durationMs: 10,
        providers: [{ provider: "youtube", state: "available", requested: 300, returned: 800, valid: 300, unique: 300, duplicates: 0, analyzed: 20, scrapedPages: 0, latencyMs: 5, failure: null, usage: null, credits: null }],
        metrics: { requestedSignals: 300, returnedSignals: 800, validSignals: 300, uniqueSignals: 300, duplicatesRemoved: 0, analyzedSignals: 20, discardedByAnalysisBudget: 280, deepenedSignals: 0 },
        analysis: { analyzer: "deepseek", model: "deepseek-v4-flash", fallbackUsed: false, primaryFailure: null, analyzedSignals: 20, rejectedClaims: 0, inputTokens: 10, outputTokens: 5, failure: null },
        findings: [{ id: "F1", category: "pains", statement: "El sustrato se seca", customerLanguage: null, signalIds: ["S1"], supportingSignals: 1, independentProviders: 1, domainDiversity: 1, recentSignals: 1, repeatedEvidence: false, contradictingSignals: 0, confidence: "single_signal" }],
        signals: [{ id: "S1", provider: "youtube", source: "youtube", sourceId: "youtube-comment:c-0-0", url: `https://www.youtube.com/watch?v=${videoId(1)}`, capturedAt: "2026-02-02T00:00:00.000Z", text: "El sustrato se seca en un día", deepened: false }],
      });
      for (const project of [balcony, other]) {
        const run = persisted(project.id, project.id === balcony.id ? "huerto de balcón" : "fotografía digital");
        database.connection.prepare(`
          INSERT INTO generations (
            id, project_id, agent_key, provider, model, status, input_snapshot, output_data,
            prompt_version, input_tokens, output_tokens, estimated_cost, duration_ms,
            error_code, error_message, created_at, completed_at
          ) VALUES (?, ?, ?, 'deepseek', 'deepseek-v4-flash', 'COMPLETED', '{}', ?, 'market-research-v1', 0, 0, 0, 1, NULL, NULL, ?, ?)
        `).run(run.runId, run.projectId, MARKET_RESEARCH_AGENT_KEY, JSON.stringify(run), run.completedAt, run.completedAt);
      }

      expect(reader.latest(balcony.id)?.topic).toBe("huerto de balcón");
      expect(reader.history(balcony.id).map((item) => item.topic)).toEqual(["huerto de balcón"]);
      expect(reader.latest(other.id)?.topic).toBe("fotografía digital");
      expect(reader.latest(balcony.id)?.signals[0]?.provider).toBe("youtube");
      expect(youtube.searchVideos).not.toHaveBeenCalled();
      expect(youtube.listCommentThreads).not.toHaveBeenCalled();
    } finally {
      database.close();
    }
  });
});
