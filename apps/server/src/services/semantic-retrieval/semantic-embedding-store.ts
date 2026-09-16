import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { load as loadSqliteVec } from "sqlite-vec";

export interface SemanticModelIdentity {
  readonly id: string;
  readonly version: string;
}

export interface SemanticEmbeddingInput {
  readonly projectId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly text: string;
  readonly sourceUpdatedAt: string;
  readonly model: SemanticModelIdentity;
  readonly vector: readonly number[];
}

export interface StoredSemanticEmbedding {
  readonly id: number;
  readonly projectId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly textFingerprint: string;
  readonly model: SemanticModelIdentity;
  readonly dimensions: number;
  readonly createdAt: string;
  readonly sourceUpdatedAt: string;
  readonly state: "active" | "stale";
}

export type EmbeddingSyncResult =
  | { readonly status: "created" | "updated" | "reused"; readonly embedding: StoredSemanticEmbedding }
  | { readonly status: "incompatible_dimension"; readonly expectedDimensions: number; readonly receivedDimensions: number };

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized === "") throw new Error(`${label} is required`);
  return normalized;
}

export function semanticTextFingerprint(text: string): string {
  return createHash("sha256").update(text.normalize("NFKC").trim().replace(/\s+/g, " ")).digest("hex");
}

function rowToEmbedding(row: Record<string, unknown>): StoredSemanticEmbedding {
  return {
    id: Number(row.id), projectId: String(row.project_id), entityType: String(row.entity_type), entityId: String(row.entity_id),
    textFingerprint: String(row.text_fingerprint), model: { id: String(row.model_id), version: String(row.model_version) },
    dimensions: Number(row.embedding_dimension), createdAt: String(row.created_at), sourceUpdatedAt: String(row.source_updated_at),
    state: row.state === "stale" ? "stale" : "active",
  };
}

/**
 * Isolated sqlite-vec-backed store for benchmarks and hardening only. Callers
 * choose the database path; production Hallazia databases are never opened here.
 */
export class SemanticEmbeddingStore {
  readonly #database: DatabaseSync;
  readonly #dimensions: number;

  constructor(path = ":memory:", dimensions = 384) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) throw new Error("dimensions must be a positive integer");
    this.#dimensions = dimensions;
    this.#database = new DatabaseSync(path, { allowExtension: true });
    loadSqliteVec(this.#database);
    this.#database.enableLoadExtension(false);
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS semantic_embedding_projects (
        project_key INTEGER PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE
      ) STRICT;
      CREATE TABLE IF NOT EXISTS semantic_embeddings (
        id INTEGER PRIMARY KEY,
        project_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        text_fingerprint TEXT NOT NULL,
        model_id TEXT NOT NULL,
        model_version TEXT NOT NULL,
        embedding_dimension INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        source_updated_at TEXT NOT NULL,
        vector TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('active','stale')),
        UNIQUE(project_id,entity_type,entity_id,model_id,model_version)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS semantic_embeddings_scope ON semantic_embeddings(project_id,entity_type,entity_id,state);
      CREATE VIRTUAL TABLE IF NOT EXISTS semantic_embedding_vectors USING vec0(
        id INTEGER PRIMARY KEY,
        embedding float[${dimensions}],
        project_key INTEGER PARTITION KEY
      );
    `);
  }

  get dimensions(): number { return this.#dimensions; }

  sync(input: SemanticEmbeddingInput): EmbeddingSyncResult {
    const projectId = required(input.projectId, "projectId");
    const entityType = required(input.entityType, "entityType");
    const entityId = required(input.entityId, "entityId");
    const modelId = required(input.model.id, "model.id");
    const modelVersion = required(input.model.version, "model.version");
    const fingerprint = semanticTextFingerprint(input.text);
    if (input.vector.length !== this.#dimensions) {
      this.#markEntityStale(projectId, entityType, entityId);
      return { status: "incompatible_dimension", expectedDimensions: this.#dimensions, receivedDimensions: input.vector.length };
    }
    if (input.vector.some((value) => !Number.isFinite(value))) throw new Error("vector must contain only finite values");
    const existing = this.#database.prepare(`SELECT * FROM semantic_embeddings
      WHERE project_id=? AND entity_type=? AND entity_id=? AND model_id=? AND model_version=?`).get(
      projectId, entityType, entityId, modelId, modelVersion,
    ) as Record<string, unknown> | undefined;
    if (existing && existing.text_fingerprint === fingerprint && existing.embedding_dimension === this.#dimensions && existing.state === "active") {
      return { status: "reused", embedding: rowToEmbedding(existing) };
    }

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#markEntityStale(projectId, entityType, entityId);
      const now = new Date().toISOString();
      let id: number;
      let status: "created" | "updated" = "created";
      if (existing) {
        id = Number(existing.id);
        status = "updated";
        this.#database.prepare(`UPDATE semantic_embeddings SET text_fingerprint=?,embedding_dimension=?,created_at=?,source_updated_at=?,vector=?,state='active' WHERE id=?`).run(
          fingerprint, this.#dimensions, now, input.sourceUpdatedAt, JSON.stringify(input.vector), id,
        );
      } else {
        const result = this.#database.prepare(`INSERT INTO semantic_embeddings
          (project_id,entity_type,entity_id,text_fingerprint,model_id,model_version,embedding_dimension,created_at,source_updated_at,vector,state)
          VALUES(?,?,?,?,?,?,?,?,?,?,'active')`).run(
          projectId, entityType, entityId, fingerprint, modelId, modelVersion, this.#dimensions, now, input.sourceUpdatedAt, JSON.stringify(input.vector),
        );
        id = Number(result.lastInsertRowid);
      }
      const projectKey = this.#projectKey(projectId);
      this.#database.prepare("INSERT INTO semantic_embedding_vectors(id,embedding,project_key) VALUES(?,?,?)").run(
        BigInt(id), JSON.stringify(input.vector), BigInt(projectKey),
      );
      this.#database.exec("COMMIT");
      const stored = this.#database.prepare("SELECT * FROM semantic_embeddings WHERE id=?").get(id) as Record<string, unknown>;
      return { status, embedding: rowToEmbedding(stored) };
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  remove(projectId: string, entityType: string, entityId: string): boolean {
    const rows = this.#database.prepare("SELECT id FROM semantic_embeddings WHERE project_id=? AND entity_type=? AND entity_id=?").all(
      required(projectId, "projectId"), required(entityType, "entityType"), required(entityId, "entityId"),
    ) as Array<{ id: number }>;
    if (rows.length === 0) return false;
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      rows.forEach((row) => this.#database.prepare("DELETE FROM semantic_embedding_vectors WHERE id=?").run(BigInt(row.id)));
      this.#database.prepare("DELETE FROM semantic_embeddings WHERE project_id=? AND entity_type=? AND entity_id=?").run(projectId, entityType, entityId);
      this.#database.exec("COMMIT");
      return true;
    } catch (error) { this.#database.exec("ROLLBACK"); throw error; }
  }

  search(projectId: string, queryVector: readonly number[], model: SemanticModelIdentity, limit = 20): readonly (StoredSemanticEmbedding & { readonly distance: number })[] {
    if (queryVector.length !== this.#dimensions) return [];
    const projectKey = this.#findProjectKey(required(projectId, "projectId"));
    if (projectKey === undefined) return [];
    const rows = this.#database.prepare(`SELECT embedding.*,vectors.distance FROM semantic_embedding_vectors vectors
      JOIN semantic_embeddings embedding ON embedding.id=vectors.id
      WHERE vectors.embedding MATCH ? AND k=? AND vectors.project_key=?
        AND embedding.project_id=? AND embedding.model_id=? AND embedding.model_version=? AND embedding.state='active'
      ORDER BY vectors.distance ASC`).all(
      JSON.stringify(queryVector), Math.max(1, Math.min(100, Math.floor(limit))), BigInt(projectKey), projectId, model.id, model.version,
    ) as Record<string, unknown>[];
    return rows.map((row) => ({ ...rowToEmbedding(row), distance: Number(row.distance) }));
  }

  list(projectId: string): readonly StoredSemanticEmbedding[] {
    return (this.#database.prepare("SELECT * FROM semantic_embeddings WHERE project_id=? ORDER BY id").all(projectId) as Record<string, unknown>[]).map(rowToEmbedding);
  }

  close(): void { this.#database.close(); }

  #findProjectKey(projectId: string): number | undefined {
    const row = this.#database.prepare("SELECT project_key FROM semantic_embedding_projects WHERE project_id=?").get(projectId) as { project_key: number } | undefined;
    return row?.project_key;
  }

  #projectKey(projectId: string): number {
    this.#database.prepare("INSERT INTO semantic_embedding_projects(project_id) VALUES(?) ON CONFLICT(project_id) DO NOTHING").run(projectId);
    return this.#findProjectKey(projectId)!;
  }

  #markEntityStale(projectId: string, entityType: string, entityId: string): void {
    const rows = this.#database.prepare("SELECT id FROM semantic_embeddings WHERE project_id=? AND entity_type=? AND entity_id=? AND state='active'").all(projectId, entityType, entityId) as Array<{ id: number }>;
    rows.forEach((row) => this.#database.prepare("DELETE FROM semantic_embedding_vectors WHERE id=?").run(BigInt(row.id)));
    this.#database.prepare("UPDATE semantic_embeddings SET state='stale' WHERE project_id=? AND entity_type=? AND entity_id=? AND state='active'").run(projectId, entityType, entityId);
  }
}
