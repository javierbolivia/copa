import { getAgentKnowledgePolicy } from "./agent-knowledge-policies.js";
import { buildKnowledgeContext } from "./context-builder.js";
import { DisabledEmbeddingProvider } from "./embedding-provider.js";
import type { EmbeddingProvider } from "./embedding-provider.js";
import { isSemanticRetrievalEnabled } from "../semantic-retrieval/config.js";
import type { SemanticEmbeddingProvider, SemanticReranker } from "../semantic-retrieval/types.js";
import { knowledgeContentFingerprint, rankLexicalHits } from "./lexical-ranking.js";
import type {
  AgentKnowledgePolicy,
  KnowledgeKind,
  KnowledgeRepositoryHit,
  KnowledgeRepositoryPort,
  KnowledgeRepositorySearchRequest,
  KnowledgeRetrievalRequest,
  KnowledgeRetrievalResult,
  RankedKnowledgeHit,
} from "./types.js";

function clampRequestedLimit(requested: number | undefined, policyLimit: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return policyLimit;
  return Math.max(0, Math.min(policyLimit, Math.floor(requested)));
}

function requestedKinds(
  requested: readonly KnowledgeKind[] | undefined,
  policy: AgentKnowledgePolicy,
  hasSelectedGlobalLibraries: boolean,
): readonly KnowledgeKind[] {
  const requestedSet = requested === undefined ? undefined : new Set(requested);
  return policy.allowedKinds.filter(
    (kind) =>
      (requestedSet === undefined || requestedSet.has(kind)) &&
      (kind !== "global_knowledge" || hasSelectedGlobalLibraries),
  );
}

function isSafeHit(
  hit: KnowledgeRepositoryHit,
  request: KnowledgeRetrievalRequest,
  kinds: ReadonlySet<KnowledgeKind>,
  selectedLibraries: ReadonlySet<string>,
): boolean {
  if (!kinds.has(hit.kind) || hit.content.trim() === "") return false;
  if (hit.kind === "global_knowledge") {
    if (hit.projectId !== null) return false;
    if (selectedLibraries.size > 0 && (hit.libraryId === undefined || !selectedLibraries.has(hit.libraryId))) {
      return false;
    }
    return true;
  }
  if (hit.projectId !== request.projectId) return false;
  return hit.kind !== "approved_memory" || hit.approvalStatus === "approved";
}

function repositoryRequest(
  request: KnowledgeRetrievalRequest,
  kinds: readonly KnowledgeKind[],
  limit: number,
): KnowledgeRepositorySearchRequest {
  return {
    projectId: request.projectId,
    query: request.query.trim(),
    kinds,
    limit,
    approvedMemoryOnly: true,
    ...(request.libraries === undefined ? {} : { libraryIds: request.libraries }),
    ...(request.categories === undefined ? {} : { categories: request.categories }),
    ...(request.tags === undefined ? {} : { tags: request.tags }),
  };
}

function selectWithCaps(
  ranked: readonly RankedKnowledgeHit[],
  policy: AgentKnowledgePolicy,
  maxChunks: number,
): readonly RankedKnowledgeHit[] {
  const result: RankedKnowledgeHit[] = [];
  const perKind = new Map<KnowledgeKind, number>();
  const fingerprints = new Set<string>();

  for (const hit of ranked) {
    const fingerprint = knowledgeContentFingerprint(hit.content);
    if (fingerprint === "" || fingerprints.has(fingerprint)) continue;
    const currentKindCount = perKind.get(hit.kind) ?? 0;
    if (currentKindCount >= policy.maxPerKind[hit.kind]) continue;
    fingerprints.add(fingerprint);
    perKind.set(hit.kind, currentKindCount + 1);
    result.push(hit);
    if (result.length >= maxChunks) break;
  }
  return result;
}

export type KnowledgeQueryRoute = "EXACT" | "LEXICAL" | "NATURAL_LANGUAGE" | "SEMANTIC";

/** Deterministic routing: preserve FTS priority for identifiers and literals. */
export function classifyKnowledgeQuery(query: string): KnowledgeQueryRoute {
  const trimmed = query.trim();
  if (/^['"].+['"]$/.test(trimmed) || /https?:\/\//i.test(trimmed) ||
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(trimmed) ||
    /\b[A-Z]{1,8}[A-Z0-9_-]{2,}\b/.test(trimmed)) return "EXACT";
  const words = trimmed.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length >= 6 || /[?¿]|\b(qué|como|cómo|why|what|how)\b/i.test(trimmed)) return "NATURAL_LANGUAGE";
  if (words.length >= 3) return "SEMANTIC";
  return "LEXICAL";
}

function cosine(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function hybridRank(
  lexical: readonly RankedKnowledgeHit[],
  vectors: readonly (readonly number[])[],
): readonly RankedKnowledgeHit[] {
  const [query, ...documents] = vectors;
  if (!query || documents.length !== lexical.length) throw new Error("Semantic vectors do not match Knowledge candidates.");
  return lexical.map((hit, index): RankedKnowledgeHit => {
    const semanticScore = cosine(query, documents[index] ?? []);
    return { ...hit, score: hit.score * 0.55 + semanticScore * 0.45,
      retrieval: { mode: "hybrid", lexicalScore: hit.score, semanticScore } };
  }).sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId));
}

export interface KnowledgeHybridOptions {
  readonly enabled?: () => boolean;
  readonly embeddingProvider?: SemanticEmbeddingProvider;
  readonly reranker?: SemanticReranker;
  /** Lets a future persistent index report an unavailable sqlite-vec backend. */
  readonly indexAvailable?: () => boolean;
}

type HybridFallbackReason = "disabled" | "literal_query" | "model_unavailable" | "index_unavailable" | "inference_failed";

export class KnowledgeRetriever {
  readonly #repository: KnowledgeRepositoryPort;
  readonly #embeddingProvider: EmbeddingProvider;
  readonly #hybrid: KnowledgeHybridOptions;

  constructor(
    repository: KnowledgeRepositoryPort,
    embeddingProvider: EmbeddingProvider = new DisabledEmbeddingProvider(),
    hybrid: KnowledgeHybridOptions = {},
  ) {
    this.#repository = repository;
    this.#embeddingProvider = embeddingProvider;
    this.#hybrid = hybrid;
  }

  async retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult> {
    const projectId = request.projectId.trim();
    const query = request.query.trim();
    if (projectId === "") throw new Error("projectId is required");
    if (query === "") throw new Error("query is required");

    const policy = getAgentKnowledgePolicy(request.agentType);
    const maxChunks = clampRequestedLimit(request.maxChunks, policy.maxChunks);
    const maxContextTokens = clampRequestedLimit(
      request.maxContextTokens,
      policy.maxContextTokens,
    );
    const kinds = requestedKinds(request.includeKinds, policy, (request.libraries?.length ?? 0) > 0);
    const fetchLimit = Math.min(100, Math.max(maxChunks * 4, maxChunks));
    const emptyContext = buildKnowledgeContext([], maxContextTokens);

    if (maxChunks === 0 || maxContextTokens === 0 || kinds.length === 0) {
      return {
        projectId,
        query,
        agentType: request.agentType,
        policy,
        retrievalMode: "lexical",
        embeddingProvider: {
          name: this.#embeddingProvider.name,
          available: this.#embeddingProvider.available,
        },
        ...emptyContext,
      };
    }

    const search = await this.#repository.searchLexical(
      repositoryRequest({ ...request, projectId, query }, kinds, fetchLimit),
    );
    const kindSet = new Set(kinds);
    const selectedLibraries = new Set(request.libraries ?? []);
    const safeHits = search.hits.filter((hit) =>
      isSafeHit(hit, { ...request, projectId, query }, kindSet, selectedLibraries),
    );
    const ranked = rankLexicalHits(safeHits, search.scoreDirection, policy);
    const semanticEnabled = this.#hybrid.enabled?.() ?? isSemanticRetrievalEnabled();
    let retrievalMode: "lexical" | "hybrid" = "lexical";
    let fallbackReason: HybridFallbackReason | undefined = semanticEnabled ? undefined : "disabled";
    let hybridRanked = ranked;
    if (semanticEnabled && classifyKnowledgeQuery(query) === "EXACT") {
      fallbackReason = "literal_query";
    } else if (semanticEnabled && this.#hybrid.indexAvailable?.() === false) {
      fallbackReason = "index_unavailable";
    } else if (semanticEnabled && this.#hybrid.embeddingProvider !== undefined) {
      try {
        const embeddings = await this.#hybrid.embeddingProvider.embedBatch([query, ...ranked.map((item) => item.content)]);
        if (embeddings.status === "ready" && embeddings.vectors) {
          hybridRanked = hybridRank(ranked, embeddings.vectors);
          const pool = hybridRanked.slice(0, 20);
          if (this.#hybrid.reranker !== undefined) {
            const reranked = await this.#hybrid.reranker.rerank(query, pool.map((item) => ({ id: item.chunkId, text: item.content })));
            if (reranked.status === "ready" && reranked.scores) {
              const scores = new Map(pool.map((item, index) => [item.chunkId, reranked.scores?.[index] ?? Number.NEGATIVE_INFINITY]));
              hybridRanked = [...pool].map((item): RankedKnowledgeHit => {
                const rerankScore = scores.get(item.chunkId) ?? Number.NEGATIVE_INFINITY;
                return { ...item, retrieval: { ...item.retrieval!, rerankScore } };
              })
                .sort((left, right) => (right.retrieval?.rerankScore ?? 0) - (left.retrieval?.rerankScore ?? 0) || left.chunkId.localeCompare(right.chunkId))
                .concat(hybridRanked.slice(pool.length));
            }
          }
          retrievalMode = "hybrid";
          fallbackReason = undefined;
        } else fallbackReason = "model_unavailable";
      } catch { fallbackReason = "inference_failed"; }
    } else if (semanticEnabled) fallbackReason = "model_unavailable";
    const selected = selectWithCaps(hybridRanked, policy, maxChunks);
    const context = buildKnowledgeContext(selected, maxContextTokens);

    return {
      projectId,
      query,
      agentType: request.agentType,
      policy,
      retrievalMode,
      embeddingProvider: {
        name: this.#embeddingProvider.name,
        available: this.#embeddingProvider.available,
      },
      diagnostics: { candidateCount: ranked.length, semanticCandidateCount: retrievalMode === "hybrid" ? hybridRanked.length : 0, ...(fallbackReason === undefined ? {} : { fallbackReason }) },
      ...context,
    };
  }
}
