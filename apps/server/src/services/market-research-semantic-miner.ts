import {
  MARKET_RESEARCH_BUDGETS,
  MARKET_RESEARCH_FINDING_CATEGORIES,
  type LlmGenerateRequest,
  type LlmGenerateResult,
  type MarketResearchAnalysis,
  type MarketResearchAnalyzer,
  type MarketResearchConfidence,
  type MarketResearchFinding,
  type MarketResearchFindingCategory,
  type MarketResearchSignal,
} from "@our-platform/shared";

import { IntegrationError } from "../integrations/integration-error.js";
import { marketResearchSignalStats } from "./market-research-orchestrator.js";

const MAX_FINDINGS = 40;
const MAX_STATEMENT_LENGTH = 600;
const MAX_CUSTOMER_LANGUAGE_LENGTH = 300;

/** Minimal analyzer surface so tests can inject deterministic doubles. */
export interface MarketResearchAnalyzerClient {
  readonly configured: boolean;
  generate<TOutput>(request: LlmGenerateRequest): Promise<LlmGenerateResult<TOutput>>;
}

export interface MarketResearchAnalyzerBinding {
  readonly analyzer: MarketResearchAnalyzer;
  readonly model: string;
  readonly client: MarketResearchAnalyzerClient | undefined;
}

export interface MarketResearchMiningInput {
  readonly topic: string;
  readonly signals: readonly MarketResearchSignal[];
  readonly referenceAt: string;
  readonly primary: MarketResearchAnalyzerBinding;
  readonly fallback: MarketResearchAnalyzerBinding;
}

export interface MarketResearchMining {
  readonly findings: readonly MarketResearchFinding[];
  readonly analysis: MarketResearchAnalysis;
}

const SEMANTIC_INSTRUCTIONS = [
  "Eres un analista de mercado que sólo puede describir lo que aparece literalmente en las señales entregadas.",
  "Devuelve JSON con la forma {\"findings\":[{\"category\":...,\"statement\":...,\"customerLanguage\":...,\"signalIds\":[...]}]}.",
  `category debe ser uno de: ${MARKET_RESEARCH_FINDING_CATEGORIES.join(", ")}.`,
  "statement describe el patrón observado en español, sin cifras, porcentajes, estadísticas, ventas ni testimonios inventados.",
  "customerLanguage debe ser una cita corta o expresión textual del mercado; usa cadena vacía si no existe.",
  "signalIds debe contener sólo los IDs de señal entregados que respaldan directamente el statement; nunca inventes IDs.",
  "Si algo no está respaldado por las señales, omítelo. No agregues conteos, no calcules métricas y no infieras evidencia ausente.",
].join("\n");

const FINDINGS_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...MARKET_RESEARCH_FINDING_CATEGORIES] },
          statement: { type: "string" },
          customerLanguage: { type: "string" },
          signalIds: { type: "array", items: { type: "string" } },
        },
        required: ["category", "statement", "customerLanguage", "signalIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["findings"],
  additionalProperties: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  return normalized.length === 0 ? null : normalized.slice(0, maxLength);
}

/** Matching form used only to prove a quote exists inside cited evidence. */
function comparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * A quote is shown only when it literally occurs in one of the cited signals.
 * Anything the analyzer paraphrased or invented is dropped rather than
 * presented to the user as market language.
 */
function verifiedQuote(value: string | null, supporting: readonly MarketResearchSignal[]): string | null {
  if (value === null) return null;
  const needle = comparable(value);
  if (needle.length === 0) return null;
  return supporting.some((signal) => comparable(signal.text).includes(needle)) ? value : null;
}

function findingCategory(value: unknown): MarketResearchFindingCategory | null {
  return typeof value === "string" && (MARKET_RESEARCH_FINDING_CATEGORIES as readonly string[]).includes(value)
    ? value as MarketResearchFindingCategory
    : null;
}

function confidenceOf(supportingSignals: number, independentProviders: number): MarketResearchConfidence {
  if (independentProviders >= 2) return "cross_provider";
  if (supportingSignals >= 2) return "corroborated";
  return "single_signal";
}

interface RawClaim {
  readonly category: MarketResearchFindingCategory;
  readonly statement: string;
  readonly customerLanguage: string | null;
  readonly signalIds: readonly string[];
}

/**
 * Grounding gate: a claim survives only when it cites at least one supplied
 * signal ID. Unknown IDs are stripped, duplicates collapsed, and unsupported
 * claims are counted and discarded instead of being presented as evidence.
 */
function groundClaims(
  output: unknown,
  signals: readonly MarketResearchSignal[],
): { readonly claims: readonly RawClaim[]; readonly rejected: number } {
  if (!isRecord(output) || !Array.isArray(output.findings)) return { claims: [], rejected: 0 };
  const known = new Set(signals.map((signal) => signal.id));
  const claims: RawClaim[] = [];
  let rejected = 0;
  for (const entry of output.findings.slice(0, MAX_FINDINGS * 2)) {
    if (claims.length >= MAX_FINDINGS) break;
    if (!isRecord(entry)) { rejected += 1; continue; }
    const category = findingCategory(entry.category);
    const statement = boundedText(entry.statement, MAX_STATEMENT_LENGTH);
    const signalIds = Array.isArray(entry.signalIds)
      ? [...new Set(entry.signalIds.filter((id): id is string => typeof id === "string" && known.has(id)))]
      : [];
    if (category === null || statement === null || signalIds.length === 0) { rejected += 1; continue; }
    const cited = signals.filter((signal) => signalIds.includes(signal.id));
    claims.push({
      category,
      statement,
      customerLanguage: verifiedQuote(boundedText(entry.customerLanguage, MAX_CUSTOMER_LANGUAGE_LENGTH), cited),
      signalIds,
    });
  }
  return { claims, rejected };
}

/** Deterministic cross-source validation; the LLM never supplies these counts. */
function validateClaims(
  claims: readonly RawClaim[],
  signals: readonly MarketResearchSignal[],
  referenceAt: string,
): readonly MarketResearchFinding[] {
  const byId = new Map(signals.map((signal) => [signal.id, signal]));
  const riskSignalIds = new Set(claims.filter((claim) => claim.category === "risks").flatMap((claim) => claim.signalIds));
  const findings = claims.map((claim, index): MarketResearchFinding => {
    const supporting = claim.signalIds.flatMap((id) => {
      const signal = byId.get(id);
      return signal === undefined ? [] : [signal];
    });
    const stats = marketResearchSignalStats(supporting, referenceAt);
    const contradicting = claim.category === "risks"
      ? 0
      : claim.signalIds.filter((id) => riskSignalIds.has(id)).length;
    return {
      id: `F${index + 1}`,
      category: claim.category,
      statement: claim.statement,
      customerLanguage: claim.customerLanguage,
      signalIds: [...claim.signalIds],
      supportingSignals: supporting.length,
      independentProviders: Math.max(1, stats.providers),
      domainDiversity: stats.domains,
      recentSignals: stats.recent,
      repeatedEvidence: supporting.length >= 2,
      contradictingSignals: contradicting,
      confidence: confidenceOf(supporting.length, stats.providers),
    };
  });
  // Cross-source corroboration outranks isolated evidence, deterministically.
  return [...findings].sort((left, right) =>
    right.independentProviders - left.independentProviders
    || right.supportingSignals - left.supportingSignals
    || right.domainDiversity - left.domainDiversity
    || left.id.localeCompare(right.id));
}

function analyzerRequest(binding: MarketResearchAnalyzerBinding, topic: string, signals: readonly MarketResearchSignal[]): LlmGenerateRequest {
  return {
    provider: binding.analyzer,
    model: binding.model,
    systemInstructions: SEMANTIC_INSTRUCTIONS,
    input: JSON.stringify({
      topic,
      signals: signals.map((signal) => ({
        id: signal.id,
        provider: signal.provider,
        source: signal.source,
        capturedAt: signal.capturedAt,
        text: signal.text,
      })),
    }),
    structuredOutput: { name: "market_research_findings", jsonSchema: FINDINGS_SCHEMA },
    maxOutputTokens: MARKET_RESEARCH_BUDGETS.analysisMaxOutputTokens,
  };
}

function emptyAnalysis(failure: string | null, analyzedSignals: number): MarketResearchAnalysis {
  return {
    analyzer: null,
    model: null,
    fallbackUsed: false,
    primaryFailure: failure,
    analyzedSignals,
    rejectedClaims: 0,
    inputTokens: null,
    outputTokens: null,
    failure,
  };
}

/**
 * Exactly one successful semantic analysis per run. DeepSeek Flash is primary;
 * Gemini is attempted only when the primary provider itself fails, so the same
 * payload is never analyzed successfully twice.
 */
export async function mineMarketResearchFindings(
  input: Readonly<MarketResearchMiningInput>,
): Promise<MarketResearchMining> {
  const signals = input.signals.slice(0, MARKET_RESEARCH_BUDGETS.analysisSignals);
  if (signals.length === 0) {
    return { findings: [], analysis: emptyAnalysis("no_signals", 0) };
  }

  const attempts: readonly MarketResearchAnalyzerBinding[] = [input.primary, input.fallback];
  let primaryFailure: string | null = null;

  for (const [index, binding] of attempts.entries()) {
    const isFallback = index > 0;
    if (binding.client === undefined || !binding.client.configured) {
      const failure = "missing_api_key";
      if (!isFallback) primaryFailure = failure;
      else return { findings: [], analysis: { ...emptyAnalysis(primaryFailure ?? failure, signals.length), primaryFailure } };
      continue;
    }
    try {
      const generated = await binding.client.generate<unknown>(analyzerRequest(binding, input.topic, signals));
      const { claims, rejected } = groundClaims(generated.output, signals);
      return {
        findings: validateClaims(claims, signals, input.referenceAt),
        analysis: {
          analyzer: binding.analyzer,
          model: binding.model,
          fallbackUsed: isFallback,
          primaryFailure,
          analyzedSignals: signals.length,
          rejectedClaims: rejected,
          inputTokens: generated.usage.inputTokens ?? null,
          outputTokens: generated.usage.outputTokens ?? null,
          failure: null,
        },
      };
    } catch (error) {
      const failure = error instanceof IntegrationError ? error.code : "unknown";
      if (!isFallback) primaryFailure = failure;
      else return { findings: [], analysis: { ...emptyAnalysis(failure, signals.length), primaryFailure } };
    }
  }

  return { findings: [], analysis: { ...emptyAnalysis(primaryFailure, signals.length), primaryFailure } };
}
