import { createHash } from "node:crypto";

import type { AppDatabase } from "../database/database.js";

export type VocabularyStatus = "candidate" | "active" | "rejected";

const DIACRITICS = /[̀-ͯ]/gu;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Collapse whitespace and case/accent-fold a value into a stable form. */
function normalizeForHash(value: string): string {
  return value
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(DIACRITICS, "");
}

/**
 * Deterministic, normalized hash of a research focus.
 *
 * Two focus strings that differ only in casing, diacritics or internal
 * whitespace produce the same hash. A NULL/empty focus normalizes to the
 * empty string and therefore to a stable, well-known hash.
 */
export function researchFocusHash(focus: string | null | undefined): string {
  return sha256(normalizeForHash(focus ?? ""));
}

/**
 * Deterministic normalization of a literal alias into a matching key.
 * Aliases are DATA, never regex; this only lower-cases, fold accents and
 * collapses whitespace so matching is reproducible.
 */
export function normalizeAlias(alias: string): string {
  return normalizeForHash(alias);
}

export interface AnalysisSnapshotRow {
  id: string;
  commentId: string;
  sourceId: string;
  quoteText: string;
}

/**
 * Deterministic content hash of the *stable* Analysis Set for a project.
 *
 * Uses the exact membership rules of the Problem Quality Engine analysis set
 * (sources with include_in_analysis=1 and status ready/completed joined to
 * comments with analysis_eligible=1). Only stable identifiers and content are
 * included; volatile fields such as likes and timestamps are deliberately
 * excluded so the hash does not change when unrelated metadata changes.
 *
 * Rows are ordered by evidence id so the result is independent of the order
 * SQLite returns them in. The same Analysis Set always yields the same hash,
 * and any change to the relevant set of evidence/comments changes the hash.
 */
/**
 * Deterministic content hash computed from an ALREADY-MATERIALIZED Analysis Set.
 *
 * This is the canonical building block used by both the standalone
 * `analysisSnapshotHash` (which materializes the rows itself) and by the
 * Problems runtime, which materializes the Analysis Set ONCE and then reuses
 * the exact same rows for the hash, the vocabulary lookup and the Quality
 * Engine. Rows are sorted canonically so the same set yields the same hash
 * regardless of physical order.
 */
export function analysisSnapshotHashFromRows(rows: readonly AnalysisSnapshotRow[]): string {
  const canonical = [...rows]
    .map((row) => `${row.id}|${row.commentId}|${row.sourceId}|${row.quoteText.trim()}`)
    .sort()
    .join("\n");
  return sha256(canonical);
}

export function analysisSnapshotHash(database: AppDatabase, projectId: string): string {
  const rows = database.connection
    .prepare(
      `SELECT e.id id, e.comment_id commentId, e.source_id sourceId, e.quote_text quoteText
       FROM evidence_snippets e
       JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id
       JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id
       WHERE e.project_id=? AND s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed')
       ORDER BY e.id ASC`,
    )
    .all(projectId) as unknown as AnalysisSnapshotRow[];
  return analysisSnapshotHashFromRows(rows);
}

export interface AliasInput {
  alias: string;
  language?: string | null;
  isExclusion?: boolean;
}

export interface ConceptInput {
  conceptKey: string;
  label: string;
  definition?: string | null;
  cohesionWeight?: number;
  aliases?: AliasInput[];
}

/**
 * Deterministic hash of the *content* of a vocabulary version (concepts and
 * their aliases). Used to freeze and later verify an immutable version: the
 * same concepts/aliases always produce the same content_hash.
 */
export function canonicalContentHash(concepts: readonly ConceptInput[]): string {
  const normalized = [...concepts]
    .map((concept) => ({
      conceptKey: concept.conceptKey,
      label: concept.label,
      definition: concept.definition ?? null,
      cohesionWeight: concept.cohesionWeight ?? 1,
      aliases: [...(concept.aliases ?? [])]
        .map((alias) => ({
          alias: alias.alias,
          normalizedAlias: normalizeAlias(alias.alias),
          language: alias.language ?? null,
          isExclusion: alias.isExclusion ?? false,
        }))
        .sort((a, b) => a.normalizedAlias.localeCompare(b.normalizedAlias)),
    }))
    .sort((a, b) => a.conceptKey.localeCompare(b.conceptKey));
  return sha256(JSON.stringify(normalized));
}

/**
 * Runtime, immutable, provider-agnostic view of a single domain concept.
 *
 * Built once from an ACTIVE vocabulary version (see
 * SemanticVocabularyRepository.loadActiveVocabularySnapshot) and then passed
 * straight into the Problem Quality Engine. The engine never sees mutable DB
 * rows. Aliases and exclusions are already normalized (deterministic,
 * accent/case/whitespace folded) so matching requires no DB access.
 */
export interface SemanticConceptSnapshot {
  conceptKey: string;
  label: string;
  cohesionWeight: number;
  aliases: string[];
  exclusions: string[];
}

/**
 * Immutable runtime snapshot of an ACTIVE domain semantic vocabulary version.
 *
 * This is the ONLY vocabulary shape the Problem Quality Engine consumes. It is
 * deliberately free of any database identity beyond the version id and content
 * hash, so the engine stays deterministic and provider-agnostic.
 */
export interface SemanticVocabularySnapshot {
  vocabularyVersionId: string;
  contentHash: string;
  concepts: SemanticConceptSnapshot[];
}

/**
 * Minimal provenance record produced by the deterministic alias matcher.
 *
 * One entry per domain concept that either matched or was blocked by an
 * exclusion. `matchedAlias` is the normalized alias that triggered the match
 * (null when blocked); `blockedByExclusion` carries the exclusion alias that
 * suppressed the match. PHASE 3 can extend this with full audit rows without
 * reworking the matching algorithm.
 */
export interface SemanticConceptMatch {
  conceptKey: string;
  matchedAlias: string | null;
  vocabularyVersionId: string;
  blockedByExclusion?: string | null;
}
