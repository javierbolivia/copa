/**
 * Local-only semantic retrieval contracts. These types deliberately do not
 * depend on repositories or ModuleService, so a later production integration
 * can retain the existing FTS5 boundary and project-policy checks.
 */
export interface SemanticEmbeddingResult {
  readonly status: "ready" | "unavailable";
  readonly provider: string;
  readonly dimensions?: number;
  readonly vector?: readonly number[];
  readonly reason?: string;
}

export interface SemanticEmbeddingBatchResult {
  readonly status: "ready" | "unavailable";
  readonly provider: string;
  readonly dimensions?: number;
  readonly vectors?: readonly (readonly number[])[];
  readonly reason?: string;
}

export interface SemanticEmbeddingProvider {
  readonly name: string;
  readonly available: boolean;
  embed(input: string): Promise<SemanticEmbeddingResult>;
  embedBatch(inputs: readonly string[]): Promise<SemanticEmbeddingBatchResult>;
}

export interface SemanticRerankCandidate {
  readonly id: string;
  readonly text: string;
}

export interface SemanticRerankResult {
  readonly status: "ready" | "unavailable";
  readonly provider: string;
  readonly scores?: readonly number[];
  readonly reason?: string;
}

export interface SemanticReranker {
  readonly name: string;
  readonly available: boolean;
  rerank(query: string, candidates: readonly SemanticRerankCandidate[]): Promise<SemanticRerankResult>;
}

export interface SemanticCandidate extends SemanticRerankCandidate {
  readonly projectId: string;
  readonly lexicalScore: number;
}

export interface RankedSemanticCandidate extends SemanticCandidate {
  readonly semanticScore: number;
  readonly hybridScore: number;
  readonly rerankScore?: number;
}
