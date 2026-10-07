import { createHash } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database/database.js";

export type KnowledgeScope = "GLOBAL" | "PROJECT";
export type KnowledgeKind = "PROJECT_KNOWLEDGE" | "GLOBAL_KNOWLEDGE";
export type KnowledgeDocumentType = "pdf" | "docx" | "txt" | "markdown" | "html" | "manual";
export type KnowledgeDocumentStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED" | "NEEDS_OCR";

export interface KnowledgeLibrary {
  readonly id: string;
  readonly scope: KnowledgeScope;
  readonly projectId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly domain: string;
  readonly category: string | null;
  readonly tags: readonly string[];
  readonly priority: number;
  readonly isEnabled: boolean;
  readonly selected: boolean;
  readonly createdAt: string;
}

export interface KnowledgeDocument {
  readonly id: string;
  readonly libraryId: string;
  readonly scope: KnowledgeScope;
  readonly projectId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly documentType: KnowledgeDocumentType;
  readonly mimeType: string | null;
  readonly originalFilename: string | null;
  readonly status: KnowledgeDocumentStatus;
  readonly category: string | null;
  readonly tags: readonly string[];
  readonly chunkCount: number;
  readonly fileSha256: string | null;
  readonly bytes: number;
  readonly storedRelativePath: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeChunkInput {
  readonly content: string;
  readonly heading?: string | null;
  readonly pageNumber?: number | null;
  readonly tokenEstimate?: number;
}

export interface KnowledgeSearchInput {
  readonly projectId: string;
  readonly query: string;
  readonly libraryIds?: readonly string[];
  readonly categories?: readonly string[];
  readonly tags?: readonly string[];
  readonly kinds?: readonly KnowledgeKind[];
  readonly documentTypes?: readonly KnowledgeDocumentType[];
  readonly limit?: number;
  readonly offset?: number;
}

export interface KnowledgeSearchResult {
  readonly chunkId: string;
  readonly documentId: string;
  readonly libraryId: string;
  readonly title: string;
  readonly content: string;
  readonly snippet: string;
  readonly heading: string | null;
  readonly pageNumber: number | null;
  readonly chunkIndex: number;
  readonly scope: KnowledgeScope;
  readonly projectId: string | null;
  readonly kind: KnowledgeKind;
  readonly category: string | null;
  readonly tags: readonly string[];
  readonly documentType: KnowledgeDocumentType;
  /** FTS5 bm25: lower (normally more negative) is a better lexical match. */
  readonly rawScore: number;
}

export interface ApprovedMemorySearchResult {
  readonly memoryId: string;
  readonly originProjectId: string;
  readonly artifactVersionId: string;
  readonly artifactType: string;
  readonly visibility: KnowledgeScope;
  readonly projectId: string;
  readonly approvalStatus: "APPROVED";
  readonly preferred: boolean;
  readonly output: unknown;
  readonly rawScore: number;
}

interface LibraryRow {
  id: string; scope: KnowledgeScope; project_id: string | null; name: string;
  description: string | null; domain: string; category: string | null; tags_json: string;
  priority: number; is_enabled: number; selected: number; created_at: string;
}

interface DocumentRow {
  id: string; library_id: string; scope: KnowledgeScope; project_id: string | null;
  title: string; description: string | null; document_type: KnowledgeDocumentType;
  mime_type: string | null; original_filename: string | null; status: KnowledgeDocumentStatus;
  category: string | null; tags_json: string; chunk_count: number;
  file_sha256: string | null; byte_size: number; stored_relative_path: string | null;
  error_code: string | null; error_message: string | null; created_at: string; updated_at: string;
}

interface SearchRow {
  chunk_id: string; document_id: string; library_id: string; title: string;
  content_text: string; snippet: string; heading: string | null; page_number: number | null;
  chunk_index: number; scope: KnowledgeScope; project_id: string | null;
  category: string | null; tags_json: string; document_type: KnowledgeDocumentType; raw_score: number;
}

interface KnowledgeSearchSql {
  readonly cte: string;
  readonly fromWhere: string;
  readonly parameters: readonly SQLInputValue[];
}

export class KnowledgeRepository {
  constructor(private readonly database: AppDatabase) {}

  createLibrary(input: {
    scope: KnowledgeScope; projectId?: string | null; name: string;
    description?: string | null; domain?: string; category?: string | null; tags?: readonly string[]; priority?: number;
  }): KnowledgeLibrary {
    const id = uuidv7();
    const now = new Date().toISOString();
    const projectId = input.scope === "PROJECT" ? input.projectId ?? null : null;
    if (input.scope === "PROJECT" && projectId === null) {
      throw new Error("Una biblioteca de proyecto requiere projectId.");
    }
    const db = this.database.connection;
    const ownsTransaction = !db.isTransaction;
    if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO knowledge_libraries
        (id,scope,project_id,name,description,domain,category,tags_json,priority,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
          id, input.scope, projectId, input.name.trim(), input.description?.trim() || null,
          input.domain?.trim() || "GENERAL", input.category?.trim() || null,
          JSON.stringify(uniqueStrings(input.tags ?? [])), input.priority ?? 50, now, now,
        );
      if (projectId) {
        db.prepare(`INSERT INTO project_knowledge_libraries
          (project_id,library_id,is_enabled,priority,selected_at) VALUES(?,?,1,?,?)`)
          .run(projectId, id, input.priority ?? 50, now);
      }
      if (ownsTransaction) db.exec("COMMIT");
      return this.getLibrary(id, projectId ?? undefined)!;
    } catch (error) {
      if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  getLibrary(id: string, projectId?: string): KnowledgeLibrary | undefined {
    const row = this.database.connection.prepare(`SELECT library.*,
      CASE WHEN selected.library_id IS NOT NULL AND selected.is_enabled=1 THEN 1 ELSE 0 END selected
      FROM knowledge_libraries library
      LEFT JOIN project_knowledge_libraries selected
        ON selected.library_id=library.id AND selected.project_id=?
      WHERE library.id=?`).get(projectId ?? null, id) as LibraryRow | undefined;
    return row ? mapLibrary(row) : undefined;
  }

  listLibraries(projectId: string): KnowledgeLibrary[] {
    const rows = this.database.connection.prepare(`SELECT library.*,
      CASE WHEN selected.library_id IS NOT NULL AND selected.is_enabled=1 THEN 1 ELSE 0 END selected
      FROM knowledge_libraries library
      LEFT JOIN project_knowledge_libraries selected
        ON selected.library_id=library.id AND selected.project_id=?
      WHERE library.is_enabled=1 AND (library.scope='GLOBAL' OR library.project_id=?)
      ORDER BY library.scope DESC, COALESCE(selected.priority,library.priority) DESC, lower(library.name)`)
      .all(projectId, projectId) as unknown as LibraryRow[];
    return rows.map(mapLibrary);
  }

  selectLibrary(projectId: string, libraryId: string, enabled: boolean, priority = 50): void {
    this.database.connection.prepare(`INSERT INTO project_knowledge_libraries
      (project_id,library_id,is_enabled,priority,selected_at) VALUES(?,?,?,?,?)
      ON CONFLICT(project_id,library_id) DO UPDATE SET
        is_enabled=excluded.is_enabled,priority=excluded.priority,selected_at=excluded.selected_at`)
      .run(projectId, libraryId, enabled ? 1 : 0, priority, new Date().toISOString());
  }

  createDocument(input: {
    libraryId: string; title: string; documentType: KnowledgeDocumentType;
    description?: string | null; mimeType?: string | null; originalFilename?: string | null;
    storedRelativePath?: string | null; fileSha256?: string | null; category?: string | null;
    bytes?: number;
    tags?: readonly string[]; metadata?: Record<string, unknown>; importJobId?: string | null;
  }): KnowledgeDocument {
    const library = this.database.connection.prepare(
      "SELECT scope,project_id FROM knowledge_libraries WHERE id=? AND is_enabled=1",
    ).get(input.libraryId) as { scope: KnowledgeScope; project_id: string | null } | undefined;
    if (!library) throw new Error("La biblioteca no existe o está deshabilitada.");
    const id = uuidv7();
    const now = new Date().toISOString();
    this.database.connection.prepare(`INSERT INTO knowledge_documents
      (id,library_id,scope,project_id,import_job_id,title,description,document_type,mime_type,
       original_filename,stored_relative_path,file_sha256,byte_size,category,tags_json,original_metadata_json,
       status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING',?,?)`).run(
        id, input.libraryId, library.scope, library.project_id, input.importJobId ?? null,
        input.title.trim(), input.description?.trim() || null, input.documentType,
        input.mimeType ?? null, input.originalFilename ?? null, input.storedRelativePath ?? null,
        input.fileSha256 ?? null, input.bytes ?? 0, input.category?.trim() || null,
        JSON.stringify(uniqueStrings(input.tags ?? [])), JSON.stringify(input.metadata ?? {}), now, now,
      );
    return this.getDocument(id)!;
  }

  getDocument(id: string): KnowledgeDocument | undefined {
    const row = this.database.connection.prepare("SELECT * FROM knowledge_documents WHERE id=?")
      .get(id) as DocumentRow | undefined;
    return row ? mapDocument(row) : undefined;
  }

  listDocuments(projectId: string, libraryId?: string): KnowledgeDocument[] {
    const libraryClause = libraryId ? " AND document.library_id=?" : "";
    const parameters: string[] = [projectId, projectId];
    if (libraryId) parameters.push(libraryId);
    const rows = this.database.connection.prepare(`SELECT document.* FROM knowledge_documents document
      JOIN knowledge_libraries library ON library.id=document.library_id AND library.is_enabled=1
      LEFT JOIN project_knowledge_libraries selected
        ON selected.library_id=library.id AND selected.project_id=? AND selected.is_enabled=1
      WHERE ((document.scope='PROJECT' AND document.project_id=?) OR
             (document.scope='GLOBAL' AND selected.library_id IS NOT NULL))${libraryClause}
      ORDER BY document.updated_at DESC`).all(...parameters) as unknown as DocumentRow[];
    return rows.map(mapDocument);
  }

  replaceChunks(documentId: string, chunks: readonly KnowledgeChunkInput[]): KnowledgeDocument {
    const document = this.database.connection.prepare(`SELECT document.*,library.name library_name
      FROM knowledge_documents document JOIN knowledge_libraries library ON library.id=document.library_id
      WHERE document.id=?`).get(documentId) as (DocumentRow & { library_name: string }) | undefined;
    if (!document) throw new Error("El documento no existe.");
    const normalized = chunks.map((chunk) => ({
      content: chunk.content.trim(), heading: chunk.heading?.trim() || null,
      pageNumber: chunk.pageNumber ?? null,
      tokenEstimate: chunk.tokenEstimate ?? Math.ceil(chunk.content.trim().length / 4),
    }));
    if (normalized.some((chunk) => chunk.content.length === 0)) {
      throw new Error("Los chunks no pueden estar vacíos.");
    }
    const ids = normalized.map(() => uuidv7());
    const now = new Date().toISOString();
    const tags = parseStringArray(document.tags_json);
    const db = this.database.connection;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM knowledge_chunks WHERE document_id=?").run(documentId);
      const insert = db.prepare(`INSERT INTO knowledge_chunks
        (id,document_id,library_id,scope,project_id,chunk_index,title_text,heading,page_number,
         content_text,content_sha256,tags_text,token_estimate,previous_chunk_id,next_chunk_id,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      normalized.forEach((chunk, index) => insert.run(
        ids[index]!, documentId, document.library_id, document.scope, document.project_id, index,
        document.title, chunk.heading, chunk.pageNumber, chunk.content, sha256(chunk.content),
        tags.join(" "), chunk.tokenEstimate, null, null, now,
      ));
      const linkNeighbors = db.prepare(
        "UPDATE knowledge_chunks SET previous_chunk_id=?,next_chunk_id=? WHERE id=?",
      );
      ids.forEach((id, index) => linkNeighbors.run(ids[index - 1] ?? null, ids[index + 1] ?? null, id));
      db.prepare(`UPDATE knowledge_documents SET status=?,chunk_count=?,error_code=NULL,
        error_message=NULL,updated_at=? WHERE id=?`).run(
          normalized.length === 0 ? "NEEDS_OCR" : "READY", normalized.length, now, documentId,
        );
      db.exec("COMMIT");
      return this.getDocument(documentId)!;
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  markDocumentFailed(documentId: string, code: string, message: string): void {
    this.database.connection.prepare(`UPDATE knowledge_documents SET status='FAILED',error_code=?,
      error_message=?,updated_at=? WHERE id=?`).run(code, message, new Date().toISOString(), documentId);
  }

  deleteDocument(documentId: string): boolean {
    return Number(this.database.connection.prepare("DELETE FROM knowledge_documents WHERE id=?").run(documentId).changes) === 1;
  }

  search(input: KnowledgeSearchInput): KnowledgeSearchResult[] {
    const sql = buildKnowledgeSearchSql(input);
    if (!sql) return [];
    return this.fetchSearchRows(input, sql);
  }

  searchPage(input: KnowledgeSearchInput): { readonly results: KnowledgeSearchResult[]; readonly total: number } {
    const sql = buildKnowledgeSearchSql(input);
    if (!sql) return { results: [], total: 0 };
    const count = this.database.connection.prepare(`${sql.cte}
      SELECT COUNT(*) AS total ${sql.fromWhere}`).get(...sql.parameters) as { total: number };
    return { results: this.fetchSearchRows(input, sql), total: count.total };
  }

  private fetchSearchRows(input: KnowledgeSearchInput, sql: KnowledgeSearchSql): KnowledgeSearchResult[] {
    const limit = Math.max(1, Math.min(100, input.limit ?? 10));
    const offset = Math.max(0, input.offset ?? 0);
    const rows = this.database.connection.prepare(`${sql.cte}
      SELECT chunk.id chunk_id,chunk.document_id,
      chunk.library_id,document.title,chunk.content_text,
      chunk.content_text snippet,
      chunk.heading,chunk.page_number,chunk.chunk_index,chunk.scope,chunk.project_id,
      document.category,document.tags_json,document.document_type,matches.raw_score
      ${sql.fromWhere}
      ORDER BY raw_score ASC, chunk.id ASC LIMIT ? OFFSET ?`).all(...sql.parameters, limit, offset) as unknown as SearchRow[];
    return rows.map(mapSearchRow);
  }

  saveMemoryDecision(input: {
    originProjectId: string; artifactVersionId: string; generationId?: string | null;
    disposition: "APPROVED" | "REJECTED"; visibility?: KnowledgeScope;
    reusable?: boolean; preferred?: boolean; editedOutput?: unknown; notes?: string | null;
  }): string {
    const version = this.database.connection.prepare(`SELECT version.output_data,artifact.artifact_type
      FROM artifact_versions version JOIN artifacts artifact ON artifact.id=version.artifact_id
      WHERE version.id=? AND version.project_id=?`).get(input.artifactVersionId, input.originProjectId) as
      { output_data: string; artifact_type: string } | undefined;
    if (!version) throw new Error("La versión de artefacto no pertenece al proyecto.");
    const reusable = input.disposition === "APPROVED" && (input.reusable ?? false);
    const preferred = reusable && (input.preferred ?? false);
    const editedJson = input.editedOutput === undefined ? null : JSON.stringify(input.editedOutput);
    const searchable = input.editedOutput === undefined ? JSON.parse(version.output_data) : input.editedOutput;
    const searchText = flattenText(searchable);
    const existing = this.database.connection.prepare(
      "SELECT id FROM approved_output_memory WHERE artifact_version_id=?",
    ).get(input.artifactVersionId) as { id: string } | undefined;
    const id = existing?.id ?? uuidv7();
    const now = new Date().toISOString();
    this.database.connection.prepare(`INSERT INTO approved_output_memory
      (id,origin_project_id,artifact_version_id,generation_id,artifact_type,disposition,visibility,
       reusable,preferred,original_output_json,edited_output_json,search_text,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(artifact_version_id) DO UPDATE SET
        generation_id=excluded.generation_id,disposition=excluded.disposition,visibility=excluded.visibility,
        reusable=excluded.reusable,preferred=excluded.preferred,edited_output_json=excluded.edited_output_json,
        search_text=excluded.search_text,notes=excluded.notes,updated_at=excluded.updated_at`).run(
          id, input.originProjectId, input.artifactVersionId, input.generationId ?? null,
          version.artifact_type, input.disposition, input.visibility ?? "PROJECT", reusable ? 1 : 0,
          preferred ? 1 : 0, version.output_data, editedJson, searchText, input.notes?.trim() || null, now, now,
        );
    return id;
  }

  searchMemory(projectId: string, query: string, limit = 10, offset = 0): ApprovedMemorySearchResult[] {
    if (!query.trim()) return [];
    const rows = this.database.connection.prepare(`SELECT memory.id,memory.origin_project_id,
      memory.artifact_version_id,memory.artifact_type,memory.visibility,memory.preferred,
      COALESCE(memory.edited_output_json,memory.original_output_json) output_json,
      bm25(approved_output_memory_fts,3.0,1.0) raw_score
      FROM approved_output_memory_fts
      JOIN approved_output_memory memory ON memory.rowid=approved_output_memory_fts.rowid
      WHERE approved_output_memory_fts MATCH ? AND memory.disposition='APPROVED' AND memory.reusable=1
        AND (memory.origin_project_id=? OR memory.visibility='GLOBAL')
      ORDER BY memory.preferred DESC,raw_score ASC,memory.id ASC LIMIT ? OFFSET ?`)
      .all(query.trim(), projectId, Math.max(1, Math.min(100, limit)), Math.max(0, offset)) as unknown as Array<{
        id: string; origin_project_id: string; artifact_version_id: string; artifact_type: string;
        visibility: KnowledgeScope; preferred: number; output_json: string; raw_score: number;
      }>;
    return rows.map((row) => ({
      memoryId: row.id, originProjectId: row.origin_project_id,
      artifactVersionId: row.artifact_version_id, artifactType: row.artifact_type,
      visibility: row.visibility, projectId: row.origin_project_id, approvalStatus: "APPROVED",
      preferred: row.preferred === 1, output: JSON.parse(row.output_json) as unknown,
      rawScore: row.raw_score,
    }));
  }

  createRetrievalLog(input: {
    projectId: string; generationId?: string | null; agentKey: string; query: string;
    policy: Record<string, unknown>; selectedLibraryIds: readonly string[];
    maxChunks: number; maxContextTokens: number; contextTokenEstimate?: number;
    items: ReadonlyArray<{
      kind: KnowledgeKind | "APPROVED_MEMORY"; chunkId?: string; memoryId?: string;
      rawScore: number; tokenEstimate: number; citation: Record<string, unknown>;
    }>;
  }): string {
    const id = uuidv7();
    const now = new Date().toISOString();
    const db = this.database.connection;
    const ownsTransaction = !db.isTransaction;
    if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO knowledge_retrieval_logs
        (id,project_id,generation_id,agent_key,query_text,policy_json,selected_libraries_json,
         max_chunks,max_context_tokens,context_token_estimate,embedding_provider,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'disabled',?)`).run(
          id, input.projectId, input.generationId ?? null, input.agentKey, input.query.trim(),
          JSON.stringify(input.policy), JSON.stringify(input.selectedLibraryIds), input.maxChunks,
          input.maxContextTokens, input.contextTokenEstimate ?? 0, now,
        );
      const insert = db.prepare(`INSERT INTO knowledge_retrieval_items
        (id,retrieval_log_id,project_id,knowledge_kind,chunk_id,memory_id,rank_position,
         raw_score,token_estimate,citation_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
      input.items.forEach((item, index) => insert.run(
        uuidv7(), id, input.projectId, item.kind, item.chunkId ?? null, item.memoryId ?? null,
        index + 1, item.rawScore, item.tokenEstimate, JSON.stringify(item.citation), now,
      ));
      if (ownsTransaction) db.exec("COMMIT");
      return id;
    } catch (error) {
      if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  getRetrievalForGeneration(projectId:string,generationId:string):{id:string;query:string;agentKey:string;contextTokenEstimate:number;createdAt:string;items:Array<Record<string,unknown>>}|undefined{
    const log=this.database.connection.prepare("SELECT id,query_text,agent_key,context_token_estimate,created_at FROM knowledge_retrieval_logs WHERE project_id=? AND generation_id=? ORDER BY created_at DESC LIMIT 1").get(projectId,generationId) as {id:string;query_text:string;agent_key:string;context_token_estimate:number;created_at:string}|undefined;
    if(!log)return undefined;
    const rows=this.database.connection.prepare(`SELECT item.knowledge_kind,item.rank_position,item.raw_score,item.citation_json,
      COALESCE(json_extract(item.citation_json,'$.excerpt'),chunk.content_text,memory.edited_output_json,memory.original_output_json) content_text,
      chunk.heading,chunk.page_number,COALESCE(document.title,'Memoria aprobada · '||memory.artifact_type) title,
      COALESCE(library.name,CASE memory.visibility WHEN 'GLOBAL' THEN 'Memoria global' ELSE 'Memoria del proyecto' END) library_name
      FROM knowledge_retrieval_items item
      LEFT JOIN knowledge_chunks chunk ON chunk.id=item.chunk_id
      LEFT JOIN knowledge_documents document ON document.id=chunk.document_id
      LEFT JOIN knowledge_libraries library ON library.id=chunk.library_id
      LEFT JOIN approved_output_memory memory ON memory.id=item.memory_id
      WHERE item.retrieval_log_id=? AND item.project_id=? ORDER BY item.rank_position`).all(log.id,projectId) as unknown as Array<{knowledge_kind:string;rank_position:number;raw_score:number;citation_json:string;content_text:string|null;heading:string|null;page_number:number|null;title:string|null;library_name:string|null}>;
    return{id:log.id,query:log.query_text,agentKey:log.agent_key,contextTokenEstimate:log.context_token_estimate,createdAt:log.created_at,items:rows.map(row=>({kind:row.knowledge_kind,rank:row.rank_position,rawScore:row.raw_score,citation:JSON.parse(row.citation_json) as unknown,content:row.content_text,title:row.title,libraryName:row.library_name,heading:row.heading,pageNumber:row.page_number}))};
  }

  checkFtsIntegrity(): void {
    this.database.connection.exec("INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts) VALUES('integrity-check')");
    this.database.connection.exec("INSERT INTO approved_output_memory_fts(approved_output_memory_fts) VALUES('integrity-check')");
  }
}

function mapLibrary(row: LibraryRow): KnowledgeLibrary {
  return { id: row.id, scope: row.scope, projectId: row.project_id, name: row.name,
    description: row.description, domain: row.domain, category: row.category, tags: parseStringArray(row.tags_json), priority: row.priority,
    isEnabled: row.is_enabled === 1, selected: row.selected === 1, createdAt: row.created_at };
}

function mapDocument(row: DocumentRow): KnowledgeDocument {
  return { id: row.id, libraryId: row.library_id, scope: row.scope, projectId: row.project_id,
    title: row.title, description: row.description, documentType: row.document_type,
    mimeType: row.mime_type, originalFilename: row.original_filename, status: row.status,
    category: row.category, tags: parseStringArray(row.tags_json), chunkCount: row.chunk_count,
    fileSha256: row.file_sha256, bytes: row.byte_size, storedRelativePath: row.stored_relative_path,
    errorCode: row.error_code, errorMessage: row.error_message,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapSearchRow(row: SearchRow): KnowledgeSearchResult {
  return {
    chunkId: row.chunk_id, documentId: row.document_id, libraryId: row.library_id,
    title: row.title, content: row.content_text, snippet: row.snippet, heading: row.heading,
    pageNumber: row.page_number, chunkIndex: row.chunk_index, scope: row.scope,
    projectId: row.project_id, kind: row.scope === "PROJECT" ? "PROJECT_KNOWLEDGE" : "GLOBAL_KNOWLEDGE",
    category: row.category, tags: parseStringArray(row.tags_json), rawScore: row.raw_score,
    documentType: row.document_type,
  };
}

function buildKnowledgeSearchSql(input: KnowledgeSearchInput): KnowledgeSearchSql | undefined {
  const query = input.query.trim();
  if (!query) return undefined;
  const conditions = [`document.status='READY'`, `library.is_enabled=1`,
    `((chunk.scope='PROJECT' AND chunk.project_id=? AND selected.library_id IS NOT NULL) OR
      (chunk.scope='GLOBAL' AND selected.library_id IS NOT NULL))`];
  const parameters: SQLInputValue[] = [query, input.projectId, input.projectId];

  if (input.libraryIds?.length) {
    conditions.push(`chunk.library_id IN (${placeholders(input.libraryIds.length)})`);
    parameters.push(...input.libraryIds);
  }
  if (input.categories?.length) {
    conditions.push(`document.category IN (${placeholders(input.categories.length)})`);
    parameters.push(...input.categories);
  }
  if (input.kinds?.length) {
    const allowedScopes = input.kinds.map((kind) => kind === "PROJECT_KNOWLEDGE" ? "PROJECT" : "GLOBAL");
    conditions.push(`chunk.scope IN (${placeholders(allowedScopes.length)})`);
    parameters.push(...allowedScopes);
  }
  if (input.documentTypes?.length) {
    conditions.push(`document.document_type IN (${placeholders(input.documentTypes.length)})`);
    parameters.push(...input.documentTypes);
  }
  for (const tag of input.tags ?? []) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(document.tags_json) tag WHERE tag.value=?)");
    parameters.push(tag);
  }

  return {
    cte: `WITH matches AS MATERIALIZED (
      SELECT rowid,bm25(knowledge_chunks_fts,5.0,3.0,1.0,2.0) raw_score
      FROM knowledge_chunks_fts WHERE knowledge_chunks_fts MATCH ?
    )`,
    fromWhere: `FROM matches
      JOIN knowledge_chunks chunk ON chunk.rowid=matches.rowid
      JOIN knowledge_documents document ON document.id=chunk.document_id
      JOIN knowledge_libraries library ON library.id=chunk.library_id
      LEFT JOIN project_knowledge_libraries selected
        ON selected.library_id=library.id AND selected.project_id=? AND selected.is_enabled=1
      WHERE ${conditions.join(" AND ")}`,
    parameters,
  };
}

function parseStringArray(json: string): string[] {
  try { const value = JSON.parse(json) as unknown; return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

function flattenText(value: unknown): string {
  const strings: string[] = [];
  const visit = (item: unknown): void => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") strings.push(String(item));
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") Object.values(item).forEach(visit);
  };
  visit(value);
  return strings.join(" ").replace(/\s+/g, " ").trim();
}
