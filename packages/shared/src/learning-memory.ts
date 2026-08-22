import { Type, type Static } from "@sinclair/typebox";

export const LearnedMemoryKindSchema = Type.Union([
  Type.Literal("DOMAIN_KNOWLEDGE"),
  Type.Literal("SEMANTIC_KNOWLEDGE"),
  Type.Literal("RESEARCH_INTELLIGENCE"),
]);

export const LearnedMemoryScopeSchema = Type.Union([
  Type.Literal("PROJECT"),
  Type.Literal("DOMAIN"),
  Type.Literal("GLOBAL"),
]);

export const LearnedMemoryStatusSchema = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("WEAKENED"),
  Type.Literal("CONTRADICTED"),
  Type.Literal("SUPERSEDED"),
]);

const NullableCountSchema = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);

export const MemoryProvenanceSummarySchema = Type.Object({
  summary: Type.String({ minLength: 1, maxLength: 1000 }),
  sourceKinds: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), {
    maxItems: 20,
    uniqueItems: true,
  }),
}, { additionalProperties: false });

export const LearnedMemorySchema = Type.Object({
  id: Type.String({ minLength: 64, maxLength: 64 }),
  kind: LearnedMemoryKindSchema,
  scope: LearnedMemoryScopeSchema,
  projectId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  domain: Type.Union([Type.String(), Type.Null()]),
  canonicalKey: Type.String({ minLength: 1, maxLength: 1000 }),
  statement: Type.String({ minLength: 1, maxLength: 4000 }),
  value: Type.Unknown(),
  status: LearnedMemoryStatusSchema,
  supportCount: NullableCountSchema,
  sourceCount: NullableCountSchema,
  authorCount: NullableCountSchema,
  projectCount: NullableCountSchema,
  confidence: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
  firstSeenAt: Type.String({ format: "date-time" }),
  lastReinforcedAt: Type.String({ format: "date-time" }),
  reinforcementCount: Type.Integer({ minimum: 1 }),
  contradictionCount: Type.Integer({ minimum: 0 }),
  provenanceSummary: MemoryProvenanceSummarySchema,
});

export type LearnedMemoryKind = Static<typeof LearnedMemoryKindSchema>;
export type LearnedMemoryScope = Static<typeof LearnedMemoryScopeSchema>;
export type LearnedMemoryStatus = Static<typeof LearnedMemoryStatusSchema>;
export type MemoryProvenanceSummary = Static<typeof MemoryProvenanceSummarySchema>;
export type LearnedMemory = Static<typeof LearnedMemorySchema>;
