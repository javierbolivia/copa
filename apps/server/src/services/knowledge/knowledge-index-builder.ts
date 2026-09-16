import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { youtubeCommentRejection } from "../youtube-evidence-quality.js";

export const INDEXABLE_ARTIFACT_TYPES = [
  "research", "problems", "opportunities", "product", "avatar", "mechanism", "beliefs", "offer",
] as const;
export type IndexableArtifactType = (typeof INDEXABLE_ARTIFACT_TYPES)[number];
export type KnowledgeIndexEntityType = "evidence" | "comment" | "video_transcript" | IndexableArtifactType;

export interface DerivedKnowledgeChunk {
  readonly originKey: string;
  readonly projectId: string;
  readonly entityType: KnowledgeIndexEntityType;
  readonly entityId: string;
  readonly versionId: string | null;
  readonly sourceId: string | null;
  readonly evidenceId: string | null;
  readonly videoId: string | null;
  readonly language: string | null;
  readonly startSeconds: number | null;
  readonly endSeconds: number | null;
  readonly chunkIndex: number;
  readonly text: string;
  readonly textFingerprint: string;
  readonly sourceType: string;
  readonly lifecycle: string;
  readonly sourceUpdatedAt: string;
}

export interface KnowledgeIndexAudit {
  readonly totalChunks: number;
  readonly byEntityType: Readonly<Record<KnowledgeIndexEntityType, number>>;
  readonly byProject: Readonly<Record<string, number>>;
  readonly excluded: Readonly<Record<string, number>>;
  readonly emptyChunks: number;
  readonly duplicateChunks: number;
  readonly nearDuplicatePairs: number;
}

export interface KnowledgeIndexSyncResult { readonly created: number; readonly updated: number; readonly removed: number; readonly reused: number; readonly audit: KnowledgeIndexAudit; }
/** Stable input boundary for SemanticEmbeddingStore; vectors never enter canonical data. */
export interface KnowledgeSemanticCandidate { readonly projectId: string; readonly entityType: KnowledgeIndexEntityType; readonly entityId: string; readonly text: string; readonly sourceUpdatedAt: string; }

type SourceRow = Record<string, unknown>;

const emptyCounts = (): Record<KnowledgeIndexEntityType, number> => ({
  evidence: 0, comment: 0, video_transcript: 0, research: 0, problems: 0, opportunities: 0,
  product: 0, avatar: 0, mechanism: 0, beliefs: 0, offer: 0,
});

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

export function knowledgeIndexFingerprint(text: string): string {
  return createHash("sha256").update(normalizedText(text)).digest("hex");
}

function textAt(value: unknown, path: readonly string[]): string {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return "";
    current = (current as Record<string, unknown>)[key];
  }
  return normalizedText(current);
}

function stringsAt(value: unknown, path: readonly string[]): readonly string[] {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return [];
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current.map(normalizedText).filter(Boolean) : [];
}

function objectArrayAt(value: unknown, path: readonly string[]): readonly Record<string, unknown>[] {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return [];
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function itemText(item: Record<string, unknown>, fields: readonly string[]): string {
  return fields.map((field) => normalizedText(item[field])).filter(Boolean).join("\n");
}

/** Explicit, type-specific projections. This intentionally never serializes an artifact JSON blob. */
export function artifactChunks(type: IndexableArtifactType, output: unknown): readonly { heading: string; text: string }[] {
  if (!output || typeof output !== "object") return [];
  switch (type) {
    case "research": {
      const chunks: { heading: string; text: string }[] = [
        ["Resumen de investigación", textAt(output, ["summary"])],
        ["Subnichos", stringsAt(output, ["subniches"]).join("\n")],
        ["Preguntas", stringsAt(output, ["questions"]).join("\n")],
        ["Sugerencias de búsqueda", stringsAt(output, ["searchSuggestions"]).join("\n")],
      ].filter((entry): entry is [string, string] => entry[1] !== "").map(([heading, text]) => ({ heading, text }));
      for (const item of [...objectArrayAt(output, ["hypotheses"]), ...objectArrayAt(output, ["insights"])]) {
        const text = itemText(item, ["text", "summary", "observation"]);
        if (text) chunks.push({ heading: "Hallazgo de investigación", text });
      }
      return chunks;
    }
    case "problems": return objectArrayAt(output, ["items"]).map((item) => ({ heading: "Problema", text: itemText(item, ["name", "title", "problem", "summary", "description", "rationale"]) })).filter((chunk) => chunk.text !== "");
    case "opportunities": return objectArrayAt(output, ["items"]).map((item) => ({ heading: "Oportunidad", text: itemText(item, ["name", "title", "summary", "rationale", "description"]) + (item.opportunity && typeof item.opportunity === "object" ? "\n" + itemText(item.opportunity as Record<string, unknown>, ["summary", "rationale", "frequencyExplanation", "urgencyExplanation", "willingnessToPayExplanation", "solutionFeasibilityExplanation"]) : "") })).filter((chunk) => normalizedText(chunk.text) !== "");
    case "product": return objectArrayAt(output, ["items"]).concat([output as Record<string, unknown>]).map((item) => ({ heading: "Producto", text: itemText(item, ["name", "title", "summary", "description", "promise", "positioning", "audience", "format", "price"]) })).filter((chunk) => chunk.text !== "");
    case "avatar": return objectArrayAt(output, ["items"]).concat([output as Record<string, unknown>]).map((item) => ({ heading: "Avatar", text: itemText(item, ["name", "title", "summary", "description", "pains", "desires", "objections", "language"]) })).filter((chunk) => chunk.text !== "");
    case "mechanism": return objectArrayAt(output, ["items"]).concat([output as Record<string, unknown>]).map((item) => ({ heading: "Mecanismo", text: itemText(item, ["name", "title", "summary", "description", "mechanism", "whyItWorks", "proof"]) })).filter((chunk) => chunk.text !== "");
    case "beliefs": return objectArrayAt(output, ["items"]).concat([output as Record<string, unknown>]).map((item) => ({ heading: "Creencia", text: itemText(item, ["name", "title", "summary", "description", "belief", "objection", "reframe"]) })).filter((chunk) => chunk.text !== "");
    case "offer": return objectArrayAt(output, ["items"]).concat([output as Record<string, unknown>]).map((item) => ({ heading: "Oferta", text: itemText(item, ["name", "title", "summary", "description", "offer", "promise", "guarantee", "price"]) })).filter((chunk) => chunk.text !== "");
  }
}

export class KnowledgeIndexBuilder {
  readonly #target: DatabaseSync;
  constructor(private readonly source: DatabaseSync, targetPath = ":memory:") {
    this.#target = new DatabaseSync(targetPath);
    this.#target.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        origin_key TEXT PRIMARY KEY, project_id TEXT NOT NULL, entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL, version_id TEXT, source_id TEXT, evidence_id TEXT, video_id TEXT,
        language TEXT, start_seconds REAL, end_seconds REAL,
        chunk_index INTEGER NOT NULL, text TEXT NOT NULL CHECK(length(trim(text))>0),
        text_fingerprint TEXT NOT NULL, source_type TEXT NOT NULL, lifecycle TEXT NOT NULL,
        source_updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS knowledge_chunks_project_idx ON knowledge_chunks(project_id,entity_type);
      CREATE UNIQUE INDEX IF NOT EXISTS knowledge_chunks_fingerprint_unique ON knowledge_chunks(project_id,text_fingerprint);
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(origin_key UNINDEXED, project_id UNINDEXED, text, tokenize='unicode61 remove_diacritics 2');`);
  }
  close(): void { this.#target.close(); }
  search(projectId: string, query: string, limit = 10): readonly DerivedKnowledgeChunk[] {
    return this.#target.prepare(`SELECT chunk.* FROM knowledge_chunks_fts fts JOIN knowledge_chunks chunk ON chunk.origin_key=fts.origin_key
      WHERE knowledge_chunks_fts MATCH ? AND fts.project_id=? ORDER BY bm25(knowledge_chunks_fts) LIMIT ?`).all(query, projectId, limit).map(rowToChunk);
  }
  list(projectId?: string): readonly DerivedKnowledgeChunk[] {
    const rows = projectId ? this.#target.prepare("SELECT * FROM knowledge_chunks WHERE project_id=? ORDER BY origin_key").all(projectId) : this.#target.prepare("SELECT * FROM knowledge_chunks ORDER BY origin_key").all();
    return rows.map(rowToChunk);
  }
  semanticCandidates(projectId?: string): readonly KnowledgeSemanticCandidate[] {
    return this.list(projectId).map((chunk) => ({ projectId: chunk.projectId, entityType: chunk.entityType, entityId: chunk.originKey, text: chunk.text, sourceUpdatedAt: chunk.sourceUpdatedAt }));
  }
  rebuild(): KnowledgeIndexSyncResult { this.#target.exec("DELETE FROM knowledge_chunks_fts; DELETE FROM knowledge_chunks;"); return this.sync(); }
  sync(): KnowledgeIndexSyncResult {
    const excluded: Record<string, number> = {};
    const candidates = this.#readCandidates(excluded);
    const candidateAudit = this.#audit(candidates, excluded);
    const desired = new Map<string, DerivedKnowledgeChunk>();
    const fingerprints = new Set<string>();
    for (const chunk of candidates) {
      if (chunk.text === "") { excluded.empty = (excluded.empty ?? 0) + 1; continue; }
      const scopedFingerprint = `${chunk.projectId}:${chunk.textFingerprint}`;
      if (fingerprints.has(scopedFingerprint)) { excluded.exact_duplicate = (excluded.exact_duplicate ?? 0) + 1; continue; }
      fingerprints.add(scopedFingerprint); desired.set(chunk.originKey, chunk);
    }
    let created = 0; let updated = 0; let reused = 0; let removed = 0;
    const existing = new Map(this.list().map((chunk) => [chunk.originKey, chunk]));
    this.#target.exec("BEGIN IMMEDIATE");
    try {
      for (const [key, chunk] of desired) {
        const old = existing.get(key);
        if (old && old.textFingerprint === chunk.textFingerprint && old.sourceUpdatedAt === chunk.sourceUpdatedAt) { reused++; continue; }
        if (old) { this.#target.prepare("DELETE FROM knowledge_chunks WHERE origin_key=?").run(key); updated++; } else created++;
        this.#target.prepare(`INSERT INTO knowledge_chunks(origin_key,project_id,entity_type,entity_id,version_id,source_id,evidence_id,video_id,language,start_seconds,end_seconds,chunk_index,text,text_fingerprint,source_type,lifecycle,source_updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(chunk.originKey,chunk.projectId,chunk.entityType,chunk.entityId,chunk.versionId,chunk.sourceId,chunk.evidenceId,chunk.videoId,chunk.language,chunk.startSeconds,chunk.endSeconds,chunk.chunkIndex,chunk.text,chunk.textFingerprint,chunk.sourceType,chunk.lifecycle,chunk.sourceUpdatedAt);
      }
      for (const key of existing.keys()) if (!desired.has(key)) { this.#target.prepare("DELETE FROM knowledge_chunks WHERE origin_key=?").run(key); removed++; }
      this.#target.exec(`DELETE FROM knowledge_chunks_fts;
        INSERT INTO knowledge_chunks_fts(origin_key,project_id,text)
        SELECT origin_key,project_id,text FROM knowledge_chunks;
        COMMIT`);
    } catch (error) { this.#target.exec("ROLLBACK"); throw error; }
    const retainedAudit = this.#audit([...desired.values()], excluded);
    return { created, updated, removed, reused, audit: { ...retainedAudit, excluded, emptyChunks: candidateAudit.emptyChunks, duplicateChunks: candidateAudit.duplicateChunks } };
  }
  #readCandidates(excluded: Record<string, number>): readonly DerivedKnowledgeChunk[] {
    const chunks: DerivedKnowledgeChunk[] = [];
    const evidence = this.source.prepare(`SELECT e.id evidence_id,e.project_id,e.source_id,e.comment_id,e.quote_text,e.created_at,c.updated_at,s.source_type
      FROM evidence_snippets e JOIN comments c ON c.id=e.comment_id JOIN sources s ON s.id=e.source_id
      WHERE s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed') ORDER BY e.id`).all() as SourceRow[];
    for (const row of evidence) {
      const rejection = youtubeCommentRejection({ text: String(row.quote_text) });
      if (rejection) { excluded[`quality_${rejection}`] = (excluded[`quality_${rejection}`] ?? 0) + 1; continue; }
      chunks.push(makeChunk("evidence", row, 0, String(row.quote_text), "evidence", String(row.created_at)));
    }
    const comments = this.source.prepare(`SELECT c.id,c.project_id,c.source_id,c.text,c.updated_at,s.source_type FROM comments c JOIN sources s ON s.id=c.source_id
      WHERE s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed') AND NOT EXISTS(SELECT 1 FROM evidence_snippets e WHERE e.comment_id=c.id) ORDER BY c.id`).all() as SourceRow[];
    for (const row of comments) {
      const rejection = youtubeCommentRejection({ text: String(row.text) });
      if (rejection) { excluded[`quality_${rejection}`] = (excluded[`quality_${rejection}`] ?? 0) + 1; continue; }
      chunks.push(makeChunk("comment", row, 0, String(row.text), "eligible_comment", String(row.updated_at)));
    }
    const transcriptSegments = this.source.prepare(`SELECT segment.id segment_id,segment.project_id,segment.source_id,segment.video_id,segment.segment_index,segment.start_seconds,segment.end_seconds,segment.text,transcript.language,transcript.retrieved_at
      FROM video_transcript_segments segment JOIN video_transcripts transcript ON transcript.id=segment.transcript_id AND transcript.project_id=segment.project_id
      JOIN sources s ON s.id=segment.source_id AND s.project_id=segment.project_id
      WHERE transcript.status='ready' AND s.include_in_analysis=1 AND s.status IN ('ready','completed') ORDER BY segment.id`).all() as SourceRow[];
    for (const row of transcriptSegments) {
      chunks.push(makeChunk("video_transcript", row, Number(row.segment_index), String(row.text), "video_transcript", String(row.retrieved_at)));
    }
    const artifactRows = this.source.prepare(`SELECT a.artifact_type,a.project_id,v.id version_id,v.output_data,v.created_at FROM artifacts a JOIN artifact_versions v ON v.id=a.active_version_id
      WHERE v.status='approved' AND v.freshness='fresh' AND a.artifact_type IN (${INDEXABLE_ARTIFACT_TYPES.map(() => "?").join(",")}) ORDER BY a.artifact_type,v.id`).all(...INDEXABLE_ARTIFACT_TYPES) as SourceRow[];
    for (const row of artifactRows) {
      const type = String(row.artifact_type) as IndexableArtifactType;
      let output: unknown;
      try { output = JSON.parse(String(row.output_data)); } catch { excluded.invalid_json = (excluded.invalid_json ?? 0) + 1; continue; }
      const projected = artifactChunks(type, output);
      if (projected.length === 0) excluded.empty_artifact = (excluded.empty_artifact ?? 0) + 1;
      projected.forEach((chunk, index) => chunks.push(makeChunk(type, row, index, `${chunk.heading}\n${chunk.text}`, "approved_fresh", String(row.created_at))));
    }
    return chunks;
  }
  #audit(chunks: readonly DerivedKnowledgeChunk[], excluded: Record<string, number>): KnowledgeIndexAudit {
    const byEntityType = emptyCounts(); const byProject: Record<string, number> = {}; const fingerprints = new Set<string>(); let duplicates = 0; let empty = 0;
    for (const chunk of chunks) { byEntityType[chunk.entityType]++; byProject[chunk.projectId] = (byProject[chunk.projectId] ?? 0) + 1; if (!chunk.text) empty++; const scoped = `${chunk.projectId}:${chunk.textFingerprint}`; if (fingerprints.has(scoped)) duplicates++; fingerprints.add(scoped); }
    // Candidate buckets keep the audit bounded for real comment corpora. Exact duplicates
    // are removed above; this only records high-overlap candidates for later review.
    const buckets = new Map<string, Set<string>[]>(); let near = 0;
    for (const chunk of chunks) {
      const words = new Set(chunk.text.toLowerCase().split(/\W+/).filter((word) => word.length > 4));
      const key = [...words].sort().slice(0, 6).join("|");
      const candidates = buckets.get(key) ?? [];
      for (const other of candidates) { const shared = [...words].filter((word) => other.has(word)).length; const union = new Set([...words, ...other]).size; if (union > 0 && shared / union >= .9) near++; }
      candidates.push(words); buckets.set(key, candidates);
    }
    return { totalChunks: chunks.length - duplicates - empty, byEntityType, byProject, excluded, emptyChunks: empty, duplicateChunks: duplicates, nearDuplicatePairs: near };
  }
}

function makeChunk(type: KnowledgeIndexEntityType, row: SourceRow, chunkIndex: number, rawText: string, lifecycle: string, sourceUpdatedAt: string): DerivedKnowledgeChunk {
  const text = normalizedText(rawText); const entityId = type === "evidence" ? String(row.evidence_id) : type === "comment" ? String(row.id) : type === "video_transcript" ? String(row.segment_id) : String(row.version_id);
  const sourceId = typeof row.source_id === "string" ? row.source_id : null; const evidenceId = type === "evidence" ? String(row.evidence_id) : null;
  return { originKey: `${type}:${entityId}:${chunkIndex}`, projectId: String(row.project_id), entityType: type, entityId, versionId: typeof row.version_id === "string" ? row.version_id : null, sourceId, evidenceId, videoId:type==="video_transcript"?String(row.video_id):null,language:type==="video_transcript"&&typeof row.language==="string"?row.language:null,startSeconds:type==="video_transcript"?Number(row.start_seconds):null,endSeconds:type==="video_transcript"?Number(row.end_seconds):null, chunkIndex, text, textFingerprint: knowledgeIndexFingerprint(text), sourceType: type === "video_transcript" ? "VIDEO_TRANSCRIPT" : typeof row.source_type === "string" ? row.source_type : type === "evidence" || type === "comment" ? "comment" : "artifact", lifecycle, sourceUpdatedAt };
}

function rowToChunk(row: Record<string, unknown>): DerivedKnowledgeChunk { return { originKey:String(row.origin_key),projectId:String(row.project_id),entityType:String(row.entity_type) as KnowledgeIndexEntityType,entityId:String(row.entity_id),versionId:row.version_id as string|null,sourceId:row.source_id as string|null,evidenceId:row.evidence_id as string|null,videoId:row.video_id as string|null,language:row.language as string|null,startSeconds:row.start_seconds===null?null:Number(row.start_seconds),endSeconds:row.end_seconds===null?null:Number(row.end_seconds),chunkIndex:Number(row.chunk_index),text:String(row.text),textFingerprint:String(row.text_fingerprint),sourceType:String(row.source_type),lifecycle:String(row.lifecycle),sourceUpdatedAt:String(row.source_updated_at) }; }
