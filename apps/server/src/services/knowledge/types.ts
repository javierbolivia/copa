export const KNOWLEDGE_KINDS = [
  "project_evidence",
  "project_knowledge",
  "global_knowledge",
  "approved_memory",
] as const;

export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];
export type ScoreDirection = "higher_is_better" | "lower_is_better";

export interface KnowledgeRepositorySearchRequest {
  readonly projectId: string;
  readonly query: string;
  readonly kinds: readonly KnowledgeKind[];
  readonly limit: number;
  readonly approvedMemoryOnly: true;
  readonly libraryIds?: readonly string[];
  readonly categories?: readonly string[];
  readonly tags?: readonly string[];
}

export interface KnowledgeRepositoryHit {
  readonly chunkId: string;
  readonly documentId: string;
  readonly projectId: string | null;
  readonly kind: KnowledgeKind;
  readonly content: string;
  readonly documentTitle: string;
  readonly rawScore: number;
  readonly chunkIndex: number;
  readonly libraryId?: string;
  readonly libraryName?: string;
  readonly sourceUrl?: string;
  readonly sourceLabel?: string;
  readonly pageNumber?: number;
  readonly heading?: string;
  readonly approvalStatus?: "approved" | "rejected" | null;
  readonly categories?: readonly string[];
  readonly tags?: readonly string[];
}

export interface KnowledgeRepositorySearchResult {
  readonly hits: readonly KnowledgeRepositoryHit[];
  readonly scoreDirection: ScoreDirection;
}

export interface KnowledgeRepositoryPort {
  searchLexical(
    request: KnowledgeRepositorySearchRequest,
  ): Promise<KnowledgeRepositorySearchResult>;
}

export interface KnowledgeRetrievalRequest {
  readonly projectId: string;
  readonly query: string;
  readonly agentType: string;
  readonly libraries?: readonly string[];
  readonly categories?: readonly string[];
  readonly tags?: readonly string[];
  readonly includeKinds?: readonly KnowledgeKind[];
  readonly maxChunks?: number;
  readonly maxContextTokens?: number;
}

export type EvidencePriority = "low" | "medium" | "high" | "very_high";
export type KnowledgeInfluence = "none" | "restricted" | "low" | "medium" | "high";

export interface AgentKnowledgePolicy {
  readonly agentType: string;
  readonly evidencePriority: EvidencePriority;
  readonly knowledgeInfluence: KnowledgeInfluence;
  readonly memoryInfluence: KnowledgeInfluence;
  readonly advisoryOnly: boolean;
  readonly allowedKinds: readonly KnowledgeKind[];
  readonly kindWeights: Readonly<Record<KnowledgeKind, number>>;
  readonly maxChunks: number;
  readonly maxContextTokens: number;
  readonly maxPerKind: Readonly<Record<KnowledgeKind, number>>;
}

export interface RankedKnowledgeHit extends KnowledgeRepositoryHit {
  readonly normalizedLexicalScore: number;
  readonly policyWeight: number;
  readonly score: number;
}

export interface KnowledgeCitation {
  readonly id: string;
  readonly kind: KnowledgeKind;
  readonly documentId: string;
  readonly chunkId: string;
  readonly title: string;
  readonly source: string;
  readonly location: string;
  readonly score: number;
}

export interface ContextKnowledgeChunk extends RankedKnowledgeHit {
  /** Exact excerpt present in contextText. It can be shorter than content. */
  readonly excerpt: string;
  readonly citation: KnowledgeCitation;
}

export interface KnowledgeContextResult {
  readonly contextText: string;
  readonly chunks: readonly ContextKnowledgeChunk[];
  readonly citations: readonly KnowledgeCitation[];
  readonly estimatedTokens: number;
  readonly truncated: boolean;
  readonly omittedChunkCount: number;
}

export interface KnowledgeRetrievalResult extends KnowledgeContextResult {
  readonly projectId: string;
  readonly query: string;
  readonly agentType: string;
  readonly policy: AgentKnowledgePolicy;
  readonly retrievalMode: "lexical";
  readonly embeddingProvider: {
    readonly name: string;
    readonly available: boolean;
  };
}
