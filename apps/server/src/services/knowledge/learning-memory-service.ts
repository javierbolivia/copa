import { createHash } from "node:crypto";

import type {
  LearnedMemory,
  LearnedMemoryKind,
  LearnedMemoryScope,
  MemoryProvenanceSummary,
} from "@our-platform/shared";

import type { AppDatabase } from "../../database/database.js";

export type LearnedMemorySourceClass =
  | "VALIDATED_STRUCTURED"
  | "RAW_COMMENT"
  | "RAW_VIDEO"
  | "GENERATION"
  | "PRODUCT_COPY"
  | "MOCK"
  | "DEMO";

export type LearnedMemoryScopePolicy =
  | "PROJECT_ONLY"
  | "PROJECT_AND_DOMAIN"
  | "PROJECT_DOMAIN_GLOBAL";

export interface LearnedMemoryCandidate {
  readonly kind: LearnedMemoryKind;
  readonly scope: LearnedMemoryScope;
  /** Origin project; for PROJECT scope it is also the owner. */
  readonly projectId: string;
  readonly domain?: string | null;
  readonly semanticIdentity: string;
  readonly statement: string;
  readonly value?: unknown;
  readonly observationKey: string;
  readonly disposition: "APPROVED" | "REJECTED";
  readonly reusable: boolean;
  readonly validated: boolean;
  readonly strength: "ELIGIBLE" | "WEAK";
  readonly sourceClass: LearnedMemorySourceClass;
  readonly supportCount?: number;
  readonly sourceCount?: number;
  readonly authorCount?: number;
  readonly projectCount?: number;
  readonly confidence?: number;
  readonly provenanceSummary: MemoryProvenanceSummary;
}

export interface RelevantKnowledgeRequest {
  readonly context: {
    readonly projectId: string;
    readonly domain?: string | null;
    readonly query: string;
  };
  readonly kinds: readonly LearnedMemoryKind[];
  readonly scope: LearnedMemoryScopePolicy;
  readonly limit: number;
}

export interface RelevantLearnedMemory extends LearnedMemory {
  readonly rawScore: number;
}

export interface LearnedMemoryObservationAudit {
  readonly observationKey: string;
  readonly statement: string;
  readonly contradiction: boolean;
  readonly provenanceSummary: MemoryProvenanceSummary;
  readonly createdAt: string;
}

export type MemoryReinforcementResult =
  | { readonly outcome: "CREATED" | "REINFORCED" | "CONTRADICTED" | "UNCHANGED"; readonly memory: LearnedMemory }
  | { readonly outcome: "REJECTED"; readonly reason: string };

interface MemoryRow {
  id: string;
  kind: LearnedMemoryKind;
  scope: LearnedMemoryScope;
  project_id: string | null;
  domain_key: string | null;
  canonical_key: string;
  semantic_identity: string;
  statement_text: string;
  value_json: string;
  status: LearnedMemory["status"];
  support_count: number | null;
  source_count: number | null;
  author_count: number | null;
  project_count: number | null;
  confidence: number | null;
  first_seen_at: string;
  last_reinforced_at: string;
  reinforcement_count: number;
  contradiction_count: number;
  provenance_summary_json: string;
}

const MAX_RETRIEVAL_LIMIT = 20;
const MIN_GLOBAL_RESEARCH_PROJECTS = 2;

export class LearningMemoryService {
  constructor(private readonly database: AppDatabase) {}

  reinforce(candidate: LearnedMemoryCandidate): MemoryReinforcementResult {
    const rejection = rejectionReason(candidate);
    if (rejection !== null) return { outcome: "REJECTED", reason: rejection };

    const domain = candidate.scope === "DOMAIN" ? normalizeMemoryText(candidate.domain ?? "") : null;
    const semanticIdentity = normalizeMemoryText(candidate.semanticIdentity);
    const statement = candidate.statement.normalize("NFKC").replace(/\s+/g, " ").trim();
    const scopeIdentity = candidate.scope === "PROJECT"
      ? candidate.projectId
      : candidate.scope === "DOMAIN"
        ? domain!
        : "cross-domain";
    const canonicalKey = [candidate.kind, candidate.scope, scopeIdentity, semanticIdentity].join(":");
    const memoryId = sha256(canonicalKey);
    const observationId = sha256(`${memoryId}:${candidate.observationKey.trim()}`);
    const now = new Date().toISOString();
    const db = this.database.connection;
    const ownsTransaction = !db.isTransaction;
    if (ownsTransaction) db.exec("BEGIN IMMEDIATE");

    try {
      const existing = this.getByCanonicalKey(canonicalKey);
      if (existing === undefined) {
        db.prepare(`INSERT INTO learned_memories(
          id,kind,scope,project_id,domain_key,canonical_key,semantic_identity,statement_text,
          value_json,status,support_count,source_count,author_count,project_count,confidence,
          first_seen_at,last_reinforced_at,reinforcement_count,contradiction_count,provenance_summary_json
        ) VALUES(?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,?,1,0,?)`).run(
          memoryId,
          candidate.kind,
          candidate.scope,
          candidate.scope === "PROJECT" ? candidate.projectId : null,
          domain,
          canonicalKey,
          semanticIdentity,
          statement,
          JSON.stringify(candidate.value ?? null),
          nullableMetric(candidate.supportCount),
          nullableMetric(candidate.sourceCount),
          nullableMetric(candidate.authorCount),
          nullableMetric(candidate.projectCount),
          nullableConfidence(candidate.confidence),
          now,
          now,
          JSON.stringify(normalizeProvenance(candidate.provenanceSummary)),
        );
        this.insertObservation(observationId, memoryId, candidate, statement, false, now);
        if (ownsTransaction) db.exec("COMMIT");
        return { outcome: "CREATED", memory: this.getRequired(memoryId) };
      }

      const duplicate = db.prepare(
        "SELECT 1 FROM learned_memory_observations WHERE memory_id=? AND observation_key=?",
      ).get(existing.id, candidate.observationKey.trim());
      if (duplicate !== undefined) {
        if (ownsTransaction) db.exec("COMMIT");
        return { outcome: "UNCHANGED", memory: existing };
      }

      const contradiction = normalizeMemoryText(existing.statement) !== normalizeMemoryText(statement);
      this.insertObservation(observationId, existing.id, candidate, statement, contradiction, now);
      if (contradiction) {
        db.prepare(`UPDATE learned_memories SET status='CONTRADICTED',
          contradiction_count=contradiction_count+1,last_reinforced_at=? WHERE id=?`).run(now, existing.id);
      } else {
        db.prepare(`UPDATE learned_memories SET
          support_count=CASE WHEN ? IS NULL THEN support_count WHEN support_count IS NULL OR support_count<? THEN ? ELSE support_count END,
          source_count=CASE WHEN ? IS NULL THEN source_count WHEN source_count IS NULL OR source_count<? THEN ? ELSE source_count END,
          author_count=CASE WHEN ? IS NULL THEN author_count WHEN author_count IS NULL OR author_count<? THEN ? ELSE author_count END,
          project_count=CASE WHEN ? IS NULL THEN project_count WHEN project_count IS NULL OR project_count<? THEN ? ELSE project_count END,
          confidence=CASE WHEN ? IS NULL THEN confidence WHEN confidence IS NULL OR confidence<? THEN ? ELSE confidence END,
          last_reinforced_at=?,reinforcement_count=reinforcement_count+1
          WHERE id=?`).run(
            ...repeatMetric(candidate.supportCount),
            ...repeatMetric(candidate.sourceCount),
            ...repeatMetric(candidate.authorCount),
            ...repeatMetric(candidate.projectCount),
            ...repeatConfidence(candidate.confidence),
            now,
            existing.id,
          );
      }
      if (ownsTransaction) db.exec("COMMIT");
      return {
        outcome: contradiction ? "CONTRADICTED" : "REINFORCED",
        memory: this.getRequired(existing.id),
      };
    } catch (error) {
      if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  getRelevantKnowledge(request: RelevantKnowledgeRequest): RelevantLearnedMemory[] {
    const query = safeFtsQuery(request.context.query);
    const kinds = [...new Set(request.kinds)];
    const limit = Number.isFinite(request.limit)
      ? Math.max(0, Math.min(MAX_RETRIEVAL_LIMIT, Math.floor(request.limit)))
      : 0;
    if (query === null || kinds.length === 0 || limit === 0) return [];

    const scopeClauses = ["(memory.scope='PROJECT' AND memory.project_id=?)"];
    const parameters: Array<string | number> = [query, ...kinds, request.context.projectId];
    const domain = normalizeMemoryText(request.context.domain ?? "");
    if (request.scope !== "PROJECT_ONLY" && domain !== "") {
      scopeClauses.push("(memory.scope='DOMAIN' AND memory.domain_key=?)");
      parameters.push(domain);
    }
    if (request.scope === "PROJECT_DOMAIN_GLOBAL") {
      scopeClauses.push("(memory.scope='GLOBAL' AND memory.kind='RESEARCH_INTELLIGENCE')");
    }
    parameters.push(limit);

    const rows = this.database.connection.prepare(`WITH matches AS MATERIALIZED (
      SELECT rowid,bm25(learned_memories_fts,1.0,1.5,2.0,4.0) raw_score
      FROM learned_memories_fts WHERE learned_memories_fts MATCH ?
    ) SELECT memory.*,matches.raw_score
      FROM matches JOIN learned_memories memory ON memory.rowid=matches.rowid
      WHERE memory.kind IN (${placeholders(kinds.length)})
        AND memory.status IN ('ACTIVE','WEAKENED')
        AND (${scopeClauses.join(" OR ")})
      ORDER BY matches.raw_score ASC,
        CASE memory.scope WHEN 'PROJECT' THEN 0 WHEN 'DOMAIN' THEN 1 ELSE 2 END,
        memory.last_reinforced_at DESC,memory.id ASC
      LIMIT ?`).all(...parameters) as unknown as Array<MemoryRow & { raw_score: number }>;
    return rows.map((row) => ({ ...mapMemory(row), rawScore: row.raw_score }));
  }

  list(input: {
    readonly projectId?: string;
    readonly domain?: string;
    readonly kinds?: readonly LearnedMemoryKind[];
    readonly statuses?: readonly LearnedMemory["status"][];
    readonly limit?: number;
  } = {}): LearnedMemory[] {
    const conditions: string[] = [];
    const parameters: Array<string | number> = [];
    if (input.projectId !== undefined) {
      conditions.push("(scope<>'PROJECT' OR project_id=?)");
      parameters.push(input.projectId);
    }
    if (input.domain !== undefined) {
      conditions.push("(scope<>'DOMAIN' OR domain_key=?)");
      parameters.push(normalizeMemoryText(input.domain));
    }
    if (input.kinds?.length) {
      conditions.push(`kind IN (${placeholders(input.kinds.length)})`);
      parameters.push(...input.kinds);
    }
    if (input.statuses?.length) {
      conditions.push(`status IN (${placeholders(input.statuses.length)})`);
      parameters.push(...input.statuses);
    }
    parameters.push(Math.max(1, Math.min(100, Math.floor(input.limit ?? 50))));
    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    const rows = this.database.connection.prepare(
      `SELECT * FROM learned_memories ${where} ORDER BY last_reinforced_at DESC,id ASC LIMIT ?`,
    ).all(...parameters) as unknown as MemoryRow[];
    return rows.map(mapMemory);
  }

  inspect(id: string): {
    readonly memory: LearnedMemory;
    readonly observations: readonly LearnedMemoryObservationAudit[];
  } | undefined {
    const row = this.database.connection.prepare(
      "SELECT * FROM learned_memories WHERE id=?",
    ).get(id) as MemoryRow | undefined;
    if (row === undefined) return undefined;
    const observations = this.database.connection.prepare(`SELECT observation_key,
      statement_snapshot,provenance_summary_json,is_contradiction,created_at
      FROM learned_memory_observations WHERE memory_id=? ORDER BY created_at,id`).all(id) as unknown as Array<{
        observation_key: string;
        statement_snapshot: string;
        provenance_summary_json: string;
        is_contradiction: number;
        created_at: string;
      }>;
    return {
      memory: mapMemory(row),
      observations: observations.map((item) => ({
        observationKey: item.observation_key,
        statement: item.statement_snapshot,
        contradiction: item.is_contradiction === 1,
        provenanceSummary: JSON.parse(item.provenance_summary_json) as MemoryProvenanceSummary,
        createdAt: item.created_at,
      })),
    };
  }

  checkFtsIntegrity(): void {
    this.database.connection.exec(
      "INSERT INTO learned_memories_fts(learned_memories_fts) VALUES('integrity-check')",
    );
  }

  private getByCanonicalKey(canonicalKey: string): LearnedMemory | undefined {
    const row = this.database.connection.prepare(
      "SELECT * FROM learned_memories WHERE canonical_key=?",
    ).get(canonicalKey) as MemoryRow | undefined;
    return row === undefined ? undefined : mapMemory(row);
  }

  private getRequired(id: string): LearnedMemory {
    const row = this.database.connection.prepare(
      "SELECT * FROM learned_memories WHERE id=?",
    ).get(id) as MemoryRow | undefined;
    if (row === undefined) throw new Error("La memoria persistida no existe.");
    return mapMemory(row);
  }

  private insertObservation(
    id: string,
    memoryId: string,
    candidate: LearnedMemoryCandidate,
    statement: string,
    contradiction: boolean,
    now: string,
  ): void {
    this.database.connection.prepare(`INSERT INTO learned_memory_observations(
      id,memory_id,project_id,observation_key,statement_hash,statement_snapshot,
      provenance_summary_json,is_contradiction,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
      id,
      memoryId,
      candidate.projectId,
      candidate.observationKey.trim(),
      sha256(normalizeMemoryText(statement)),
      statement,
      JSON.stringify(normalizeProvenance(candidate.provenanceSummary)),
      contradiction ? 1 : 0,
      now,
    );
  }
}

function rejectionReason(candidate: LearnedMemoryCandidate): string | null {
  if (candidate.disposition !== "APPROVED") return "REJECTED_OUTPUT";
  if (!candidate.reusable) return "NOT_REUSABLE";
  if (!candidate.validated) return "NOT_VALIDATED";
  if (candidate.strength !== "ELIGIBLE") return "WEAK_SIGNAL";
  if (candidate.sourceClass !== "VALIDATED_STRUCTURED") return `SOURCE_NOT_ELIGIBLE:${candidate.sourceClass}`;
  if (candidate.projectId.trim() === "") return "PROJECT_REQUIRED";
  const semanticIdentity = normalizeMemoryText(candidate.semanticIdentity);
  const statement = candidate.statement.normalize("NFKC").replace(/\s+/g, " ").trim();
  const observationKey = candidate.observationKey.trim();
  const domain = normalizeMemoryText(candidate.domain ?? "");
  if (semanticIdentity === "" || semanticIdentity.length > 500) return "INVALID_SEMANTIC_IDENTITY";
  if (statement === "" || statement.length > 4000) return "INVALID_STATEMENT";
  if (observationKey === "" || observationKey.length > 500) return "INVALID_OBSERVATION_KEY";
  if (candidate.scope === "DOMAIN" && (domain === "" || domain.length > 200)) return "INVALID_DOMAIN";
  const provenance = normalizeProvenance(candidate.provenanceSummary);
  if (provenance.summary === "" || provenance.summary.length > 1000) return "INVALID_PROVENANCE_SUMMARY";
  if (provenance.sourceKinds.length === 0 || provenance.sourceKinds.length > 20 ||
    provenance.sourceKinds.some((item) => item.length > 80)) return "INVALID_PROVENANCE_SOURCES";
  if (candidate.kind === "DOMAIN_KNOWLEDGE" && candidate.scope === "GLOBAL") return "DOMAIN_KNOWLEDGE_CANNOT_BE_GLOBAL";
  if (candidate.kind === "SEMANTIC_KNOWLEDGE" && candidate.scope === "GLOBAL") return "SEMANTIC_KNOWLEDGE_REQUIRES_SCOPE";
  if (candidate.scope === "GLOBAL" && candidate.kind !== "RESEARCH_INTELLIGENCE") return "GLOBAL_KIND_NOT_ALLOWED";
  if (candidate.scope === "GLOBAL" && (candidate.projectCount ?? 0) < MIN_GLOBAL_RESEARCH_PROJECTS) {
    return "INSUFFICIENT_CROSS_PROJECT_SUPPORT";
  }
  for (const metric of [candidate.supportCount, candidate.sourceCount, candidate.authorCount, candidate.projectCount]) {
    if (metric !== undefined && (!Number.isInteger(metric) || metric < 0)) return "INVALID_COUNT";
  }
  if (candidate.confidence !== undefined && (!Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1)) {
    return "INVALID_CONFIDENCE";
  }
  return null;
}

function mapMemory(row: MemoryRow): LearnedMemory {
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    projectId: row.project_id,
    domain: row.domain_key,
    canonicalKey: row.canonical_key,
    statement: row.statement_text,
    value: JSON.parse(row.value_json) as unknown,
    status: row.status,
    supportCount: row.support_count,
    sourceCount: row.source_count,
    authorCount: row.author_count,
    projectCount: row.project_count,
    confidence: row.confidence,
    firstSeenAt: row.first_seen_at,
    lastReinforcedAt: row.last_reinforced_at,
    reinforcementCount: row.reinforcement_count,
    contradictionCount: row.contradiction_count,
    provenanceSummary: JSON.parse(row.provenance_summary_json) as MemoryProvenanceSummary,
  };
}

function normalizeMemoryText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function safeFtsQuery(value: string): string | null {
  const terms = normalizeMemoryText(value).match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 30) ?? [];
  return terms.length === 0 ? null : terms.map((term) => `"${term}"`).join(" OR ");
}

function normalizeProvenance(value: MemoryProvenanceSummary): MemoryProvenanceSummary {
  return {
    summary: value.summary.normalize("NFKC").replace(/\s+/g, " ").trim(),
    sourceKinds: [...new Set(value.sourceKinds.map((item) => item.trim()).filter(Boolean))],
  };
}

function nullableMetric(value: number | undefined): number | null {
  return value === undefined ? null : value;
}

function nullableConfidence(value: number | undefined): number | null {
  return value === undefined ? null : value;
}

function repeatMetric(value: number | undefined): [number | null, number | null, number | null] {
  const normalized = nullableMetric(value);
  return [normalized, normalized, normalized];
}

function repeatConfidence(value: number | undefined): [number | null, number | null, number | null] {
  const normalized = nullableConfidence(value);
  return [normalized, normalized, normalized];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}
