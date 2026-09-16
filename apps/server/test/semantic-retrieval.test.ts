import { describe, expect, it } from "vitest";

import { isSemanticRetrievalEnabled } from "../src/services/semantic-retrieval/config.js";
import { hybridRank, rerankHybrid } from "../src/services/semantic-retrieval/hybrid-ranking.js";
import { BoundedEmbeddingCache } from "../src/services/semantic-retrieval/embedding-cache.js";
import type { SemanticEmbeddingProvider, SemanticReranker } from "../src/services/semantic-retrieval/types.js";

const vectors: Record<string, readonly number[]> = {
  "organizar fotos": [1, 0],
  "clasificador automático de imágenes por fecha": [0.98, 0.02],
  "receta de sopa vegetariana": [0, 1],
  "spam spam spam fotos": [0.1, 0.1],
};

class FixtureEmbeddingProvider implements SemanticEmbeddingProvider {
  readonly name = "fixture";
  readonly available = true;
  calls = 0;
  async embed(input: string) {
    const result = await this.embedBatch([input]);
    return { status: "ready" as const, provider: this.name, dimensions: 2, vector: result.vectors?.[0] ?? [] };
  }
  async embedBatch(inputs: readonly string[]) {
    this.calls += 1;
    if (inputs.some((input) => vectors[input] === undefined)) return { status: "unavailable" as const, provider: this.name, reason: "fixture unavailable" };
    return { status: "ready" as const, provider: this.name, dimensions: 2, vectors: inputs.map((input) => vectors[input]!) };
  }
}

class FixtureReranker implements SemanticReranker {
  readonly name = "fixture-reranker";
  readonly available = true;
  received = 0;
  async rerank(_query: string, candidates: readonly { id: string; text: string }[]) {
    this.received = candidates.length;
    return { status: "ready" as const, provider: this.name, scores: candidates.map((candidate) => candidate.id === "relevant" ? 10 : 0) };
  }
}

const candidates = [
  { id: "relevant", projectId: "project-a", text: "clasificador automático de imágenes por fecha", lexicalScore: 0.3 },
  { id: "spam", projectId: "project-a", text: "spam spam spam fotos", lexicalScore: 0.9 },
  { id: "other-project", projectId: "project-b", text: "receta de sopa vegetariana", lexicalScore: 1 },
] as const;

describe("semantic retrieval prototype", () => {
  it("is disabled unless explicitly enabled", () => {
    expect(isSemanticRetrievalEnabled({})).toBe(false);
    expect(isSemanticRetrievalEnabled({ SEMANTIC_ENABLED: "false" })).toBe(false);
    expect(isSemanticRetrievalEnabled({ SEMANTIC_ENABLED: "true" })).toBe(true);
  });

  it("embeds deterministically in a batch and excludes other projects before scoring", async () => {
    const provider = new FixtureEmbeddingProvider();
    const first = await hybridRank("project-a", "organizar fotos", candidates, provider);
    const second = await hybridRank("project-a", "organizar fotos", candidates, provider);
    expect(first.map((candidate) => candidate.id)).toEqual(["relevant", "spam"]);
    expect(second).toEqual(first);
    expect(provider.calls).toBe(2);
  });

  it("preserves the supplied FTS order when the provider is unavailable", async () => {
    const unavailable: SemanticEmbeddingProvider = {
      name: "offline", available: false,
      async embed() { return { status: "unavailable", provider: "offline", reason: "model missing" }; },
      async embedBatch() { return { status: "unavailable", provider: "offline", reason: "model missing" }; },
    };
    expect((await hybridRank("project-a", "organizar fotos", candidates, unavailable)).map((candidate) => candidate.id)).toEqual(["relevant", "spam"]);
  });

  it("keeps duplicate embeddings once and evicts the oldest cached value at its bound", () => {
    const cache = new BoundedEmbeddingCache(2);
    cache.set("same", [1, 0]);
    cache.set("same", [1, 0]);
    cache.set("next", [0, 1]);
    expect(cache.size).toBe(2);
    cache.set("third", [0.5, 0.5]);
    expect(cache.get("same")).toBeUndefined();
    expect(cache.get("third")).toEqual([0.5, 0.5]);
  });

  it("handles an empty candidate pool without invoking a corpus-wide rerank", async () => {
    const provider = new FixtureEmbeddingProvider();
    expect(await hybridRank("project-a", "organizar fotos", [], provider)).toEqual([]);
  });

  it("reranks only the bounded hybrid pool and preserves its order on reranker failure", async () => {
    const provider = new FixtureEmbeddingProvider();
    const hybrid = await hybridRank("project-a", "organizar fotos", candidates, provider);
    const reranker = new FixtureReranker();
    expect((await rerankHybrid("organizar fotos", hybrid, reranker)).map((candidate) => candidate.id)).toEqual(["relevant", "spam"]);
    expect(reranker.received).toBe(2);
    const unavailable: SemanticReranker = { name: "offline", available: false, async rerank() { return { status: "unavailable", provider: "offline", reason: "model missing" }; } };
    expect(await rerankHybrid("organizar fotos", hybrid, unavailable)).toEqual(hybrid);
  });
});
