import {
  MARKET_RESEARCH_BUDGETS,
  MARKET_RESEARCH_TOPIC_MAX_LENGTH,
  type LlmGenerateRequest,
  type MarketResearchAnalyzer,
  type MarketResearchYouTubeRelevanceDecision,
  type MarketResearchYouTubeRelevanceReview,
} from "@our-platform/shared";

import type { MarketResearchAnalyzerClient } from "./market-research-semantic-miner.js";

export interface YouTubeRelevanceReviewCandidate {
  readonly videoId: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly channelTitle: string;
  readonly declaredLanguage: string | null;
}

export interface YouTubeRelevanceReviewBatch {
  readonly results: ReadonlyMap<string, MarketResearchYouTubeRelevanceReview>;
  readonly attempts: number;
  readonly fallbackAttempts: number;
  readonly successes: number;
  readonly failures: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface YouTubeRelevanceReviewer {
  review(topic: string, candidates: readonly YouTubeRelevanceReviewCandidate[]): Promise<YouTubeRelevanceReviewBatch>;
}

interface AnalyzerBinding {
  readonly analyzer: MarketResearchAnalyzer;
  readonly model: string;
  readonly client: MarketResearchAnalyzerClient | undefined;
}

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    reviews: {
      type: "array",
      maxItems: MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxBorderlineVideos,
      items: {
        type: "object",
        properties: {
          videoId: { type: "string", minLength: 1, maxLength: 64 },
          decision: { type: "string", enum: ["relevant", "borderline", "irrelevant"] },
          reason: { type: "string", minLength: 1, maxLength: MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxReasonChars },
          matchedAspects: {
            type: "array",
            maxItems: MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxMatchedAspects,
            items: { type: "string", minLength: 1, maxLength: 80 },
          },
        },
        required: ["videoId", "decision", "reason", "matchedAspects"],
        additionalProperties: false,
      },
    },
  },
  required: ["reviews"],
  additionalProperties: false,
} as const;

const SYSTEM_INSTRUCTIONS = [
  "Clasifica únicamente videos borderline para su relevancia respecto al Research Focus entregado.",
  "Usa sólo título, descripción, tags, canal e idioma declarado; ignora vistas, likes, popularidad y conocimiento externo.",
  "Devuelve exactamente un registro por videoId esperado con decision relevant, borderline o irrelevant.",
  "reason debe ser breve y matchedAspects debe citar aspectos concretos de la metadata.",
  "No busques YouTube, no añadas IDs y no conviertas términos genéricos en relevancia temática.",
].join("\n");

interface ParsedReviewResponse {
  readonly reviews: ReadonlyMap<string, MarketResearchYouTubeRelevanceReview>;
  readonly issues: ReadonlyMap<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInput(value: string, maximum: number): string {
  return value.normalize("NFC").replace(/[\u0000-\u001F\u007F]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maximum);
}

function boundedModel(value: string): string {
  return boundedInput(value, 128) || "unknown";
}

function validDecision(value: unknown): value is MarketResearchYouTubeRelevanceDecision {
  return value === "relevant" || value === "borderline" || value === "irrelevant";
}

function strictReview(
  value: unknown,
  binding: AnalyzerBinding,
  fallback: boolean,
): MarketResearchYouTubeRelevanceReview | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 4 || keys.join(",") !== "decision,matchedAspects,reason,videoId") return null;
  if (!validDecision(value.decision) || typeof value.reason !== "string" || !Array.isArray(value.matchedAspects)) return null;
  const reason = value.reason.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (reason.length === 0 || reason.length > MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxReasonChars) return null;
  if (value.matchedAspects.length > MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxMatchedAspects) return null;
  const matchedAspects: string[] = [];
  for (const aspect of value.matchedAspects) {
    if (typeof aspect !== "string") return null;
    const normalized = aspect.normalize("NFC").replace(/\s+/gu, " ").trim();
    if (normalized.length === 0 || normalized.length > 80) return null;
    if (!matchedAspects.includes(normalized)) matchedAspects.push(normalized);
  }
  return {
    decision: value.decision,
    provider: binding.analyzer,
    model: boundedModel(binding.model),
    fallback,
    reason,
    matchedAspects,
    failure: null,
  };
}

function parseReviews(
  output: unknown,
  expectedIds: readonly string[],
  binding: AnalyzerBinding,
  fallback: boolean,
): ParsedReviewResponse {
  const issues = new Map<string, string>();
  const reviews = new Map<string, MarketResearchYouTubeRelevanceReview>();
  const expected = new Set(expectedIds);
  if (!isRecord(output) || Object.keys(output).length !== 1 || !Array.isArray(output.reviews)
    || output.reviews.length > MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxBorderlineVideos * 2) {
    for (const videoId of expectedIds) issues.set(videoId, "response_malformed");
    return { reviews, issues };
  }

  const byId = new Map<string, unknown[]>();
  for (const record of output.reviews) {
    if (!isRecord(record) || typeof record.videoId !== "string" || !expected.has(record.videoId)) continue;
    const bucket = byId.get(record.videoId);
    if (bucket === undefined) byId.set(record.videoId, [record]);
    else bucket.push(record);
  }

  for (const videoId of expectedIds) {
    const records = byId.get(videoId) ?? [];
    if (records.length === 0) { issues.set(videoId, "result_missing"); continue; }
    if (records.length !== 1) { issues.set(videoId, "result_duplicate"); continue; }
    const review = strictReview(records[0], binding, fallback);
    if (review === null) { issues.set(videoId, "result_malformed"); continue; }
    reviews.set(videoId, review);
  }
  return { reviews, issues };
}

function candidatePayload(candidate: Readonly<YouTubeRelevanceReviewCandidate>): Record<string, unknown> {
  return {
    videoId: boundedInput(candidate.videoId, 64),
    title: boundedInput(candidate.title, 300),
    description: boundedInput(candidate.description, MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxCharsPerItem),
    tags: candidate.tags
      .slice(0, MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxTags)
      .map((tag) => boundedInput(tag, 80))
      .filter((tag) => tag.length > 0),
    channelTitle: boundedInput(candidate.channelTitle, 160),
    declaredLanguage: candidate.declaredLanguage === null ? null : boundedInput(candidate.declaredLanguage, 32),
  };
}

function serializedInput(topic: string, candidates: readonly YouTubeRelevanceReviewCandidate[]): string | null {
  const input = JSON.stringify({
    topic: boundedInput(topic, MARKET_RESEARCH_TOPIC_MAX_LENGTH),
    candidates: candidates.map(candidatePayload),
  });
  return input.length <= MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxSerializedChars ? input : null;
}

function request(binding: AnalyzerBinding, input: string): LlmGenerateRequest {
  return {
    provider: binding.analyzer,
    model: binding.model,
    systemInstructions: SYSTEM_INSTRUCTIONS,
    input,
    structuredOutput: { name: "youtube_relevance_review", jsonSchema: REVIEW_SCHEMA },
    maxOutputTokens: MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxOutputTokens,
  };
}

function observableTokens(value: number | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeTokenTotal(current: number, addition: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, current + addition);
}

function failClosedReview(
  primaryIssue: string,
  fallbackIssue: string,
  fallback: AnalyzerBinding,
  fallbackAttempted: boolean,
): MarketResearchYouTubeRelevanceReview {
  const failure = `${primaryIssue}:${fallbackIssue}`.slice(0, 160);
  return {
    decision: null,
    provider: fallbackAttempted ? fallback.analyzer : null,
    model: fallbackAttempted ? boundedModel(fallback.model) : null,
    fallback: fallbackAttempted,
    reason: `fail_closed:${failure}`.slice(0, MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxReasonChars),
    matchedAspects: [],
    failure,
  };
}

function uniqueBoundedCandidates(
  candidates: readonly YouTubeRelevanceReviewCandidate[],
): readonly YouTubeRelevanceReviewCandidate[] {
  const result: YouTubeRelevanceReviewCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (result.length >= MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxBorderlineVideos) break;
    if (candidate.videoId.length === 0 || seen.has(candidate.videoId)) continue;
    seen.add(candidate.videoId);
    result.push(candidate);
  }
  return result;
}

/** DeepSeek reviews one batch; Gemini is isolated to each unresolved candidate. */
export function createYouTubeRelevanceReviewer(primary: AnalyzerBinding, fallback: AnalyzerBinding): YouTubeRelevanceReviewer {
  return {
    async review(topic, candidates) {
      const bounded = uniqueBoundedCandidates(candidates);
      const results = new Map<string, MarketResearchYouTubeRelevanceReview>();
      const primaryIssues = new Map<string, string>();
      let attempts = 0;
      let fallbackAttempts = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      if (bounded.length === 0) {
        return { results, attempts, fallbackAttempts, successes: 0, failures: 0, inputTokens, outputTokens };
      }

      if (primary.client === undefined || !primary.client.configured) {
        for (const candidate of bounded) primaryIssues.set(candidate.videoId, "primary_not_configured");
      } else {
        const input = serializedInput(topic, bounded);
        if (input === null) {
          for (const candidate of bounded) primaryIssues.set(candidate.videoId, "primary_payload_too_large");
        } else {
          attempts += 1;
          try {
            const generated = await primary.client.generate<unknown>(request(primary, input));
            inputTokens = safeTokenTotal(inputTokens, observableTokens(generated.usage.inputTokens));
            outputTokens = safeTokenTotal(outputTokens, observableTokens(generated.usage.outputTokens));
            const parsed = parseReviews(generated.output, bounded.map((candidate) => candidate.videoId), primary, false);
            for (const [videoId, review] of parsed.reviews) results.set(videoId, review);
            for (const [videoId, issue] of parsed.issues) primaryIssues.set(videoId, `primary_${issue}`);
          } catch {
            for (const candidate of bounded) primaryIssues.set(candidate.videoId, "primary_request_failed");
          }
        }
      }

      for (const candidate of bounded) {
        if (results.has(candidate.videoId)) continue;
        const primaryIssue = primaryIssues.get(candidate.videoId) ?? "primary_result_missing";
        if (attempts >= MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxAttempts) {
          results.set(candidate.videoId, failClosedReview(primaryIssue, "attempt_limit_reached", fallback, false));
          continue;
        }
        if (fallback.client === undefined || !fallback.client.configured) {
          results.set(candidate.videoId, failClosedReview(primaryIssue, "fallback_not_configured", fallback, false));
          continue;
        }
        const input = serializedInput(topic, [candidate]);
        if (input === null) {
          results.set(candidate.videoId, failClosedReview(primaryIssue, "fallback_payload_too_large", fallback, false));
          continue;
        }

        attempts += 1;
        fallbackAttempts += 1;
        try {
          const generated = await fallback.client.generate<unknown>(request(fallback, input));
          inputTokens = safeTokenTotal(inputTokens, observableTokens(generated.usage.inputTokens));
          outputTokens = safeTokenTotal(outputTokens, observableTokens(generated.usage.outputTokens));
          const parsed = parseReviews(generated.output, [candidate.videoId], fallback, true);
          const review = parsed.reviews.get(candidate.videoId);
          if (review !== undefined) results.set(candidate.videoId, review);
          else {
            const issue = parsed.issues.get(candidate.videoId) ?? "result_missing";
            results.set(candidate.videoId, failClosedReview(primaryIssue, `fallback_${issue}`, fallback, true));
          }
        } catch {
          results.set(candidate.videoId, failClosedReview(primaryIssue, "fallback_request_failed", fallback, true));
        }
      }

      const successes = [...results.values()].filter((review) => review.failure === null).length;
      return {
        results,
        attempts,
        fallbackAttempts,
        successes,
        failures: Math.max(0, bounded.length - successes),
        inputTokens,
        outputTokens,
      };
    },
  };
}
