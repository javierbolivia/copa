import { getAgentKnowledgePolicy } from "./agent-knowledge-policies.js";
import { buildKnowledgeContext } from "./context-builder.js";
import { DisabledEmbeddingProvider } from "./embedding-provider.js";
import type { EmbeddingProvider } from "./embedding-provider.js";
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

export class KnowledgeRetriever {
  readonly #repository: KnowledgeRepositoryPort;
  readonly #embeddingProvider: EmbeddingProvider;

  constructor(
    repository: KnowledgeRepositoryPort,
    embeddingProvider: EmbeddingProvider = new DisabledEmbeddingProvider(),
  ) {
    this.#repository = repository;
    this.#embeddingProvider = embeddingProvider;
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
    const selected = selectWithCaps(ranked, policy, maxChunks);
    const context = buildKnowledgeContext(selected, maxContextTokens);

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
      ...context,
    };
  }
}
