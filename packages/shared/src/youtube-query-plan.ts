import { Type, type Static } from "@sinclair/typebox";

import { LearnedMemoryKindSchema, LearnedMemoryScopeSchema } from "./learning-memory.js";

export const YOUTUBE_QUERY_PLAN_TARGET_MIN = 6;
export const YOUTUBE_QUERY_PLAN_TARGET_MAX = 8;
export const YOUTUBE_QUERY_PLAN_HARD_MAX = 10;

export const YouTubeQueryStrategySchema = Type.Union([
  Type.Literal("core"),
  Type.Literal("pain"),
  Type.Literal("context"),
  Type.Literal("natural_language"),
  Type.Literal("cause"),
  Type.Literal("solution_seeking"),
  Type.Literal("semantic_variant"),
  Type.Literal("learned_strategy"),
]);

export const YouTubePlannedQuerySchema = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 120 }),
  strategy: YouTubeQueryStrategySchema,
  memoryIds: Type.Array(Type.String({ minLength: 64, maxLength: 64 }), {
    maxItems: 8,
    uniqueItems: true,
  }),
}, { additionalProperties: false });

export const YouTubeQueryPlanMemorySchema = Type.Object({
  id: Type.String({ minLength: 64, maxLength: 64 }),
  kind: LearnedMemoryKindSchema,
  scope: LearnedMemoryScopeSchema,
}, { additionalProperties: false });

export const YouTubeQueryPlanDeduplicationSchema = Type.Object({
  candidate: Type.String({ minLength: 1, maxLength: 120 }),
  duplicateOf: Type.String({ minLength: 1, maxLength: 120 }),
  reason: Type.Union([Type.Literal("lexical"), Type.Literal("semantic_overlap")]),
}, { additionalProperties: false });

export const YouTubeQueryPlanSchema = Type.Object({
  originalFocus: Type.String({ maxLength: 4000 }),
  queries: Type.Array(YouTubePlannedQuerySchema, { maxItems: YOUTUBE_QUERY_PLAN_HARD_MAX }),
  memoryUsed: Type.Array(YouTubeQueryPlanMemorySchema, { maxItems: 8 }),
  deduplications: Type.Array(YouTubeQueryPlanDeduplicationSchema, { maxItems: 20 }),
  budget: Type.Object({
    targetMin: Type.Literal(YOUTUBE_QUERY_PLAN_TARGET_MIN),
    targetMax: Type.Literal(YOUTUBE_QUERY_PLAN_TARGET_MAX),
    hardMax: Type.Literal(YOUTUBE_QUERY_PLAN_HARD_MAX),
  }, { additionalProperties: false }),
  externalCalls: Type.Literal(0),
}, { additionalProperties: false });

export const YouTubeQueryPlanComparisonSchema = Type.Object({
  mode: Type.Literal("SHADOW"),
  executor: Type.Literal("CURRENT_PLAN"),
  currentQueries: Type.Array(Type.Object({
    /** Current executor accepts a 240-char focus plus its bounded template suffix. */
    query: Type.String({ minLength: 1, maxLength: 400 }),
    angle: Type.String({ minLength: 1, maxLength: 64 }),
    language: Type.String({ minLength: 1, maxLength: 16 }),
  }, { additionalProperties: false }), { maxItems: 12 }),
  proposed: YouTubeQueryPlanSchema,
}, { additionalProperties: false });

export type YouTubeQueryStrategy = Static<typeof YouTubeQueryStrategySchema>;
export type YouTubePlannedQuery = Static<typeof YouTubePlannedQuerySchema>;
export type YouTubeQueryPlanMemory = Static<typeof YouTubeQueryPlanMemorySchema>;
export type YouTubeQueryPlanDeduplication = Static<typeof YouTubeQueryPlanDeduplicationSchema>;
export type YouTubeQueryPlan = Static<typeof YouTubeQueryPlanSchema>;
export type YouTubeQueryPlanComparison = Static<typeof YouTubeQueryPlanComparisonSchema>;
