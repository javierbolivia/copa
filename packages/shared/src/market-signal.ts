import { Type, type Static } from "@sinclair/typebox";

/** Vocabulary for external records; this does not extend persisted Source types. */
export const MARKET_SIGNAL_SOURCES = [
  "youtube",
  "web",
  "google",
  "qa_forum",
  "competitor_ad",
  "review",
  "reddit",
] as const;

export const MarketSignalSourceSchema = Type.Union(
  MARKET_SIGNAL_SOURCES.map((source) => Type.Literal(source)),
);
export type MarketSignalSource = Static<typeof MarketSignalSourceSchema>;

export const MARKET_SIGNAL_NORMALIZATION_VERSION = "market-signal/v1";

const NullableTextSchema = Type.Union([Type.String(), Type.Null()]);
const NullableIdentifierSchema = Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]);

export const MarketSignalUrlSchema = Type.String({
  minLength: 1,
  maxLength: 2_048,
  format: "uri",
  pattern: "^https?://[^/?#]+",
});
const NullableUrlSchema = Type.Union([MarketSignalUrlSchema, Type.Null()]);

/** An auditable external record must retain a non-empty provider ID or valid HTTP(S) URL. */
export const MarketSignalIdentitySchema = Type.Union([
  Type.Object({ sourceId: Type.String({ minLength: 1, maxLength: 500 }) }),
  Type.Object({ url: MarketSignalUrlSchema }),
]);
export type MarketSignalIdentity = Static<typeof MarketSignalIdentitySchema>;

export const MarketSignalEngagementSchema = Type.Record(
  Type.String({ minLength: 1, maxLength: 64 }),
  Type.Number({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);

const MarketSignalProvenanceFieldsSchema = Type.Object({
  provider: Type.String({ minLength: 1, maxLength: 120 }),
  source: MarketSignalSourceSchema,
  sourceId: NullableIdentifierSchema,
  url: NullableUrlSchema,
  query: NullableTextSchema,
  capturedAt: Type.String({ format: "date-time" }),
  normalizationVersion: Type.String({ minLength: 1, maxLength: 120 }),
});

export const MarketSignalProvenanceSchema = Type.Intersect([
  MarketSignalProvenanceFieldsSchema,
  MarketSignalIdentitySchema,
], { additionalProperties: false });

const MarketSignalFieldsSchema = Type.Object({
  source: MarketSignalSourceSchema,
  sourceId: NullableIdentifierSchema,
  url: NullableUrlSchema,
  query: NullableTextSchema,
  capturedAt: Type.String({ format: "date-time" }),
  text: Type.String({ minLength: 1, maxLength: 10_000 }),
  engagement: MarketSignalEngagementSchema,
  context: NullableTextSchema,
  pain: NullableTextSchema,
  desiredOutcome: NullableTextSchema,
  failedAttempt: NullableTextSchema,
  currentSolution: NullableTextSchema,
  solutionComplaint: NullableTextSchema,
  urgency: NullableTextSchema,
  specificity: NullableTextSchema,
  commercialIntent: NullableTextSchema,
  provenance: MarketSignalProvenanceSchema,
});

/**
 * A transient, provider-agnostic external market record. It is not a Source,
 * Comment, EvidenceSnippet, or Analysis Set member and has no persistence ID.
 */
export const MarketSignalSchema = Type.Intersect([
  MarketSignalFieldsSchema,
  MarketSignalIdentitySchema,
], { additionalProperties: false });

export type MarketSignalEngagement = Static<typeof MarketSignalEngagementSchema>;
export type MarketSignalProvenance = Static<typeof MarketSignalProvenanceSchema>;
export type MarketSignal = Static<typeof MarketSignalSchema>;

declare const normalizedMarketSignal: unique symbol;
/** A MarketSignal accepted and canonically produced by the deterministic normalizer. */
export type NormalizedMarketSignal = MarketSignal & {
  readonly [normalizedMarketSignal]: "NormalizedMarketSignal";
};

/** Input permitted at the Research boundary; provider DTOs and clients stay outside it. */
export interface MarketSignalAdapterRequest {
  query: string | null;
}

/** A provider adapter can only identify its source and return auditable normalized signals. */
export interface MarketSignalAdapter {
  readonly source: MarketSignalSource;
  collect(input: Readonly<MarketSignalAdapterRequest>): Promise<readonly NormalizedMarketSignal[]>;
}
