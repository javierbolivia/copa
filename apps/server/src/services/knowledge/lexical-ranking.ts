import type {
  AgentKnowledgePolicy,
  KnowledgeRepositoryHit,
  RankedKnowledgeHit,
  ScoreDirection,
} from "./types.js";

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function normalizeLexicalScores(
  hits: readonly KnowledgeRepositoryHit[],
  direction: ScoreDirection,
): readonly number[] {
  if (hits.length === 0) return [];
  const values = hits.map((hit) => hit.rawScore);
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return values.map(() => 0);
  const minimum = Math.min(...finiteValues);
  const maximum = Math.max(...finiteValues);
  if (minimum === maximum) return values.map((value) => (Number.isFinite(value) ? 1 : 0));

  return values.map((value) => {
    if (!Number.isFinite(value)) return 0;
    const ascending = (value - minimum) / (maximum - minimum);
    return roundScore(direction === "higher_is_better" ? ascending : 1 - ascending);
  });
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function rankLexicalHits(
  hits: readonly KnowledgeRepositoryHit[],
  direction: ScoreDirection,
  policy: AgentKnowledgePolicy,
): readonly RankedKnowledgeHit[] {
  const normalizedScores = normalizeLexicalScores(hits, direction);
  const kindOrder = new Map(policy.allowedKinds.map((kind, index) => [kind, index]));

  return hits
    .map((hit, index): RankedKnowledgeHit => {
      const normalizedLexicalScore = normalizedScores[index] ?? 0;
      const policyWeight = policy.kindWeights[hit.kind];
      return {
        ...hit,
        normalizedLexicalScore,
        policyWeight,
        score: roundScore(normalizedLexicalScore * 0.85 + policyWeight * 0.15),
      };
    })
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (scoreDifference !== 0) return scoreDifference;
      const kindDifference =
        (kindOrder.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
        (kindOrder.get(right.kind) ?? Number.MAX_SAFE_INTEGER);
      if (kindDifference !== 0) return kindDifference;
      const documentDifference = compareText(left.documentId, right.documentId);
      if (documentDifference !== 0) return documentDifference;
      const chunkDifference = left.chunkIndex - right.chunkIndex;
      if (chunkDifference !== 0) return chunkDifference;
      return compareText(left.chunkId, right.chunkId);
    });
}

export function knowledgeContentFingerprint(content: string): string {
  return content.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}
