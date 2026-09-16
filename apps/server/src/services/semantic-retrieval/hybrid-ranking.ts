import type { RankedSemanticCandidate, SemanticCandidate, SemanticEmbeddingProvider, SemanticReranker } from "./types.js";

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function compare(left: RankedSemanticCandidate, right: RankedSemanticCandidate): number {
  const score = right.hybridScore - left.hybridScore;
  return score || left.id.localeCompare(right.id);
}

/**
 * Scores only the caller-supplied, already scope-filtered pool. No persistence,
 * repository query, or Product Studio coupling occurs here.
 */
export async function hybridRank(
  projectId: string,
  query: string,
  candidates: readonly SemanticCandidate[],
  embeddingProvider: SemanticEmbeddingProvider,
): Promise<readonly RankedSemanticCandidate[]> {
  const scoped = candidates.filter((candidate) => candidate.projectId === projectId);
  const batch = await embeddingProvider.embedBatch([query, ...scoped.map((candidate) => candidate.text)]);
  if (batch.status === "unavailable" || !batch.vectors) return lexicalFallback(scoped);
  const [queryVector, ...candidateVectors] = batch.vectors;
  if (!queryVector) return [];
  return scoped.map((candidate, index) => {
    const semanticScore = dot(queryVector, candidateVectors[index] ?? []);
    return { ...candidate, semanticScore, hybridScore: candidate.lexicalScore * 0.4 + semanticScore * 0.6 };
  }).sort(compare);
}

/** Preserves the caller's existing FTS5 order when local semantic inference is unavailable. */
export function lexicalFallback(candidates: readonly SemanticCandidate[]): readonly RankedSemanticCandidate[] {
  return candidates.map((candidate) => ({ ...candidate, semanticScore: 0, hybridScore: candidate.lexicalScore }));
}

/** A second-stage rerank; it is deliberately bounded to the caller's pool. */
export async function rerankHybrid(
  query: string,
  candidates: readonly RankedSemanticCandidate[],
  reranker: SemanticReranker,
): Promise<readonly RankedSemanticCandidate[]> {
  const result = await reranker.rerank(query, candidates);
  if (result.status === "unavailable" || !result.scores) return candidates;
  return candidates.map((candidate, index) => ({ ...candidate, rerankScore: result.scores?.[index] ?? Number.NEGATIVE_INFINITY }))
    .sort((left, right) => (right.rerankScore! - left.rerankScore!) || left.id.localeCompare(right.id));
}
