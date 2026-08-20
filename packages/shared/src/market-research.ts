import { Type, type Static } from "@sinclair/typebox";

import { MarketSignalSourceSchema, type MarketSignalSource } from "./market-signal.js";

/** Acquisition providers wired into the real Research flow. */
export const MARKET_RESEARCH_PROVIDERS = ["youtube", "tavily", "exa", "brave", "firecrawl"] as const;
export const MarketResearchProviderSchema = Type.Union(
  MARKET_RESEARCH_PROVIDERS.map((provider) => Type.Literal(provider)),
);
export type MarketResearchProvider = Static<typeof MarketResearchProviderSchema>;

/** Semantic analyzers: DeepSeek Flash is primary, Gemini is fallback only. */
export const MARKET_RESEARCH_ANALYZERS = ["deepseek", "gemini"] as const;
export const MarketResearchAnalyzerSchema = Type.Union(
  MARKET_RESEARCH_ANALYZERS.map((analyzer) => Type.Literal(analyzer)),
);
export type MarketResearchAnalyzer = Static<typeof MarketResearchAnalyzerSchema>;

export const MARKET_RESEARCH_PROVIDER_STATES = ["available", "not_configured", "temporary_error"] as const;
export const MarketResearchProviderStateSchema = Type.Union(
  MARKET_RESEARCH_PROVIDER_STATES.map((state) => Type.Literal(state)),
);
export type MarketResearchProviderState = Static<typeof MarketResearchProviderStateSchema>;

/**
 * Hard limits for ONE Research run. They are contract values enforced
 * server-side before any provider I/O; the UI can only narrow the provider set.
 */
export const MARKET_RESEARCH_BUDGETS = {
  /**
   * Adaptive YouTube acquisition. `youtubeTargetComments` is an early-stop
   * condition; every `Max` value is a hard ceiling enforced before I/O.
   * `youtubeTargetVideos` is the reported acquisition target: the enforced
   * bound on selected videos is `youtubeMaxVideos`.
   */
  youtubeTargetVideos: 30,
  youtubeMaxVideos: 40,
  youtubeMaxVideosPerChannel: 3,
  /** Candidate pool ceiling: wide enough for channel diversity, still bounded. */
  youtubeMaxCandidates: 120,
  youtubeSearchResultsPerQuery: 10,
  /** Default and hard ceiling for the caller-configurable long-form video gate. */
  youtubeMinimumDurationSeconds: 4 * 60,
  youtubeMaximumMinimumDurationSeconds: 24 * 60 * 60,
  youtubeRelevanceMaxBorderlineVideos: 8,
  youtubeRelevanceMaxCharsPerItem: 600,
  youtubeRelevanceMaxTags: 8,
  youtubeRelevanceMaxMatchedTerms: 24,
  youtubeRelevanceMaxMatchedAspects: 8,
  youtubeRelevanceMaxReasonChars: 240,
  youtubeRelevanceMaxSerializedChars: 32_000,
  youtubeRelevanceMaxOutputTokens: 800,
  /** One primary batch plus, at most, one per-candidate fallback request. */
  youtubeRelevanceMaxAttempts: 9,
  youtubeTargetComments: 300,
  youtubeMaxComments: 500,
  youtubeMaxCommentsPerVideo: 25,
  youtubeCommentPageSize: 50,
  youtubeMaxCommentPagesPerVideo: 2,
  youtubeMaxRepliesPerThread: 3,
  youtubeMaxReplyRequests: 10,
  /** Hard ceiling on raw comments processed, so chasing the target cannot run away. */
  youtubeMaxRawComments: 2_000,
  /**
   * Deterministic acquisition saturation: a video yielding fewer than
   * `youtubeMinNewUniquePerBatch` new unique items is a low-yield batch, and
   * acquisition stops only after `youtubeSaturationBatches` consecutive ones.
   * This is acquisition saturation, never a semantic claim.
   */
  youtubeMinNewUniquePerBatch: 3,
  youtubeSaturationBatches: 3,
  /** Conservative near-duplicate rule; short comments are never merged. */
  youtubeNearDuplicateThreshold: 0.85,
  youtubeNearDuplicateMinTokens: 5,
  youtubeNearDuplicateMaxComparisons: 48,
  youtubeNearDuplicatePostings: 64,
  tavilyResults: 5,
  exaResults: 5,
  braveResults: 5,
  firecrawlSearchResults: 5,
  firecrawlScrapePages: 2,
  analysisSignals: 20,
  analysisSignalChars: 1_500,
  analysisMaxOutputTokens: 4_000,
  /** Dedicated bounded semantic path for cleaned YouTube evidence. */
  youtubeSemanticBatchSignals: 25,
  youtubeSemanticSignalChars: 600,
  youtubeSemanticMaxBatches: 12,
  youtubeSemanticCandidatesPerBatch: 8,
  youtubeSemanticCandidateEvidenceIds: 6,
  youtubeSemanticConsolidationCandidates: 96,
  youtubeSemanticMaxOutputTokens: 1_200,
} as const;

export const MARKET_RESEARCH_TOPIC_MIN_LENGTH = 3;
export const MARKET_RESEARCH_TOPIC_MAX_LENGTH = 240;

/** Discovery budget per acquisition provider, used by the server and reported to the UI. */
export function marketResearchProviderBudget(provider: MarketResearchProvider): number {
  switch (provider) {
    // YouTube is bounded by retained comments, not by a single search page.
    case "youtube": return MARKET_RESEARCH_BUDGETS.youtubeTargetComments;
    case "tavily": return MARKET_RESEARCH_BUDGETS.tavilyResults;
    case "exa": return MARKET_RESEARCH_BUDGETS.exaResults;
    case "brave": return MARKET_RESEARCH_BUDGETS.braveResults;
    case "firecrawl": return MARKET_RESEARCH_BUDGETS.firecrawlSearchResults;
  }
}

export const MARKET_RESEARCH_FINDING_CATEGORIES = [
  "pains",
  "desires",
  "failed_solutions",
  "current_solutions",
  "complaints",
  "objections",
  "desired_outcomes",
  "market_language",
  "commercial_intent",
  "repeated_themes",
  "risks",
] as const;
export const MarketResearchFindingCategorySchema = Type.Union(
  MARKET_RESEARCH_FINDING_CATEGORIES.map((category) => Type.Literal(category)),
);
export type MarketResearchFindingCategory = Static<typeof MarketResearchFindingCategorySchema>;

/** Deterministic corroboration level; never produced by the LLM. */
export const MARKET_RESEARCH_CONFIDENCE_LEVELS = ["single_signal", "corroborated", "cross_provider"] as const;
export const MarketResearchConfidenceSchema = Type.Union(
  MARKET_RESEARCH_CONFIDENCE_LEVELS.map((level) => Type.Literal(level)),
);
export type MarketResearchConfidence = Static<typeof MarketResearchConfidenceSchema>;

export const MARKET_RESEARCH_EVIDENCE_STRENGTHS = ["isolated", "repeated", "strong_repeated"] as const;
export const MarketResearchEvidenceStrengthSchema = Type.Union(
  MARKET_RESEARCH_EVIDENCE_STRENGTHS.map((strength) => Type.Literal(strength)),
);
export type MarketResearchEvidenceStrength = Static<typeof MarketResearchEvidenceStrengthSchema>;

export const MARKET_RESEARCH_YOUTUBE_RELEVANCE_GATE_VERSION = "youtube-relevance-gate/v1" as const;
export const MARKET_RESEARCH_YOUTUBE_MAX_REPORTED_DURATION_SECONDS = 365 * 24 * 60 * 60;
export const MARKET_RESEARCH_YOUTUBE_RELEVANCE_DECISIONS = ["relevant", "borderline", "irrelevant"] as const;
export const MarketResearchYouTubeRelevanceDecisionSchema = Type.Union([
  Type.Literal("relevant"),
  Type.Literal("borderline"),
  Type.Literal("irrelevant"),
]);
export type MarketResearchYouTubeRelevanceDecision = Static<typeof MarketResearchYouTubeRelevanceDecisionSchema>;

export const MARKET_RESEARCH_YOUTUBE_DETERMINISTIC_REASONS = [
  "video_metadata_unavailable",
  "duration_unavailable",
  "duration_below_minimum",
  "no_meaningful_topic_terms",
  "no_topic_overlap",
  "strong_title_topic_overlap",
  "strong_metadata_topic_overlap",
  "limited_topic_overlap",
] as const;
export const MarketResearchYouTubeDeterministicReasonSchema = Type.Union(
  MARKET_RESEARCH_YOUTUBE_DETERMINISTIC_REASONS.map((reason) => Type.Literal(reason)),
);
export type MarketResearchYouTubeDeterministicReason = Static<typeof MarketResearchYouTubeDeterministicReasonSchema>;

/** Strict, bounded output of one optional borderline metadata review. */
export const MarketResearchYouTubeRelevanceReviewSchema = Type.Object({
  decision: Type.Union([MarketResearchYouTubeRelevanceDecisionSchema, Type.Null()]),
  provider: Type.Union([MarketResearchAnalyzerSchema, Type.Null()]),
  model: Type.Union([Type.String({ minLength: 1, maxLength: 128 }), Type.Null()]),
  fallback: Type.Boolean(),
  reason: Type.String({ minLength: 1, maxLength: MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxReasonChars }),
  matchedAspects: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), {
    maxItems: MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxMatchedAspects,
  }),
  failure: Type.Union([Type.String({ minLength: 1, maxLength: 160 }), Type.Null()]),
}, { additionalProperties: false });
export type MarketResearchYouTubeRelevanceReview = Static<typeof MarketResearchYouTubeRelevanceReviewSchema>;

/** Full relevance-gate provenance retained for accepted and rejected selections. */
export const MarketResearchYouTubeRelevanceProvenanceSchema = Type.Object({
  version: Type.Literal(MARKET_RESEARCH_YOUTUBE_RELEVANCE_GATE_VERSION),
  deterministic: Type.Object({
    decision: MarketResearchYouTubeRelevanceDecisionSchema,
    reason: MarketResearchYouTubeDeterministicReasonSchema,
    matchedTerms: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), {
      maxItems: MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxMatchedTerms,
    }),
    durationSeconds: Type.Union([
      Type.Integer({ minimum: 0, maximum: MARKET_RESEARCH_YOUTUBE_MAX_REPORTED_DURATION_SECONDS }),
      Type.Null(),
    ]),
    minimumDurationSeconds: Type.Integer({
      minimum: MARKET_RESEARCH_BUDGETS.youtubeMinimumDurationSeconds,
      maximum: MARKET_RESEARCH_BUDGETS.youtubeMaximumMinimumDurationSeconds,
    }),
  }, { additionalProperties: false }),
  reviewer: Type.Union([MarketResearchYouTubeRelevanceReviewSchema, Type.Null()]),
  final: Type.Object({
    eligible: Type.Boolean(),
    rejectionReason: Type.Union([Type.String({ minLength: 1, maxLength: 64 }), Type.Null()]),
  }, { additionalProperties: false }),
}, { additionalProperties: false });
export type MarketResearchYouTubeRelevanceProvenance = Static<typeof MarketResearchYouTubeRelevanceProvenanceSchema>;

export const MarketResearchYouTubeVideoDecisionAuditSchema = Type.Object({
  videoId: Type.String({ minLength: 1, maxLength: 64 }),
  channelId: Type.String({ minLength: 1, maxLength: 128 }),
  selectionOrder: Type.Integer({ minimum: 1, maximum: MARKET_RESEARCH_BUDGETS.youtubeMaxVideos }),
  relevance: MarketResearchYouTubeRelevanceProvenanceSchema,
}, { additionalProperties: false });
export type MarketResearchYouTubeVideoDecisionAudit = Static<typeof MarketResearchYouTubeVideoDecisionAuditSchema>;

/**
 * Public, bounded YouTube provenance retained with a persisted Market Signal.
 * Each value is provider-declared or captured during deterministic acquisition;
 * nothing is inferred from region, query language, or the semantic model.
 */
export const MarketResearchYouTubeMetadataSchema = Type.Object({
  videoId: Type.String({ minLength: 1, maxLength: 64 }),
  channelId: Type.String({ minLength: 1, maxLength: 128 }),
  channelTitle: Type.String({ minLength: 1, maxLength: 500 }),
  query: Type.String({ minLength: 1, maxLength: 500 }),
  queryAngle: Type.Union([Type.String({ minLength: 1, maxLength: 64 }), Type.Null()]),
  queryLanguage: Type.Union([Type.String({ minLength: 1, maxLength: 32 }), Type.Null()]),
  declaredLanguage: Type.Union([Type.String({ minLength: 1, maxLength: 64 }), Type.Null()]),
  channelCountry: Type.Union([Type.String({ minLength: 1, maxLength: 16 }), Type.Null()]),
  /** Optional so signals from historical runs restore without migration. */
  relevance: Type.Optional(MarketResearchYouTubeRelevanceProvenanceSchema),
}, { additionalProperties: false });
export type MarketResearchYouTubeMetadata = Static<typeof MarketResearchYouTubeMetadataSchema>;

/**
 * One retained signal exposed to the client. It carries the run-local reference
 * ID used to ground findings plus bounded provenance for evidence inspection.
 */
export const MarketResearchSignalSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 16 }),
  provider: MarketResearchProviderSchema,
  source: MarketSignalSourceSchema,
  sourceId: Type.Union([Type.String(), Type.Null()]),
  url: Type.Union([Type.String(), Type.Null()]),
  capturedAt: Type.String({ format: "date-time" }),
  text: Type.String({ minLength: 1, maxLength: MARKET_RESEARCH_BUDGETS.analysisSignalChars }),
  /** True when Firecrawl scrape deepened this signal after dedupe. */
  deepened: Type.Boolean(),
  /** Optional so historical runs restore without migration. */
  youtube: Type.Optional(MarketResearchYouTubeMetadataSchema),
});
export type MarketResearchSignal = Static<typeof MarketResearchSignalSchema>;

export const MarketResearchFindingSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 16 }),
  category: MarketResearchFindingCategorySchema,
  statement: Type.String({ minLength: 1 }),
  customerLanguage: Type.Union([Type.String(), Type.Null()]),
  signalIds: Type.Array(Type.String(), { minItems: 1 }),
  supportingSignals: Type.Integer({ minimum: 1 }),
  independentProviders: Type.Integer({ minimum: 1 }),
  domainDiversity: Type.Integer({ minimum: 0 }),
  recentSignals: Type.Integer({ minimum: 0 }),
  repeatedEvidence: Type.Boolean(),
  /** Signals shared with a risk/negative finding; deterministic, not inferred. */
  contradictingSignals: Type.Integer({ minimum: 0 }),
  confidence: MarketResearchConfidenceSchema,
  /** Deterministic evidence diversity; optional for historical persisted runs. */
  evidenceStrength: Type.Optional(MarketResearchEvidenceStrengthSchema),
  distinctVideos: Type.Optional(Type.Integer({ minimum: 0 })),
  distinctChannels: Type.Optional(Type.Integer({ minimum: 0 })),
  languages: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 16 })),
});
export type MarketResearchFinding = Static<typeof MarketResearchFindingSchema>;

export const MarketResearchYouTubeAcquisitionSchema = Type.Object({
  queries: Type.Integer({ minimum: 0 }),
  videosDiscovered: Type.Integer({ minimum: 0 }),
  videosSelected: Type.Integer({ minimum: 0 }),
  videosWithComments: Type.Integer({ minimum: 0 }),
  videosSkipped: Type.Integer({ minimum: 0 }),
  commentsFetched: Type.Integer({ minimum: 0 }),
  commentsValid: Type.Integer({ minimum: 0 }),
  commentsUnique: Type.Integer({ minimum: 0 }),
  commentsDiscarded: Type.Integer({ minimum: 0 }),
  structurallyRejected: Type.Integer({ minimum: 0 }),
  qualityRejected: Type.Integer({ minimum: 0 }),
  exactDuplicatesRemoved: Type.Integer({ minimum: 0 }),
  nearDuplicatesRemoved: Type.Integer({ minimum: 0 }),
  repliesRetained: Type.Integer({ minimum: 0 }),
  distinctVideosRepresented: Type.Integer({ minimum: 0 }),
  distinctChannelsRepresented: Type.Integer({ minimum: 0 }),
  maxCommentsFromOneVideo: Type.Integer({ minimum: 0 }),
  maxCommentsFromOneChannel: Type.Integer({ minimum: 0 }),
  lowYieldBatches: Type.Integer({ minimum: 0 }),
  stopReason: Type.String({ minLength: 1, maxLength: 64 }),
  /** Optional relevance-gate telemetry; historical persisted runs omit it. */
  videoMetadataFailures: Type.Optional(Type.Integer({ minimum: 0 })),
  videoDurationRejects: Type.Optional(Type.Integer({ minimum: 0 })),
  deterministicRelevantVideos: Type.Optional(Type.Integer({ minimum: 0 })),
  deterministicBorderlineVideos: Type.Optional(Type.Integer({ minimum: 0 })),
  deterministicIrrelevantVideos: Type.Optional(Type.Integer({ minimum: 0 })),
  successfulBorderlineReviews: Type.Optional(Type.Integer({ minimum: 0 })),
  borderlineReviewerFailures: Type.Optional(Type.Integer({ minimum: 0 })),
  finalRelevantVideos: Type.Optional(Type.Integer({ minimum: 0 })),
  researchRelevantComments: Type.Optional(Type.Integer({ minimum: 0 })),
  researchIrrelevantComments: Type.Optional(Type.Integer({ minimum: 0 })),
  creatorPromotionalCommentsExcluded: Type.Optional(Type.Integer({ minimum: 0 })),
  relevanceReviewerAttempts: Type.Optional(Type.Integer({ minimum: 0 })),
  relevanceReviewerFallbackAttempts: Type.Optional(Type.Integer({ minimum: 0 })),
  relevanceReviewerInputTokens: Type.Optional(Type.Integer({ minimum: 0 })),
  relevanceReviewerOutputTokens: Type.Optional(Type.Integer({ minimum: 0 })),
  videoRelevanceDecisionAudit: Type.Optional(Type.Array(MarketResearchYouTubeVideoDecisionAuditSchema, {
    maxItems: MARKET_RESEARCH_BUDGETS.youtubeMaxVideos,
  })),
});
export type MarketResearchYouTubeAcquisition = Static<typeof MarketResearchYouTubeAcquisitionSchema>;

export const MarketResearchProviderReportSchema = Type.Object({
  provider: MarketResearchProviderSchema,
  state: MarketResearchProviderStateSchema,
  requested: Type.Integer({ minimum: 0 }),
  returned: Type.Integer({ minimum: 0 }),
  valid: Type.Integer({ minimum: 0 }),
  unique: Type.Integer({ minimum: 0 }),
  duplicates: Type.Integer({ minimum: 0 }),
  analyzed: Type.Integer({ minimum: 0 }),
  scrapedPages: Type.Integer({ minimum: 0 }),
  latencyMs: Type.Integer({ minimum: 0 }),
  /** Safe IntegrationError category; never a provider body or header. */
  failure: Type.Union([Type.String(), Type.Null()]),
  usage: Type.Union([Type.Number(), Type.Null()]),
  credits: Type.Union([Type.Number(), Type.Null()]),
  /** Bounded deterministic acquisition telemetry for the YouTube provider. */
  youtube: Type.Optional(MarketResearchYouTubeAcquisitionSchema),
});
export type MarketResearchProviderReport = Static<typeof MarketResearchProviderReportSchema>;

export const MarketResearchYouTubeAnalysisSchema = Type.Object({
  semanticBatches: Type.Integer({ minimum: 0 }),
  successfulBatches: Type.Integer({ minimum: 0 }),
  failedBatches: Type.Integer({ minimum: 0 }),
  analyzedSignals: Type.Integer({ minimum: 0 }),
  candidateFindings: Type.Integer({ minimum: 0 }),
  rejectedCandidates: Type.Integer({ minimum: 0 }),
  citedSignals: Type.Integer({ minimum: 0 }),
  citedVideos: Type.Integer({ minimum: 0 }),
  citedChannels: Type.Integer({ minimum: 0 }),
  languages: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 16 }),
  fallbackBatches: Type.Integer({ minimum: 0 }),
});
export type MarketResearchYouTubeAnalysis = Static<typeof MarketResearchYouTubeAnalysisSchema>;

export const MarketResearchAnalysisSchema = Type.Object({
  analyzer: Type.Union([MarketResearchAnalyzerSchema, Type.Null()]),
  model: Type.Union([Type.String(), Type.Null()]),
  fallbackUsed: Type.Boolean(),
  /** Safe reason the primary analyzer was abandoned, if it was. */
  primaryFailure: Type.Union([Type.String(), Type.Null()]),
  analyzedSignals: Type.Integer({ minimum: 0 }),
  rejectedClaims: Type.Integer({ minimum: 0 }),
  inputTokens: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  outputTokens: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  failure: Type.Union([Type.String(), Type.Null()]),
  /** Dedicated YouTube batch-mining telemetry; absent on historical runs. */
  youtube: Type.Optional(MarketResearchYouTubeAnalysisSchema),
});
export type MarketResearchAnalysis = Static<typeof MarketResearchAnalysisSchema>;

export const MarketResearchMetricsSchema = Type.Object({
  requestedSignals: Type.Integer({ minimum: 0 }),
  returnedSignals: Type.Integer({ minimum: 0 }),
  validSignals: Type.Integer({ minimum: 0 }),
  uniqueSignals: Type.Integer({ minimum: 0 }),
  duplicatesRemoved: Type.Integer({ minimum: 0 }),
  analyzedSignals: Type.Integer({ minimum: 0 }),
  discardedByAnalysisBudget: Type.Integer({ minimum: 0 }),
  deepenedSignals: Type.Integer({ minimum: 0 }),
});
export type MarketResearchMetrics = Static<typeof MarketResearchMetricsSchema>;

export const MarketResearchRunSchema = Type.Object({
  runId: Type.String({ minLength: 1 }),
  projectId: Type.String({ format: "uuid" }),
  topic: Type.String({ minLength: 1 }),
  startedAt: Type.String({ format: "date-time" }),
  completedAt: Type.String({ format: "date-time" }),
  durationMs: Type.Integer({ minimum: 0 }),
  providers: Type.Array(MarketResearchProviderReportSchema),
  metrics: MarketResearchMetricsSchema,
  analysis: MarketResearchAnalysisSchema,
  findings: Type.Array(MarketResearchFindingSchema),
  signals: Type.Array(MarketResearchSignalSchema),
});
export type MarketResearchRun = Static<typeof MarketResearchRunSchema>;

/** Bounded, safe response used to restore saved Market Research runs. */
export const MarketResearchHistorySchema = Type.Object({
  runs: Type.Array(MarketResearchRunSchema, { maxItems: 10 }),
}, { additionalProperties: false });
export type MarketResearchHistory = Static<typeof MarketResearchHistorySchema>;

export const MarketResearchProviderStatusSchema = Type.Object({
  provider: MarketResearchProviderSchema,
  state: MarketResearchProviderStateSchema,
  budget: Type.Integer({ minimum: 1 }),
});
export type MarketResearchProviderStatus = Static<typeof MarketResearchProviderStatusSchema>;

export const MarketResearchStatusSchema = Type.Object({
  providers: Type.Array(MarketResearchProviderStatusSchema),
  analyzers: Type.Object({
    primary: Type.Object({
      analyzer: MarketResearchAnalyzerSchema,
      model: Type.String(),
      state: MarketResearchProviderStateSchema,
    }),
    fallback: Type.Object({
      analyzer: MarketResearchAnalyzerSchema,
      model: Type.String(),
      state: MarketResearchProviderStateSchema,
    }),
  }),
  budgets: Type.Object({
    analysisSignals: Type.Integer({ minimum: 1 }),
    analysisSignalChars: Type.Integer({ minimum: 1 }),
    firecrawlScrapePages: Type.Integer({ minimum: 0 }),
    youtubeTargetVideos: Type.Integer({ minimum: 1 }),
    youtubeTargetComments: Type.Integer({ minimum: 1 }),
    youtubeMaxVideos: Type.Integer({ minimum: 1 }),
    youtubeMaxComments: Type.Integer({ minimum: 1 }),
    /** Server default used when a run does not override the long-form gate. */
    youtubeMinimumDurationSeconds: Type.Integer({
      minimum: MARKET_RESEARCH_BUDGETS.youtubeMinimumDurationSeconds,
      maximum: MARKET_RESEARCH_BUDGETS.youtubeMaximumMinimumDurationSeconds,
    }),
  }),
});
export type MarketResearchStatus = Static<typeof MarketResearchStatusSchema>;

export const RunMarketResearchSchema = Type.Object({
  topic: Type.String({ minLength: MARKET_RESEARCH_TOPIC_MIN_LENGTH, maxLength: MARKET_RESEARCH_TOPIC_MAX_LENGTH }),
  providers: Type.Optional(Type.Array(MarketResearchProviderSchema, { minItems: 1, maxItems: MARKET_RESEARCH_PROVIDERS.length })),
  youtubeMinimumDurationSeconds: Type.Optional(Type.Integer({
    minimum: MARKET_RESEARCH_BUDGETS.youtubeMinimumDurationSeconds,
    maximum: MARKET_RESEARCH_BUDGETS.youtubeMaximumMinimumDurationSeconds,
    default: MARKET_RESEARCH_BUDGETS.youtubeMinimumDurationSeconds,
  })),
}, { additionalProperties: false });
export type RunMarketResearchInput = Static<typeof RunMarketResearchSchema>;

const PROVIDER_LABELS: Readonly<Record<MarketResearchProvider, string>> = {
  youtube: "YouTube",
  tavily: "Tavily",
  exa: "Exa",
  brave: "Brave",
  firecrawl: "Firecrawl",
};

const PROVIDER_STATE_LABELS: Readonly<Record<MarketResearchProviderState, string>> = {
  available: "Disponible",
  not_configured: "No configurado",
  temporary_error: "Error temporal",
};

const ANALYZER_LABELS: Readonly<Record<MarketResearchAnalyzer, string>> = {
  deepseek: "DeepSeek V4 Flash",
  gemini: "Gemini fallback",
};

const FINDING_CATEGORY_LABELS: Readonly<Record<MarketResearchFindingCategory, string>> = {
  pains: "Dolores",
  desires: "Deseos",
  failed_solutions: "Soluciones fallidas",
  current_solutions: "Soluciones actuales",
  complaints: "Quejas",
  objections: "Objeciones",
  desired_outcomes: "Resultados deseados",
  market_language: "Lenguaje del mercado",
  commercial_intent: "Intención comercial",
  repeated_themes: "Temas repetidos",
  risks: "Riesgos",
};

const CONFIDENCE_LABELS: Readonly<Record<MarketResearchConfidence, string>> = {
  single_signal: "Señal aislada",
  corroborated: "Corroborado",
  cross_provider: "Multi-fuente",
};

const EVIDENCE_STRENGTH_LABELS: Readonly<Record<MarketResearchEvidenceStrength, string>> = {
  isolated: "Aislada",
  repeated: "Patrón repetido",
  strong_repeated: "Patrón fuertemente repetido",
};

export function marketResearchEvidenceStrengthLabel(strength: MarketResearchEvidenceStrength): string {
  return EVIDENCE_STRENGTH_LABELS[strength];
}

export function marketResearchProviderLabel(provider: MarketResearchProvider): string {
  return PROVIDER_LABELS[provider];
}

export function marketResearchProviderStateLabel(state: MarketResearchProviderState): string {
  return PROVIDER_STATE_LABELS[state];
}

export function marketResearchAnalyzerLabel(analyzer: MarketResearchAnalyzer): string {
  return ANALYZER_LABELS[analyzer];
}

export function marketResearchFindingCategoryLabel(category: MarketResearchFindingCategory): string {
  return FINDING_CATEGORY_LABELS[category];
}

export function marketResearchConfidenceLabel(confidence: MarketResearchConfidence): string {
  return CONFIDENCE_LABELS[confidence];
}

/** Bounded, ordered progress phases shown while one run is in flight. */
export const MARKET_RESEARCH_PROGRESS_PHASES = [
  "Buscando señales...",
  "Normalizando evidencia...",
  "Eliminando duplicados...",
  "Profundizando fuentes relevantes...",
  "Analizando patrones...",
  "Construyendo resultados...",
] as const;

export interface MarketResearchRunSummary {
  readonly totalFound: number;
  readonly valid: number;
  readonly unique: number;
  readonly analyzed: number;
  readonly providersUsed: readonly MarketResearchProvider[];
  readonly providersFailed: readonly MarketResearchProvider[];
  readonly analysisLabel: string;
  readonly findingCount: number;
}

/** Pure derivation of the completed-run header; the UI renders it verbatim. */
export function summarizeMarketResearchRun(run: MarketResearchRun): MarketResearchRunSummary {
  const providersUsed = run.providers.filter((report) => report.unique > 0).map((report) => report.provider);
  const providersFailed = run.providers.filter((report) => report.failure !== null).map((report) => report.provider);
  return {
    totalFound: run.metrics.returnedSignals,
    valid: run.metrics.validSignals,
    unique: run.metrics.uniqueSignals,
    analyzed: run.metrics.analyzedSignals,
    providersUsed,
    providersFailed,
    analysisLabel: run.analysis.analyzer === null
      ? "Análisis no disponible"
      : marketResearchAnalyzerLabel(run.analysis.analyzer),
    findingCount: run.findings.length,
  };
}

/** Findings grouped in a stable category order; empty categories are omitted. */
export function groupMarketResearchFindings(
  run: MarketResearchRun,
): ReadonlyArray<readonly [MarketResearchFindingCategory, readonly MarketResearchFinding[]]> {
  const groups: Array<readonly [MarketResearchFindingCategory, readonly MarketResearchFinding[]]> = [];
  for (const category of MARKET_RESEARCH_FINDING_CATEGORIES) {
    const findings = run.findings.filter((finding) => finding.category === category);
    if (findings.length > 0) groups.push([category, findings]);
  }
  return groups;
}

/** Supporting signals for one finding, in run order, for evidence inspection. */
export function marketResearchFindingEvidence(
  run: MarketResearchRun,
  finding: MarketResearchFinding,
): readonly MarketResearchSignal[] {
  const referenced = new Set(finding.signalIds);
  return run.signals.filter((signal) => referenced.has(signal.id));
}

const SIGNAL_SOURCE_LABELS: Readonly<Record<MarketSignalSource, string>> = {
  youtube: "YouTube",
  web: "Web",
  google: "Google",
  qa_forum: "Foro de preguntas",
  competitor_ad: "Anuncio de competidor",
  review: "Reseña",
  reddit: "Reddit",
};

export function marketResearchSignalSourceLabel(source: MarketSignalSource): string {
  return SIGNAL_SOURCE_LABELS[source];
}

/** "Todos" plus one entry per acquisition provider, for the evidence explorer. */
export const MARKET_RESEARCH_EVIDENCE_FILTERS = ["all", ...MARKET_RESEARCH_PROVIDERS] as const;
export type MarketResearchEvidenceFilter = (typeof MARKET_RESEARCH_EVIDENCE_FILTERS)[number];

export function marketResearchEvidenceFilterLabel(filter: MarketResearchEvidenceFilter): string {
  return filter === "all" ? "Todos" : marketResearchProviderLabel(filter);
}

/**
 * One persisted signal plus the findings that literally cite it. The citation
 * link is read from stored `signalIds` only, so nothing is inferred: a signal
 * with no citing finding is reported as captured, never as analyzed.
 */
export interface MarketResearchSignalEvidence {
  readonly signal: MarketResearchSignal;
  readonly citedBy: readonly MarketResearchFinding[];
  readonly categories: readonly MarketResearchFindingCategory[];
  readonly cited: boolean;
}

/** Deterministic signal -> finding traceability derived from the persisted run. */
export function marketResearchSignalEvidence(
  run: MarketResearchRun,
): readonly MarketResearchSignalEvidence[] {
  return run.signals.map((signal) => {
    const citedBy = run.findings.filter((finding) => finding.signalIds.includes(signal.id));
    const categories = MARKET_RESEARCH_FINDING_CATEGORIES.filter((category) =>
      citedBy.some((finding) => finding.category === category),
    );
    return { signal, citedBy, categories, cited: citedBy.length > 0 };
  });
}

/** Filters persisted evidence by provider; "all" preserves run order. */
export function filterMarketResearchSignalEvidence(
  evidence: readonly MarketResearchSignalEvidence[],
  filter: MarketResearchEvidenceFilter,
): readonly MarketResearchSignalEvidence[] {
  return filter === "all" ? evidence : evidence.filter((item) => item.signal.provider === filter);
}

/** Providers that actually persisted at least one signal in this run. */
export function marketResearchEvidenceFilters(
  run: MarketResearchRun,
): readonly MarketResearchEvidenceFilter[] {
  const providers = MARKET_RESEARCH_PROVIDERS.filter((provider) =>
    run.signals.some((signal) => signal.provider === provider),
  );
  return providers.length === 0 ? [] : ["all", ...providers];
}

/**
 * The active Research Focus is the canonical default for research topic inputs.
 * It only seeds a pristine field: once the user edits the input, their text wins
 * until the project changes and the caller resets its local state.
 */
export function researchTopicDefault(
  focus: string | null,
  current: string,
  edited: boolean,
): string {
  if (edited) return current;
  const trimmed = focus === null ? "" : focus.trim();
  return trimmed === "" ? current : trimmed;
}
