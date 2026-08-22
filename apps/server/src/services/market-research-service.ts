import {
  MARKET_RESEARCH_BUDGETS,
  MARKET_RESEARCH_PROVIDERS,
  marketResearchProviderBudget,
  MarketResearchRunSchema,
  type MarketResearchProvider,
  type MarketResearchProviderState,
  type MarketResearchRun,
  type MarketResearchStatus,
  type MarketResearchYouTubeRelevanceProvenance,
} from "@our-platform/shared";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database/database.js";
import { DEEPSEEK_DEFAULT_MODEL } from "../integrations/deepseek-provider.js";
import { GEMINI_ANALYSIS_MODEL } from "./module-service.js";
import {
  acquireMarketResearchSignals,
  type MarketResearchClients,
} from "./market-research-orchestrator.js";
import {
  mineMarketResearchFindings,
  type MarketResearchAnalyzerClient,
} from "./market-research-semantic-miner.js";
import { createYouTubeRelevanceReviewer } from "./youtube-relevance-reviewer.js";
import { resolveYouTubeMinimumDurationSeconds } from "./youtube-research-relevance.js";
import { LearningMemoryService } from "./knowledge/learning-memory-service.js";
import { InternalSkillResolver } from "./skills/skill-resolver.js";
import { planMemoryAwareYouTubeQueries } from "./youtube-query-planner.js";

export const MARKET_RESEARCH_AGENT_KEY = "market_research";

export interface MarketResearchAnalyzers {
  /** DeepSeek Flash: the primary semantic analyzer. */
  readonly deepSeek?: MarketResearchAnalyzerClient & { readonly effectiveModel?: string };
  /** Gemini: fallback only, never invoked after a successful DeepSeek analysis. */
  readonly gemini?: MarketResearchAnalyzerClient;
}

export interface MarketResearchServiceOptions {
  readonly clients: MarketResearchClients;
  readonly analyzers: MarketResearchAnalyzers;
  /** Injectable clock keeps acquisition adapters and freshness deterministic in tests. */
  readonly now?: () => Date;
}

export interface RunMarketResearchOptions {
  readonly topic: string;
  readonly providers?: readonly MarketResearchProvider[];
  readonly youtubeMinimumDurationSeconds?: number;
}

function providerState(configured: boolean | undefined): MarketResearchProviderState {
  return configured === true ? "available" : "not_configured";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Strict RFC 3339 date-time check. Date.parse is deliberately avoided because it
 * silently normalizes impossible calendar dates (e.g. 2026-02-29), which would
 * let a corrupted ledger timestamp pass validation.
 */
function isIsoDateTime(value: string): boolean {
  const match = DATE_TIME_PATTERN.exec(value);
  if (match === null) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const numericHour = Number(hour);
  const numericMinute = Number(minute);
  const numericSecond = Number(second);
  if (numericMonth < 1 || numericMonth > 12) return false;
  if (numericDay < 1 || numericDay > daysInMonth(Number(year), numericMonth)) return false;
  if (numericHour > 23 || numericMinute > 59) return false;
  // Second 60 is only valid as a leap second at 23:59 UTC-equivalent minutes.
  if (numericSecond > 60 || (numericSecond === 60 && numericMinute !== 59)) return false;
  if (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) return false;
  return true;
}

// Value.Check deliberately relies on an application format registry. Register
// only the standard formats used by the persisted shared contract.
if (!FormatRegistry.Has("uuid")) FormatRegistry.Set("uuid", (value) => UUID_PATTERN.test(value));
if (!FormatRegistry.Has("date-time")) FormatRegistry.Set("date-time", isIsoDateTime);

function projectYouTubeRelevance(
  relevance: MarketResearchYouTubeRelevanceProvenance,
): MarketResearchYouTubeRelevanceProvenance {
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

function restorePersistedMarketResearchRun(
  outputData: string | null,
  projectId: string,
  generationId: string,
): MarketResearchRun | null {
  if (outputData === null) return null;
  try {
    const candidate: unknown = JSON.parse(outputData);
    if (!Value.Check(MarketResearchRunSchema, candidate)) return null;
    const run = candidate as MarketResearchRun;
    if (run.projectId !== projectId || run.runId !== generationId) return null;
    const persistedSignalIds = new Set(run.signals.map((signal) => signal.id));
    if (run.findings.some((finding) => finding.signalIds.some((signalId) => !persistedSignalIds.has(signalId)))) return null;

    // Explicit projection prevents legacy or manually altered ledger fields from
    // becoming an accidental public response, even when the JSON is otherwise valid.
    return {
      runId: run.runId,
      projectId: run.projectId,
      topic: run.topic,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
      providers: run.providers.map((report) => ({
        provider: report.provider, state: report.state, requested: report.requested,
        returned: report.returned, valid: report.valid, unique: report.unique,
        duplicates: report.duplicates, analyzed: report.analyzed, scrapedPages: report.scrapedPages,
        latencyMs: report.latencyMs, failure: report.failure, usage: report.usage, credits: report.credits,
        ...(report.youtube === undefined ? {} : { youtube: {
          queries: report.youtube.queries,
          ...(report.youtube.queryPlanComparison === undefined ? {} : {
            queryPlanComparison: report.youtube.queryPlanComparison,
          }),
          videosDiscovered: report.youtube.videosDiscovered,
          videosSelected: report.youtube.videosSelected,
          videosWithComments: report.youtube.videosWithComments,
          videosSkipped: report.youtube.videosSkipped,
          commentsFetched: report.youtube.commentsFetched,
          commentsValid: report.youtube.commentsValid,
          commentsUnique: report.youtube.commentsUnique,
          commentsDiscarded: report.youtube.commentsDiscarded,
          structurallyRejected: report.youtube.structurallyRejected,
          qualityRejected: report.youtube.qualityRejected,
          exactDuplicatesRemoved: report.youtube.exactDuplicatesRemoved,
          nearDuplicatesRemoved: report.youtube.nearDuplicatesRemoved,
          repliesRetained: report.youtube.repliesRetained,
          distinctVideosRepresented: report.youtube.distinctVideosRepresented,
          distinctChannelsRepresented: report.youtube.distinctChannelsRepresented,
          maxCommentsFromOneVideo: report.youtube.maxCommentsFromOneVideo,
          maxCommentsFromOneChannel: report.youtube.maxCommentsFromOneChannel,
          lowYieldBatches: report.youtube.lowYieldBatches,
          stopReason: report.youtube.stopReason,
          ...(report.youtube.videoMetadataFailures === undefined ? {} : { videoMetadataFailures: report.youtube.videoMetadataFailures }),
          ...(report.youtube.videoDurationRejects === undefined ? {} : { videoDurationRejects: report.youtube.videoDurationRejects }),
          ...(report.youtube.deterministicRelevantVideos === undefined ? {} : { deterministicRelevantVideos: report.youtube.deterministicRelevantVideos }),
          ...(report.youtube.deterministicBorderlineVideos === undefined ? {} : { deterministicBorderlineVideos: report.youtube.deterministicBorderlineVideos }),
          ...(report.youtube.deterministicIrrelevantVideos === undefined ? {} : { deterministicIrrelevantVideos: report.youtube.deterministicIrrelevantVideos }),
          ...(report.youtube.successfulBorderlineReviews === undefined ? {} : { successfulBorderlineReviews: report.youtube.successfulBorderlineReviews }),
          ...(report.youtube.borderlineReviewerFailures === undefined ? {} : { borderlineReviewerFailures: report.youtube.borderlineReviewerFailures }),
          ...(report.youtube.finalRelevantVideos === undefined ? {} : { finalRelevantVideos: report.youtube.finalRelevantVideos }),
          ...(report.youtube.researchRelevantComments === undefined ? {} : { researchRelevantComments: report.youtube.researchRelevantComments }),
          ...(report.youtube.researchIrrelevantComments === undefined ? {} : { researchIrrelevantComments: report.youtube.researchIrrelevantComments }),
          ...(report.youtube.creatorPromotionalCommentsExcluded === undefined ? {} : { creatorPromotionalCommentsExcluded: report.youtube.creatorPromotionalCommentsExcluded }),
          ...(report.youtube.relevanceReviewerAttempts === undefined ? {} : { relevanceReviewerAttempts: report.youtube.relevanceReviewerAttempts }),
          ...(report.youtube.relevanceReviewerFallbackAttempts === undefined ? {} : { relevanceReviewerFallbackAttempts: report.youtube.relevanceReviewerFallbackAttempts }),
          ...(report.youtube.relevanceReviewerInputTokens === undefined ? {} : { relevanceReviewerInputTokens: report.youtube.relevanceReviewerInputTokens }),
          ...(report.youtube.relevanceReviewerOutputTokens === undefined ? {} : { relevanceReviewerOutputTokens: report.youtube.relevanceReviewerOutputTokens }),
          ...(report.youtube.videoRelevanceDecisionAudit === undefined ? {} : {
            videoRelevanceDecisionAudit: report.youtube.videoRelevanceDecisionAudit.map((record) => ({
              videoId: record.videoId,
              channelId: record.channelId,
              selectionOrder: record.selectionOrder,
              relevance: projectYouTubeRelevance(record.relevance),
            })),
          }),
        } }),
      })),
      metrics: {
        requestedSignals: run.metrics.requestedSignals, returnedSignals: run.metrics.returnedSignals,
        validSignals: run.metrics.validSignals, uniqueSignals: run.metrics.uniqueSignals,
        duplicatesRemoved: run.metrics.duplicatesRemoved, analyzedSignals: run.metrics.analyzedSignals,
        discardedByAnalysisBudget: run.metrics.discardedByAnalysisBudget, deepenedSignals: run.metrics.deepenedSignals,
      },
      analysis: {
        analyzer: run.analysis.analyzer, model: run.analysis.model, fallbackUsed: run.analysis.fallbackUsed,
        primaryFailure: run.analysis.primaryFailure, analyzedSignals: run.analysis.analyzedSignals,
        rejectedClaims: run.analysis.rejectedClaims, inputTokens: run.analysis.inputTokens,
        outputTokens: run.analysis.outputTokens, failure: run.analysis.failure,
        ...(run.analysis.youtube === undefined ? {} : { youtube: {
          semanticBatches: run.analysis.youtube.semanticBatches,
          successfulBatches: run.analysis.youtube.successfulBatches,
          failedBatches: run.analysis.youtube.failedBatches,
          analyzedSignals: run.analysis.youtube.analyzedSignals,
          candidateFindings: run.analysis.youtube.candidateFindings,
          rejectedCandidates: run.analysis.youtube.rejectedCandidates,
          citedSignals: run.analysis.youtube.citedSignals,
          citedVideos: run.analysis.youtube.citedVideos,
          citedChannels: run.analysis.youtube.citedChannels,
          languages: [...run.analysis.youtube.languages],
          fallbackBatches: run.analysis.youtube.fallbackBatches,
        } }),
      },
      findings: run.findings.map((finding) => ({
        id: finding.id, category: finding.category, statement: finding.statement,
        customerLanguage: finding.customerLanguage, signalIds: [...finding.signalIds],
        supportingSignals: finding.supportingSignals, independentProviders: finding.independentProviders,
        domainDiversity: finding.domainDiversity, recentSignals: finding.recentSignals,
        repeatedEvidence: finding.repeatedEvidence, contradictingSignals: finding.contradictingSignals,
        confidence: finding.confidence,
        ...(finding.evidenceStrength === undefined ? {} : { evidenceStrength: finding.evidenceStrength }),
        ...(finding.distinctVideos === undefined ? {} : { distinctVideos: finding.distinctVideos }),
        ...(finding.distinctChannels === undefined ? {} : { distinctChannels: finding.distinctChannels }),
        ...(finding.languages === undefined ? {} : { languages: [...finding.languages] }),
      })),
      signals: run.signals.map((signal) => ({
        id: signal.id, provider: signal.provider, source: signal.source, sourceId: signal.sourceId,
        url: signal.url, capturedAt: signal.capturedAt, text: signal.text, deepened: signal.deepened,
        ...(signal.youtube === undefined ? {} : { youtube: {
          videoId: signal.youtube.videoId,
          channelId: signal.youtube.channelId,
          channelTitle: signal.youtube.channelTitle,
          query: signal.youtube.query,
          queryAngle: signal.youtube.queryAngle,
          queryLanguage: signal.youtube.queryLanguage,
          declaredLanguage: signal.youtube.declaredLanguage,
          channelCountry: signal.youtube.channelCountry,
          ...(signal.youtube.relevance === undefined ? {} : {
            relevance: projectYouTubeRelevance(signal.youtube.relevance),
          }),
        } }),
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Server-only composition of the real Research flow: bounded multi-source
 * acquisition, deterministic dedupe, optional deep extraction, then one
 * grounded semantic analysis. Provider credentials never leave this layer.
 */
export class MarketResearchService {
  private readonly now: () => Date;

  constructor(
    private readonly database: AppDatabase,
    private readonly options: MarketResearchServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  status(): MarketResearchStatus {
    const deepSeekModel = this.options.analyzers.deepSeek?.effectiveModel ?? DEEPSEEK_DEFAULT_MODEL;
    return {
      providers: MARKET_RESEARCH_PROVIDERS.map((provider) => ({
        provider,
        state: providerState(this.options.clients[provider]?.configured),
        budget: marketResearchProviderBudget(provider),
      })),
      analyzers: {
        primary: {
          analyzer: "deepseek",
          model: deepSeekModel,
          state: providerState(this.options.analyzers.deepSeek?.configured),
        },
        fallback: {
          analyzer: "gemini",
          model: GEMINI_ANALYSIS_MODEL,
          state: providerState(this.options.analyzers.gemini?.configured),
        },
      },
      budgets: {
        analysisSignals: MARKET_RESEARCH_BUDGETS.analysisSignals,
        analysisSignalChars: MARKET_RESEARCH_BUDGETS.analysisSignalChars,
        firecrawlScrapePages: MARKET_RESEARCH_BUDGETS.firecrawlScrapePages,
        youtubeTargetVideos: MARKET_RESEARCH_BUDGETS.youtubeTargetVideos,
        youtubeTargetComments: MARKET_RESEARCH_BUDGETS.youtubeTargetComments,
        youtubeMaxVideos: MARKET_RESEARCH_BUDGETS.youtubeMaxVideos,
        youtubeMaxComments: MARKET_RESEARCH_BUDGETS.youtubeMaxComments,
        youtubeMinimumDurationSeconds: MARKET_RESEARCH_BUDGETS.youtubeMinimumDurationSeconds,
      },
    };
  }

  async run(projectId: string, options: Readonly<RunMarketResearchOptions>): Promise<MarketResearchRun> {
    const topic = options.topic.trim();
    if (topic.length === 0) throw new Error("El tema a investigar es obligatorio.");
    const youtubeMinimumDurationSeconds = resolveYouTubeMinimumDurationSeconds(options.youtubeMinimumDurationSeconds);
    const startedAtDate = this.now();
    const startedAt = startedAtDate.toISOString();
    const startedMs = startedAtDate.getTime();
    const project = this.database.connection.prepare("SELECT niche FROM projects WHERE id=?").get(projectId) as { niche: string } | undefined;
    const projectContext = project === undefined ? undefined : { projectId, domain: project.niche };
    const resolvedMemory = projectContext === undefined
      ? []
      : new InternalSkillResolver(new LearningMemoryService(this.database)).resolve({
          skillId: "research-intelligence",
          version: 1,
          projectContext: { ...projectContext, query: topic },
        }).retrievedMemory;
    const youtubeShadowQueryPlan = planMemoryAwareYouTubeQueries({
      researchFocus: topic,
      ...(projectContext === undefined ? {} : { projectContext }),
      relevantMemory: resolvedMemory,
    });

    const acquisition = await acquireMarketResearchSignals(this.options.clients, {
      topic,
      retrievedAt: startedAt,
      youtubeShadowQueryPlan,
      youtubeMinimumDurationSeconds,
      youtubeRelevanceReviewer: createYouTubeRelevanceReviewer(
        { analyzer: "deepseek", model: this.options.analyzers.deepSeek?.effectiveModel ?? DEEPSEEK_DEFAULT_MODEL, client: this.options.analyzers.deepSeek },
        { analyzer: "gemini", model: GEMINI_ANALYSIS_MODEL, client: this.options.analyzers.gemini },
      ),
      ...(options.providers === undefined ? {} : { providers: options.providers }),
    });

    const { findings, analysis, analyzedSignalIds } = await mineMarketResearchFindings({
      topic,
      signals: acquisition.signals,
      referenceAt: startedAt,
      primary: {
        analyzer: "deepseek",
        model: this.options.analyzers.deepSeek?.effectiveModel ?? DEEPSEEK_DEFAULT_MODEL,
        client: this.options.analyzers.deepSeek,
      },
      fallback: {
        analyzer: "gemini",
        model: GEMINI_ANALYSIS_MODEL,
        client: this.options.analyzers.gemini,
      },
    });

    const analyzed = new Set(analyzedSignalIds);
    const analyzedByProvider = new Map<MarketResearchProvider, number>();
    for (const signal of acquisition.signals) {
      if (analyzed.has(signal.id)) {
        analyzedByProvider.set(signal.provider, (analyzedByProvider.get(signal.provider) ?? 0) + 1);
      }
    }
    const completedAtDate = this.now();
    const runId = uuidv7();
    const run: MarketResearchRun = {
      runId,
      projectId,
      topic,
      startedAt,
      completedAt: completedAtDate.toISOString(),
      durationMs: Math.max(0, completedAtDate.getTime() - startedMs),
      providers: acquisition.providers.map((report) => ({
        ...report,
        analyzed: analyzedByProvider.get(report.provider) ?? 0,
      })),
      metrics: { ...acquisition.metrics, analyzedSignals: analyzedSignalIds.length },
      analysis,
      findings: [...findings],
      signals: [...acquisition.signals],
    };
    this.persist(run);
    return run;
  }

  /**
   * Reuses the existing generation ledger so runs stay auditable without new
   * tables or migrations. Only normalized, bounded run data is stored: no raw
   * provider payloads, headers or credentials.
   */
  /**
   * Reads only completed Market Research ledger entries. This path is deliberately
   * isolated from acquisition and semantic mining, so restoring a saved run can
   * never invoke a provider or an LLM.
   */
  latest(projectId: string): MarketResearchRun | null {
    return this.history(projectId, 1)[0] ?? null;
  }

  /**
   * Returns at most ten validated saved runs. The scan is intentionally bounded
   * but tolerates malformed legacy rows so an older valid run can still restore.
   */
  history(projectId: string, limit = 10): readonly MarketResearchRun[] {
    const safeLimit = Math.min(Math.max(limit, 1), 10);
    const rows = this.database.connection.prepare(`
      SELECT id, output_data
      FROM generations
      WHERE project_id = ? AND agent_key = ? AND status = 'COMPLETED'
      ORDER BY completed_at DESC, created_at DESC, id DESC
      LIMIT 50
    `).all(projectId, MARKET_RESEARCH_AGENT_KEY) as Array<{ id: string; output_data: string | null }>;

    const runs: MarketResearchRun[] = [];
    for (const row of rows) {
      const run = restorePersistedMarketResearchRun(row.output_data, projectId, row.id);
      if (run !== null) runs.push(run);
      if (runs.length === safeLimit) break;
    }
    return runs;
  }

  private persist(run: MarketResearchRun): void {
    const inputTokens = run.analysis.inputTokens ?? 0;
    const outputTokens = run.analysis.outputTokens ?? 0;
    const now = run.completedAt;
    const connection = this.database.connection;
    connection.exec("BEGIN IMMEDIATE");
    try {
      connection.prepare(`
        INSERT INTO generations (
          id, project_id, agent_key, provider, model, status, input_snapshot, output_data,
          prompt_version, input_tokens, output_tokens, estimated_cost, duration_ms,
          error_code, error_message, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      `).run(
        run.runId,
        run.projectId,
        MARKET_RESEARCH_AGENT_KEY,
        run.analysis.analyzer ?? "none",
        run.analysis.model ?? "none",
        run.analysis.analyzer === null ? "FAILED" : "COMPLETED",
        JSON.stringify({
          topic: run.topic,
          providers: run.providers.map((report) => ({
            provider: report.provider,
            state: report.state,
            requested: report.requested,
            failure: report.failure,
          })),
          budgets: MARKET_RESEARCH_BUDGETS,
        }),
        JSON.stringify(run),
        "market-research-v1",
        inputTokens,
        outputTokens,
        run.durationMs,
        run.analysis.failure,
        run.analysis.failure === null ? null : "El análisis semántico no se completó.",
        now,
        now,
      );
      if (run.analysis.analyzer !== null) {
        connection.prepare(`
          INSERT INTO llm_usage (
            id, project_id, generation_id, provider, model, input_tokens,
            output_tokens, estimated_cost, currency, is_estimate, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'USD', 1, ?)
        `).run(
          uuidv7(),
          run.projectId,
          run.runId,
          run.analysis.analyzer,
          run.analysis.model ?? "none",
          inputTokens,
          outputTokens,
          now,
        );
      }
      connection.exec("COMMIT");
    } catch (error) {
      if (connection.isTransaction) connection.exec("ROLLBACK");
      throw error;
    }
  }
}
