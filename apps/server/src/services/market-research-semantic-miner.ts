import {
  MARKET_RESEARCH_BUDGETS,
  MARKET_RESEARCH_FINDING_CATEGORIES,
  type LlmGenerateRequest,
  type LlmGenerateResult,
  type MarketResearchAnalysis,
  type MarketResearchAnalyzer,
  type MarketResearchConfidence,
  type MarketResearchEvidenceStrength,
  type MarketResearchFinding,
  type MarketResearchFindingCategory,
  type MarketResearchSignal,
  type MarketResearchYouTubeAnalysis,
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
  /** Full persisted evidence set. YouTube is batched internally; web stays capped. */
  readonly signals: readonly MarketResearchSignal[];
  readonly referenceAt: string;
  readonly primary: MarketResearchAnalyzerBinding;
  readonly fallback: MarketResearchAnalyzerBinding;
}

export interface MarketResearchMining {
  readonly findings: readonly MarketResearchFinding[];
  readonly analysis: MarketResearchAnalysis;
  /** Exact signals sent to a successful semantic request; used for provider metrics. */
  readonly analyzedSignalIds: readonly string[];
}

const LEGACY_INSTRUCTIONS = [
  "Eres un analista de mercado que sólo puede describir lo que aparece literalmente en las señales entregadas.",
  "Devuelve JSON con la forma {\"findings\":[{\"category\":...,\"statement\":...,\"customerLanguage\":...,\"signalIds\":[...]}]}.",
  `category debe ser uno de: ${MARKET_RESEARCH_FINDING_CATEGORIES.join(", ")}.`,
  "statement describe el patrón observado en español, sin cifras, porcentajes, estadísticas, ventas ni testimonios inventados.",
  "customerLanguage debe ser una cita corta o expresión textual del mercado; usa cadena vacía si no existe.",
  "signalIds debe contener sólo los IDs de señal entregados que respaldan directamente el statement; nunca inventes IDs.",
  "Si algo no está respaldado por las señales, omítelo. No agregues conteos, no calcules métricas y no infieras evidencia ausente.",
].join("\n");

const YOUTUBE_BATCH_INSTRUCTIONS = [
  "Eres un analista de mercado. Trabajas exclusivamente con comentarios reales de YouTube entregados como evidencia.",
  "Devuelve hallazgos candidatos en español, incluso cuando el comentario original esté en otro idioma.",
  "Sólo describe patrones respaldados explícitamente por las señales proporcionadas. No uses conocimiento externo.",
  "Busca dolores, deseos, intentos o soluciones fallidas, soluciones actuales criticadas, objeciones, resultados deseados, preguntas recurrentes, lenguaje de clientes, temas repetidos e intención comercial/pago sólo cuando aparezca literalmente.",
  "Una solución fallida requiere que el mismo comentario pruebe qué se intentó y por qué falló o fue criticada. La intención comercial requiere evidencia explícita de compra, precio, recomendación, comparación o disposición a pagar.",
  "Devuelve JSON con la forma {\"findings\":[{\"category\":...,\"statement\":...,\"customerLanguage\":...,\"signalIds\":[...]}]}.",
  `category debe ser uno de: ${MARKET_RESEARCH_FINDING_CATEGORIES.join(", ")}.`,
  "Cada candidate debe citar uno o más signalIds entregados. Nunca inventes IDs ni citas. customerLanguage debe ser una cita literal corta o cadena vacía.",
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

interface RawClaim {
  readonly category: MarketResearchFindingCategory;
  readonly statement: string;
  readonly customerLanguage: string | null;
  readonly signalIds: readonly string[];
}

interface GeneratedClaims {
  readonly claims: readonly RawClaim[];
  readonly rejected: number;
}

interface BatchAttempt {
  readonly claims: readonly RawClaim[];
  readonly rejected: number;
  readonly analyzer: MarketResearchAnalyzer | null;
  readonly model: string | null;
  readonly fallbackUsed: boolean;
  readonly primaryFailure: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly failed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  return normalized.length === 0 ? null : normalized.slice(0, maxLength);
}

/** Normalized key for deterministic category/concept consolidation. */
function comparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function literalQuoteCandidate(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CUSTOMER_LANGUAGE_LENGTH ? value : null;
}

/** A quote is emitted only when the exact original text occurs in cited evidence. */
function verifiedQuote(value: string | null, supporting: readonly MarketResearchSignal[]): string | null {
  if (value === null) return null;
  return supporting.some((signal) => signal.text.includes(value)) ? value : null;
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

/**
 * Grounding gate used after every model batch. It validates against exactly the
 * provided batch, caps references, deduplicates IDs, and drops candidates with
 * no evidence before they can enter consolidation.
 */
function groundClaims(
  output: unknown,
  signals: readonly MarketResearchSignal[],
  maxClaims: number,
  maxEvidenceIds: number,
): GeneratedClaims {
  if (!isRecord(output) || !Array.isArray(output.findings)) return { claims: [], rejected: 0 };
  const known = new Set(signals.map((signal) => signal.id));
  const claims: RawClaim[] = [];
  let rejected = 0;
  for (const entry of output.findings.slice(0, maxClaims * 2)) {
    if (claims.length >= maxClaims) break;
    if (!isRecord(entry)) { rejected += 1; continue; }
    const category = findingCategory(entry.category);
    const statement = boundedText(entry.statement, MAX_STATEMENT_LENGTH);
    const signalIds = Array.isArray(entry.signalIds)
      ? [...new Set(entry.signalIds.filter((id): id is string => typeof id === "string" && known.has(id)))].slice(0, maxEvidenceIds)
      : [];
    if (category === null || statement === null || signalIds.length === 0) { rejected += 1; continue; }
    const cited = signals.filter((signal) => signalIds.includes(signal.id));
    claims.push({
      category,
      statement,
      customerLanguage: verifiedQuote(literalQuoteCandidate(entry.customerLanguage), cited),
      signalIds,
    });
  }
  return { claims, rejected };
}

function signalInput(signal: MarketResearchSignal, maximumCharacters: number): Record<string, unknown> {
  return {
    id: signal.id,
    provider: signal.provider,
    source: signal.source,
    capturedAt: signal.capturedAt,
    text: signal.text.slice(0, maximumCharacters),
    ...(signal.youtube === undefined ? {} : {
      videoId: signal.youtube.videoId,
      channelId: signal.youtube.channelId,
      declaredLanguage: signal.youtube.declaredLanguage,
      queryLanguage: signal.youtube.queryLanguage,
    }),
  };
}

function request(
  binding: MarketResearchAnalyzerBinding,
  topic: string,
  signals: readonly MarketResearchSignal[],
  systemInstructions: string,
  maximumCharacters: number,
  maximumOutputTokens: number,
): LlmGenerateRequest {
  return {
    provider: binding.analyzer,
    model: binding.model,
    systemInstructions,
    input: JSON.stringify({ topic, signals: signals.map((signal) => signalInput(signal, maximumCharacters)) }),
    structuredOutput: { name: "market_research_findings", jsonSchema: FINDINGS_SCHEMA },
    maxOutputTokens: maximumOutputTokens,
  };
}

function failureCode(error: unknown): string {
  return error instanceof IntegrationError ? error.code : "unknown";
}

/** One bounded primary→fallback attempt. No successful request ever triggers Gemini. */
async function generateClaims(
  input: Readonly<MarketResearchMiningInput>,
  signals: readonly MarketResearchSignal[],
  options: Readonly<{ systemInstructions: string; maximumCharacters: number; maximumOutputTokens: number; maxClaims: number; maxEvidenceIds: number }>,
): Promise<BatchAttempt> {
  const attempts: readonly MarketResearchAnalyzerBinding[] = [input.primary, input.fallback];
  let primaryFailure: string | null = null;
  for (const [index, binding] of attempts.entries()) {
    const isFallback = index > 0;
    if (binding.client === undefined || !binding.client.configured) {
      if (!isFallback) { primaryFailure = "missing_api_key"; continue; }
      return { claims: [], rejected: 0, analyzer: null, model: null, fallbackUsed: false, primaryFailure, inputTokens: 0, outputTokens: 0, failed: true };
    }
    try {
      const generated = await binding.client.generate<unknown>(request(
        binding, input.topic, signals, options.systemInstructions, options.maximumCharacters, options.maximumOutputTokens,
      ));
      const grounded = groundClaims(generated.output, signals, options.maxClaims, options.maxEvidenceIds);
      return {
        claims: grounded.claims,
        rejected: grounded.rejected,
        analyzer: binding.analyzer,
        model: binding.model,
        fallbackUsed: isFallback,
        primaryFailure,
        inputTokens: generated.usage.inputTokens ?? 0,
        outputTokens: generated.usage.outputTokens ?? 0,
        failed: false,
      };
    } catch (error) {
      if (!isFallback) { primaryFailure = failureCode(error); continue; }
      return { claims: [], rejected: 0, analyzer: null, model: null, fallbackUsed: true, primaryFailure, inputTokens: 0, outputTokens: 0, failed: true };
    }
  }
  return { claims: [], rejected: 0, analyzer: null, model: null, fallbackUsed: false, primaryFailure, inputTokens: 0, outputTokens: 0, failed: true };
}

function chunks<T>(items: readonly T[], size: number, maximum: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < items.length && result.length < maximum; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/** Same category + normalized Spanish concept is the deterministic consolidation key. */
function consolidationKey(claim: RawClaim): string {
  return `${claim.category}:${comparable(claim.statement)}`;
}

/**
 * Cross-batch consolidation is deterministic and bounded. The model provides
 * normalized Spanish concepts per batch; this function only merges identical
 * category/concept keys, unions supporting IDs, and retains a verified literal
 * quote from the original batch output. It never calls a model.
 */
function consolidateYouTubeClaims(claims: readonly RawClaim[]): readonly RawClaim[] {
  const groups = new Map<string, RawClaim>();
  for (const claim of claims.slice(0, MARKET_RESEARCH_BUDGETS.youtubeSemanticConsolidationCandidates)) {
    const key = consolidationKey(claim);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, claim);
      continue;
    }
    groups.set(key, {
      ...existing,
      signalIds: [...new Set([...existing.signalIds, ...claim.signalIds])]
        .slice(0, MARKET_RESEARCH_BUDGETS.youtubeSemanticCandidateEvidenceIds),
      customerLanguage: existing.customerLanguage ?? claim.customerLanguage,
    });
  }
  return [...groups.values()];
}

function evidenceDiversity(supporting: readonly MarketResearchSignal[]): {
  readonly videos: number;
  readonly channels: number;
  readonly languages: readonly string[];
  readonly strength: MarketResearchEvidenceStrength;
} {
  const videos = new Set<string>();
  const channels = new Set<string>();
  const languages = new Set<string>();
  for (const signal of supporting) {
    const youtube = signal.youtube;
    if (youtube === undefined) continue;
    videos.add(youtube.videoId);
    channels.add(youtube.channelId);
    if (youtube.declaredLanguage !== null) languages.add(youtube.declaredLanguage);
    else if (youtube.queryLanguage !== null) languages.add(youtube.queryLanguage);
  }
  const strength: MarketResearchEvidenceStrength = supporting.length >= 6 && (videos.size >= 3 || channels.size >= 3)
    ? "strong_repeated"
    : supporting.length >= 2 ? "repeated" : "isolated";
  return { videos: videos.size, channels: channels.size, languages: [...languages].sort(), strength };
}

/** Deterministic cross-source validation; model-provided counts never reach output. */
function validateClaims(
  claims: readonly RawClaim[],
  signals: readonly MarketResearchSignal[],
  referenceAt: string,
): readonly MarketResearchFinding[] {
  const byId = new Map(signals.map((signal) => [signal.id, signal]));
  const riskSignalIds = new Set(claims.filter((claim) => claim.category === "risks").flatMap((claim) => claim.signalIds));
  const findings = claims.slice(0, MAX_FINDINGS).map((claim, index): MarketResearchFinding => {
    const supporting = claim.signalIds.flatMap((id) => {
      const signal = byId.get(id);
      return signal === undefined ? [] : [signal];
    });
    const stats = marketResearchSignalStats(supporting, referenceAt);
    const diversity = evidenceDiversity(supporting);
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
      evidenceStrength: diversity.strength,
      distinctVideos: diversity.videos,
      distinctChannels: diversity.channels,
      languages: [...diversity.languages],
    };
  });
  return [...findings].sort((left, right) =>
    right.independentProviders - left.independentProviders
    || right.supportingSignals - left.supportingSignals
    || (right.distinctVideos ?? 0) - (left.distinctVideos ?? 0)
    || (right.distinctChannels ?? 0) - (left.distinctChannels ?? 0)
    || left.id.localeCompare(right.id));
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
 * Bounded multi-source mining: legacy web evidence receives the original
 * 20-signal request, while cleaned YouTube evidence receives at most twelve
 * small DeepSeek batches. Batch candidates are grounded against their exact
 * source batch, then deterministically consolidated before final validation.
 */
export async function mineMarketResearchFindings(
  input: Readonly<MarketResearchMiningInput>,
): Promise<MarketResearchMining> {
  const youtube = input.signals.filter((signal) => signal.provider === "youtube");
  const nonYoutube = input.signals.filter((signal) => signal.provider !== "youtube")
    .slice(0, MARKET_RESEARCH_BUDGETS.analysisSignals);
  if (youtube.length === 0 && nonYoutube.length === 0) {
    return { findings: [], analysis: emptyAnalysis("no_signals", 0), analyzedSignalIds: [] };
  }

  const allClaims: RawClaim[] = [];
  const analyzedSignalIds = new Set<string>();
  let rejectedClaims = 0;
  let rejectedYoutubeCandidates = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let fallbackUsed = false;
  let primaryFailure: string | null = null;
  let successfulPrimary = false;
  let successfulFallback = false;
  let firstModel: string | null = null;
  let legacyFailed = false;

  if (nonYoutube.length > 0) {
    const legacy = await generateClaims(input, nonYoutube, {
      systemInstructions: LEGACY_INSTRUCTIONS,
      maximumCharacters: MARKET_RESEARCH_BUDGETS.analysisSignalChars,
      maximumOutputTokens: MARKET_RESEARCH_BUDGETS.analysisMaxOutputTokens,
      maxClaims: MAX_FINDINGS,
      maxEvidenceIds: MARKET_RESEARCH_BUDGETS.youtubeSemanticCandidateEvidenceIds,
    });
    rejectedClaims += legacy.rejected;
    inputTokens += legacy.inputTokens;
    outputTokens += legacy.outputTokens;
    fallbackUsed ||= legacy.fallbackUsed;
    primaryFailure ??= legacy.primaryFailure;
    legacyFailed = legacy.failed;
    if (!legacy.failed) {
      allClaims.push(...legacy.claims);
      nonYoutube.forEach((signal) => analyzedSignalIds.add(signal.id));
      if (legacy.analyzer === "deepseek") successfulPrimary = true;
      if (legacy.analyzer === "gemini") successfulFallback = true;
      firstModel ??= legacy.model;
    }
  }

  const batches = chunks(
    youtube,
    MARKET_RESEARCH_BUDGETS.youtubeSemanticBatchSignals,
    MARKET_RESEARCH_BUDGETS.youtubeSemanticMaxBatches,
  );
  const youtubeClaims: RawClaim[] = [];
  let successfulBatches = 0;
  let failedBatches = 0;
  let fallbackBatches = 0;
  for (const batch of batches) {
    const mined = await generateClaims(input, batch, {
      systemInstructions: YOUTUBE_BATCH_INSTRUCTIONS,
      maximumCharacters: MARKET_RESEARCH_BUDGETS.youtubeSemanticSignalChars,
      maximumOutputTokens: MARKET_RESEARCH_BUDGETS.youtubeSemanticMaxOutputTokens,
      maxClaims: MARKET_RESEARCH_BUDGETS.youtubeSemanticCandidatesPerBatch,
      maxEvidenceIds: MARKET_RESEARCH_BUDGETS.youtubeSemanticCandidateEvidenceIds,
    });
    rejectedClaims += mined.rejected;
    rejectedYoutubeCandidates += mined.rejected;
    inputTokens += mined.inputTokens;
    outputTokens += mined.outputTokens;
    fallbackUsed ||= mined.fallbackUsed;
    primaryFailure ??= mined.primaryFailure;
    if (mined.failed) {
      failedBatches += 1;
      continue;
    }
    successfulBatches += 1;
    if (mined.fallbackUsed) fallbackBatches += 1;
    youtubeClaims.push(...mined.claims);
    batch.forEach((signal) => analyzedSignalIds.add(signal.id));
    if (mined.analyzer === "deepseek") successfulPrimary = true;
    if (mined.analyzer === "gemini") successfulFallback = true;
    firstModel ??= mined.model;
  }

  const consolidatedYoutube = consolidateYouTubeClaims(youtubeClaims);
  allClaims.push(...consolidatedYoutube);
  const findings = validateClaims(allClaims, input.signals, input.referenceAt);
  const citedYoutube = new Map(input.signals.filter((signal) => signal.provider === "youtube").map((signal) => [signal.id, signal]));
  const citedIds = new Set(findings.flatMap((finding) => finding.signalIds).filter((id) => citedYoutube.has(id)));
  const citedSignals = [...citedIds].flatMap((id) => {
    const signal = citedYoutube.get(id);
    return signal === undefined ? [] : [signal];
  });
  const citedDiversity = evidenceDiversity(citedSignals);
  const youtubeAnalysis: MarketResearchYouTubeAnalysis = {
    semanticBatches: batches.length,
    successfulBatches,
    failedBatches,
    analyzedSignals: batches.reduce((total, batch) => total + batch.length, 0),
    candidateFindings: youtubeClaims.length,
    rejectedCandidates: rejectedYoutubeCandidates,
    citedSignals: citedSignals.length,
    citedVideos: citedDiversity.videos,
    citedChannels: citedDiversity.channels,
    languages: [...citedDiversity.languages],
    fallbackBatches,
  };

  const successful = successfulPrimary || successfulFallback;
  const analyzer: MarketResearchAnalyzer | null = successfulPrimary ? "deepseek" : successfulFallback ? "gemini" : null;
  const failure = successful ? null : primaryFailure ?? (legacyFailed || failedBatches > 0 ? "analysis_failed" : "no_signals");
  return {
    findings,
    analysis: {
      analyzer,
      model: analyzer === "deepseek" ? input.primary.model : analyzer === "gemini" ? input.fallback.model : null,
      fallbackUsed,
      primaryFailure,
      analyzedSignals: analyzedSignalIds.size,
      rejectedClaims,
      inputTokens: successful ? inputTokens : null,
      outputTokens: successful ? outputTokens : null,
      failure,
      youtube: youtubeAnalysis,
    },
    analyzedSignalIds: [...analyzedSignalIds],
  };
}
