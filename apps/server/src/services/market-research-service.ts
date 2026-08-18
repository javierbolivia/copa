import {
  MARKET_RESEARCH_BUDGETS,
  MARKET_RESEARCH_PROVIDERS,
  marketResearchProviderBudget,
  type MarketResearchProvider,
  type MarketResearchProviderState,
  type MarketResearchRun,
  type MarketResearchStatus,
} from "@our-platform/shared";
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
}

function providerState(configured: boolean | undefined): MarketResearchProviderState {
  return configured === true ? "available" : "not_configured";
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
      },
    };
  }

  async run(projectId: string, options: Readonly<RunMarketResearchOptions>): Promise<MarketResearchRun> {
    const topic = options.topic.trim();
    if (topic.length === 0) throw new Error("El tema a investigar es obligatorio.");
    const startedAtDate = this.now();
    const startedAt = startedAtDate.toISOString();
    const startedMs = startedAtDate.getTime();

    const acquisition = await acquireMarketResearchSignals(this.options.clients, {
      topic,
      retrievedAt: startedAt,
      ...(options.providers === undefined ? {} : { providers: options.providers }),
    });

    const { findings, analysis } = await mineMarketResearchFindings({
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

    const completedAtDate = this.now();
    const runId = uuidv7();
    const run: MarketResearchRun = {
      runId,
      projectId,
      topic,
      startedAt,
      completedAt: completedAtDate.toISOString(),
      durationMs: Math.max(0, completedAtDate.getTime() - startedMs),
      providers: [...acquisition.providers],
      metrics: acquisition.metrics,
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
