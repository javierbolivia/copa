import { afterEach, describe, expect, it } from "vitest";

import { SemanticEmbeddingStore, semanticTextFingerprint } from "../src/services/semantic-retrieval/semantic-embedding-store.js";
import type { SemanticModelIdentity } from "../src/services/semantic-retrieval/semantic-embedding-store.js";

const stores: SemanticEmbeddingStore[] = [];
afterEach(() => { stores.splice(0).forEach((store) => store.close()); });

const modelV1 = { id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2", version: "q8-v1" } as const;
const modelV2 = { ...modelV1, version: "q8-v2" } as const;
function store(): SemanticEmbeddingStore { const value = new SemanticEmbeddingStore(":memory:", 2); stores.push(value); return value; }
function input(overrides: Partial<{ projectId: string; entityType: string; entityId: string; text: string; sourceUpdatedAt: string; model: SemanticModelIdentity; vector: readonly number[] }> = {}) {
  return { projectId: "project-a", entityType: "comment", entityId: "same-id", text: "Los perros necesitan paseos diarios", sourceUpdatedAt: "2026-09-16T00:00:00.000Z", model: modelV1, vector: [1, 0], ...overrides };
}

describe("temporary semantic embedding store", () => {
  it("creates once and reuses an unchanged fingerprint idempotently", () => {
    const repository = store();
    const first = repository.sync(input());
    const second = repository.sync(input());
    expect(first.status).toBe("created");
    expect(second.status).toBe("reused");
    expect(repository.list("project-a")).toHaveLength(1);
    expect(semanticTextFingerprint("x\n y")).toBe(semanticTextFingerprint("x y"));
  });

  it("updates only changed text and makes the prior vector unavailable", () => {
    const repository = store();
    repository.sync(input());
    expect(repository.sync(input({ text: "Los perros requieren salidas diarias", vector: [0.9, 0.1], sourceUpdatedAt: "2026-09-17T00:00:00.000Z" })).status).toBe("updated");
    expect(repository.search("project-a", [1, 0], modelV1)).toHaveLength(1);
    expect(repository.list("project-a")[0]).toMatchObject({ state: "active", sourceUpdatedAt: "2026-09-17T00:00:00.000Z" });
  });

  it("partitions KNN by project even when IDs and text are identical", () => {
    const repository = store();
    repository.sync(input({ projectId: "dogs", entityId: "same", text: "Los perros necesitan paseos", vector: [1, 0] }));
    repository.sync(input({ projectId: "plants", entityId: "same", text: "Los perros necesitan paseos", vector: [1, 0] }));
    expect(repository.search("plants", [1, 0], modelV1).map((row) => row.projectId)).toEqual(["plants"]);
    expect(repository.search("dogs", [1, 0], modelV1).map((row) => row.projectId)).toEqual(["dogs"]);
  });

  it("marks old models stale and never retrieves them after a model change", () => {
    const repository = store();
    repository.sync(input());
    expect(repository.sync(input({ model: modelV2 })).status).toBe("created");
    expect(repository.search("project-a", [1, 0], modelV1)).toEqual([]);
    expect(repository.search("project-a", [1, 0], modelV2)).toHaveLength(1);
    expect(repository.list("project-a").filter((row) => row.state === "stale")).toHaveLength(1);
  });

  it("marks active vectors stale on dimension mismatch and supports idempotent deletion", () => {
    const repository = store();
    repository.sync(input());
    expect(repository.sync(input({ vector: [1, 0, 0] }))).toMatchObject({ status: "incompatible_dimension", expectedDimensions: 2, receivedDimensions: 3 });
    expect(repository.search("project-a", [1, 0], modelV1)).toEqual([]);
    expect(repository.remove("project-a", "comment", "same-id")).toBe(true);
    expect(repository.remove("project-a", "comment", "same-id")).toBe(false);
  });
});
