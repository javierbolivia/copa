import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database/database.js";
import {
  type ConceptInput,
  type VocabularyStatus,
  canonicalContentHash,
  normalizeAlias,
} from "../services/semantic-vocabulary.js";

export interface SemanticVocabularyVersion {
  id: string;
  projectId: string;
  researchFocus: string | null;
  researchFocusHash: string;
  analysisSnapshotHash: string;
  version: number;
  contentHash: string;
  status: VocabularyStatus;
  sourceGenerationId: string | null;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  createdAt: string;
}

export interface SemanticConcept {
  id: string;
  vocabularyVersionId: string;
  conceptKey: string;
  label: string;
  definition: string | null;
  cohesionWeight: number;
  createdAt: string;
}

export interface SemanticConceptAlias {
  id: string;
  conceptId: string;
  alias: string;
  normalizedAlias: string;
  language: string | null;
  isExclusion: boolean;
  createdAt: string;
}

export interface CreateVocabularyVersionInput {
  projectId: string;
  researchFocus: string | null;
  researchFocusHash: string;
  analysisSnapshotHash: string;
  contentHash: string;
  status?: VocabularyStatus;
  sourceGenerationId?: string | null;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  concepts?: ConceptInput[];
}

/**
 * Minimal persistence layer for the versioned Domain Semantic Vocabulary (PHASE 1).
 *
 * This is BEHAVIOR-PRESERVING infrastructure: it does not touch the Problem
 * Quality Engine, does not introduce embeddings, regex matchers or LLM logic.
 * Active versions are immutable; the database enforces this via triggers
 * (semantic_*_immutable_*), and any write that would mutate an active version
 * raises `semantic_vocabulary_version_active_immutable`.
 */
export class SemanticVocabularyRepository {
  constructor(private readonly database: AppDatabase) {}

  createVocabularyVersion(input: CreateVocabularyVersionInput): SemanticVocabularyVersion {
    const db = this.database.connection;
    const now = new Date().toISOString();
    const status: VocabularyStatus = input.status ?? "candidate";
    const version = (
      db
        .prepare(
          `SELECT COALESCE(MAX(version),0)+1 version
           FROM semantic_vocabulary_versions
           WHERE project_id=? AND research_focus_hash=? AND analysis_snapshot_hash=?`,
        )
        .get(input.projectId, input.researchFocusHash, input.analysisSnapshotHash) as { version: number }
    ).version;
    const id = uuidv7();
    db.prepare(
      `INSERT INTO semantic_vocabulary_versions
        (id, project_id, research_focus, research_focus_hash, analysis_snapshot_hash, version, content_hash, status, source_generation_id, provider, model, prompt_version, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.projectId,
      input.researchFocus ?? null,
      input.researchFocusHash,
      input.analysisSnapshotHash,
      version,
      input.contentHash,
      status,
      input.sourceGenerationId ?? null,
      input.provider ?? null,
      input.model ?? null,
      input.promptVersion ?? null,
      now,
    );
    for (const concept of input.concepts ?? []) {
      this.addConcept({ vocabularyVersionId: id, concept });
    }
    return this.getVocabularyVersion(id)!;
  }

  addConcept(input: { vocabularyVersionId: string; concept: ConceptInput }): SemanticConcept {
    const db = this.database.connection;
    const now = new Date().toISOString();
    const id = uuidv7();
    db.prepare(
      `INSERT INTO semantic_concepts
        (id, vocabulary_version_id, concept_key, label, definition, cohesion_weight, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.vocabularyVersionId,
      input.concept.conceptKey,
      input.concept.label,
      input.concept.definition ?? null,
      input.concept.cohesionWeight ?? 1,
      now,
    );
    for (const alias of input.concept.aliases ?? []) {
      this.addAlias({
        conceptId: id,
        alias: alias.alias,
        language: alias.language ?? null,
        isExclusion: alias.isExclusion ?? false,
      });
    }
    return this.getConcept(id)!;
  }

  addAlias(input: {
    conceptId: string;
    alias: string;
    language?: string | null;
    isExclusion?: boolean;
  }): SemanticConceptAlias {
    const db = this.database.connection;
    const now = new Date().toISOString();
    const id = uuidv7();
    const normalized = normalizeAlias(input.alias);
    db.prepare(
      `INSERT INTO semantic_concept_aliases
        (id, concept_id, alias, normalized_alias, language, is_exclusion, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.conceptId,
      input.alias,
      normalized,
      input.language ?? null,
      input.isExclusion ? 1 : 0,
      now,
    );
    return this.getAlias(id)!;
  }

  getVocabularyVersion(id: string): SemanticVocabularyVersion | undefined {
    const row = this.database.connection
      .prepare(`SELECT * FROM semantic_vocabulary_versions WHERE id=?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapVersion(row) : undefined;
  }

  getActiveVocabulary(
    projectId: string,
    researchFocusHash: string,
    analysisSnapshotHash: string,
  ): SemanticVocabularyVersion | undefined {
    const row = this.database.connection
      .prepare(
        `SELECT * FROM semantic_vocabulary_versions
         WHERE project_id=? AND research_focus_hash=? AND analysis_snapshot_hash=? AND status='active'
         ORDER BY version DESC, created_at DESC LIMIT 1`,
      )
      .get(projectId, researchFocusHash, analysisSnapshotHash) as Record<string, unknown> | undefined;
    return row ? this.mapVersion(row) : undefined;
  }

  listConceptsWithAliases(
    vocabularyVersionId: string,
  ): Array<{ concept: SemanticConcept; aliases: SemanticConceptAlias[] }> {
    const concepts = (
      this.database.connection
        .prepare(`SELECT * FROM semantic_concepts WHERE vocabulary_version_id=? ORDER BY concept_key ASC`)
        .all(vocabularyVersionId) as Array<Record<string, unknown>>
    ).map((row) => this.mapConcept(row));
    const aliases = (
      this.database.connection
        .prepare(
          `SELECT a.* FROM semantic_concept_aliases a
           JOIN semantic_concepts c ON c.id=a.concept_id
           WHERE c.vocabulary_version_id=? ORDER BY a.normalized_alias ASC`,
        )
        .all(vocabularyVersionId) as Array<Record<string, unknown>>
    ).map((row) => this.mapAlias(row));
    const byConcept = new Map<string, SemanticConceptAlias[]>();
    for (const alias of aliases) {
      const list = byConcept.get(alias.conceptId) ?? [];
      list.push(alias);
      byConcept.set(alias.conceptId, list);
    }
    return concepts.map((concept) => ({ concept, aliases: byConcept.get(concept.id) ?? [] }));
  }

  /**
   * Freeze a vocabulary version as ACTIVE.
   *
   * The canonical content_hash is RECOMPUTED from the real content persisted in
   * the database (concepts + aliases + exclusions + cohesion weights) inside a
   * transaction, immediately before flipping the status to 'active'. This
   * guarantees the hash can never be stale (e.g. when concepts/aliases were
   * appended via addConcept after creation) and that two equivalent vocabularies
   * produce the same hash regardless of insertion order.
   *
   * Once ACTIVE, the database triggers prevent any further mutation or deletion
   * of the version or its concepts/aliases. Activating an already-active version
   * is a no-op that returns the version unchanged.
   */
  activateVocabularyVersion(id: string): SemanticVocabularyVersion | undefined {
    const current = this.getVocabularyVersion(id);
    if (!current) return undefined;
    if (current.status === "active") return current;
    const db = this.database.connection;
    const ownsTransaction = !db.isTransaction;
    if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
    try {
      const concepts = this.listConceptsWithAliases(id).map(({ concept, aliases }) => ({
        conceptKey: concept.conceptKey,
        label: concept.label,
        definition: concept.definition,
        cohesionWeight: concept.cohesionWeight,
        aliases: aliases.map((alias) => ({
          alias: alias.alias,
          language: alias.language,
          isExclusion: alias.isExclusion,
        })),
      }));
      const contentHash = canonicalContentHash(concepts);
      db.prepare(
        `UPDATE semantic_vocabulary_versions SET content_hash=?, status='active' WHERE id=?`,
      ).run(contentHash, id);
      if (ownsTransaction) db.exec("COMMIT");
      return this.getVocabularyVersion(id);
    } catch (error) {
      if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  private getConcept(id: string): SemanticConcept | undefined {
    const row = this.database.connection
      .prepare(`SELECT * FROM semantic_concepts WHERE id=?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapConcept(row) : undefined;
  }

  private getAlias(id: string): SemanticConceptAlias | undefined {
    const row = this.database.connection
      .prepare(`SELECT * FROM semantic_concept_aliases WHERE id=?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapAlias(row) : undefined;
  }

  private mapVersion(row: Record<string, unknown>): SemanticVocabularyVersion {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      researchFocus: (row.research_focus as string | null) ?? null,
      researchFocusHash: row.research_focus_hash as string,
      analysisSnapshotHash: row.analysis_snapshot_hash as string,
      version: row.version as number,
      contentHash: row.content_hash as string,
      status: row.status as VocabularyStatus,
      sourceGenerationId: (row.source_generation_id as string | null) ?? null,
      provider: (row.provider as string | null) ?? null,
      model: (row.model as string | null) ?? null,
      promptVersion: (row.prompt_version as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  }

  private mapConcept(row: Record<string, unknown>): SemanticConcept {
    return {
      id: row.id as string,
      vocabularyVersionId: row.vocabulary_version_id as string,
      conceptKey: row.concept_key as string,
      label: row.label as string,
      definition: (row.definition as string | null) ?? null,
      cohesionWeight: row.cohesion_weight as number,
      createdAt: row.created_at as string,
    };
  }

  private mapAlias(row: Record<string, unknown>): SemanticConceptAlias {
    return {
      id: row.id as string,
      conceptId: row.concept_id as string,
      alias: row.alias as string,
      normalizedAlias: row.normalized_alias as string,
      language: (row.language as string | null) ?? null,
      isExclusion: row.is_exclusion === 1,
      createdAt: row.created_at as string,
    };
  }
}
