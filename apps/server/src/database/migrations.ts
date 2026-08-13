export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "001_initial",
    sql: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
        niche TEXT NOT NULL CHECK (length(trim(niche)) BETWEEN 1 AND 200),
        description TEXT CHECK (description IS NULL OR length(description) <= 2000),
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'archived')),
        language TEXT NOT NULL DEFAULT 'es',
        region TEXT,
        currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      ) STRICT;

      CREATE INDEX projects_status_updated_idx
        ON projects (status, updated_at DESC);
    `,
  },
  {
    version: 2,
    name: "002_projects_workflow_artifacts_lineage",
    sql: `
      CREATE TABLE project_settings (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        language TEXT NOT NULL DEFAULT 'es',
        target_market TEXT,
        currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
        general_notes TEXT,
        preferred_llm_provider TEXT,
        economy_model TEXT,
        powerful_model TEXT,
        max_budget REAL CHECK (max_budget IS NULL OR max_budget >= 0),
        content_language TEXT NOT NULL DEFAULT 'es',
        updated_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO project_settings (project_id, language, currency, content_language, updated_at)
      SELECT id, language, currency, language, updated_at FROM projects;

      CREATE TABLE workflow_steps (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        step_key TEXT NOT NULL,
        label TEXT NOT NULL,
        position INTEGER NOT NULL CHECK (position > 0),
        state TEXT NOT NULL CHECK (state IN ('PENDING','READY','IN_PROGRESS','COMPLETED','STALE','BLOCKED')),
        stale_reason TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, step_key),
        UNIQUE(project_id, position)
      ) STRICT;

      WITH steps(step_key, label, position) AS (VALUES
        ('research','Investigación',1), ('sources','Fuentes',2),
        ('problems','Problemas',3), ('opportunities','Oportunidades',4),
        ('product','Producto',5), ('avatar','Avatar',6),
        ('mechanism','Mecanismo',7), ('beliefs','Creencias',8),
        ('offer','Oferta',9), ('landing','Landing',10),
        ('funnel','Funnel',11), ('emails','Emails',12),
        ('content','Contenido',13), ('final_product','Producto final',14)
      )
      INSERT INTO workflow_steps (id, project_id, step_key, label, position, state, updated_at)
      SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-7' ||
        substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) ||
        substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
        p.id, s.step_key, s.label, s.position,
        CASE WHEN s.position = 1 THEN 'READY' ELSE 'PENDING' END, p.updated_at
      FROM projects p CROSS JOIN steps s;

      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        artifact_type TEXT NOT NULL,
        name TEXT NOT NULL,
        active_version_id TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(project_id, artifact_type, name)
      ) STRICT;

      CREATE TABLE artifact_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL CHECK (version_number > 0),
        status TEXT NOT NULL CHECK (status IN ('draft','approved','superseded','archived')),
        freshness TEXT NOT NULL DEFAULT 'fresh' CHECK (freshness IN ('fresh','stale')),
        input_snapshot TEXT NOT NULL,
        output_data TEXT NOT NULL,
        supersedes_version_id TEXT REFERENCES artifact_versions(id),
        stale_reason TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(artifact_id, version_number)
      ) STRICT;

      CREATE INDEX artifact_versions_project_idx ON artifact_versions(project_id, created_at DESC);

      CREATE TABLE lineage_edges (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_version_id TEXT NOT NULL REFERENCES artifact_versions(id) ON DELETE CASCADE,
        child_version_id TEXT NOT NULL REFERENCES artifact_versions(id) ON DELETE CASCADE,
        relation TEXT NOT NULL DEFAULT 'derived_from',
        created_at TEXT NOT NULL,
        CHECK(parent_version_id <> child_version_id),
        UNIQUE(parent_version_id, child_version_id, relation)
      ) STRICT;

      CREATE INDEX lineage_parent_idx ON lineage_edges(parent_version_id);
      CREATE INDEX lineage_child_idx ON lineage_edges(child_version_id);

      CREATE TABLE staleness_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        stale_version_id TEXT NOT NULL REFERENCES artifact_versions(id) ON DELETE CASCADE,
        old_parent_version_id TEXT NOT NULL REFERENCES artifact_versions(id),
        new_parent_version_id TEXT NOT NULL REFERENCES artifact_versions(id),
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      ) STRICT;

      CREATE TABLE evidence_links (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        relation TEXT NOT NULL DEFAULT 'supports',
        created_at TEXT NOT NULL,
        UNIQUE(project_id, target_type, target_id, source_type, source_id, relation)
      ) STRICT;

      CREATE INDEX evidence_target_idx ON evidence_links(project_id, target_type, target_id);
    `,
  },
  {
    version: 3,
    name: "003_sources_jobs_usage_files",
    sql: `
      CREATE UNIQUE INDEX artifact_versions_project_id_unique ON artifact_versions(project_id, id);

      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL CHECK (source_type IN ('youtube','manual','demo')),
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
        url TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending','importing','ready','failed','cancelled')),
        raw_text TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, id),
        CHECK (source_type <> 'manual' OR raw_text IS NOT NULL),
        CHECK (source_type <> 'youtube' OR url IS NOT NULL)
      ) STRICT;

      CREATE INDEX sources_project_updated_idx ON sources(project_id, updated_at DESC);
      CREATE INDEX sources_project_type_idx ON sources(project_id, source_type, status);

      CREATE TABLE videos (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        platform_video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        channel_id TEXT,
        channel_title TEXT,
        published_at TEXT,
        comment_count INTEGER CHECK (comment_count IS NULL OR comment_count >= 0),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        UNIQUE(project_id, id),
        UNIQUE(project_id, source_id, id),
        UNIQUE(source_id, platform_video_id),
        UNIQUE(source_id),
        FOREIGN KEY(project_id, source_id) REFERENCES sources(project_id, id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE comments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        video_id TEXT,
        platform_comment_id TEXT NOT NULL,
        thread_id TEXT,
        parent_comment_id TEXT,
        author TEXT NOT NULL,
        text TEXT NOT NULL CHECK (length(text) > 0),
        likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
        published_at TEXT,
        updated_at TEXT,
        is_reply INTEGER NOT NULL DEFAULT 0 CHECK (is_reply IN (0,1)),
        is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        UNIQUE(project_id, id),
        UNIQUE(project_id, source_id, id),
        UNIQUE(source_id, platform_comment_id),
        FOREIGN KEY(project_id, source_id) REFERENCES sources(project_id, id) ON DELETE CASCADE,
        FOREIGN KEY(project_id, source_id, video_id) REFERENCES videos(project_id, source_id, id) ON DELETE CASCADE,
        FOREIGN KEY(project_id, source_id, parent_comment_id) REFERENCES comments(project_id, source_id, id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX comments_project_source_idx ON comments(project_id, source_id, created_at);
      CREATE INDEX comments_project_likes_idx ON comments(project_id, likes DESC);
      CREATE INDEX comments_thread_idx ON comments(project_id, thread_id);

      CREATE TABLE evidence_snippets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        comment_id TEXT,
        quote_text TEXT NOT NULL CHECK (length(trim(quote_text)) > 0),
        provenance TEXT NOT NULL CHECK (provenance IN ('EVIDENCE_BACKED','AI_INFERENCE')),
        created_at TEXT NOT NULL,
        UNIQUE(project_id, id),
        UNIQUE(project_id, comment_id),
        FOREIGN KEY(project_id, source_id) REFERENCES sources(project_id, id) ON DELETE CASCADE,
        FOREIGN KEY(project_id, source_id, comment_id) REFERENCES comments(project_id, source_id, id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX evidence_snippets_source_idx ON evidence_snippets(project_id, source_id);

      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_id TEXT,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
        progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
        message TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}',
        result_json TEXT,
        error_code TEXT,
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
        cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0,1)),
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, id),
        FOREIGN KEY(project_id, source_id) REFERENCES sources(project_id, id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX jobs_project_status_idx ON jobs(project_id, status, created_at DESC);

      CREATE TABLE generations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        job_id TEXT,
        agent_key TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','CANCELLED')),
        input_snapshot TEXT NOT NULL DEFAULT '{}',
        output_data TEXT,
        prompt_version TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
        output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
        estimated_cost REAL NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
        duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE(project_id, id),
        FOREIGN KEY(project_id, job_id) REFERENCES jobs(project_id, id) ON DELETE SET NULL
      ) STRICT;

      CREATE INDEX generations_project_created_idx ON generations(project_id, created_at DESC);

      CREATE TABLE llm_usage (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        generation_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
        output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
        estimated_cost REAL NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
        currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
        is_estimate INTEGER NOT NULL DEFAULT 1 CHECK (is_estimate IN (0,1)),
        recorded_at TEXT NOT NULL,
        UNIQUE(generation_id),
        FOREIGN KEY(project_id, generation_id) REFERENCES generations(project_id, id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX llm_usage_project_recorded_idx ON llm_usage(project_id, recorded_at DESC);

      CREATE TABLE generated_files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        artifact_version_id TEXT,
        file_role TEXT NOT NULL,
        format TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        checksum TEXT NOT NULL CHECK (length(checksum) = 64),
        bytes INTEGER NOT NULL CHECK (bytes >= 0),
        created_at TEXT NOT NULL,
        UNIQUE(project_id, relative_path),
        FOREIGN KEY(project_id, artifact_version_id) REFERENCES artifact_versions(project_id, id) ON DELETE SET NULL
      ) STRICT;
    `,
  },
  {
    version: 4,
    name: "004_project_isolation_guards",
    sql: `
      CREATE TRIGGER artifact_versions_project_guard_insert
      BEFORE INSERT ON artifact_versions
      WHEN NOT EXISTS (SELECT 1 FROM artifacts a WHERE a.id=NEW.artifact_id AND a.project_id=NEW.project_id)
      BEGIN SELECT RAISE(ABORT, 'artifact_version_project_mismatch'); END;

      CREATE TRIGGER artifact_versions_project_guard_update
      BEFORE UPDATE OF project_id,artifact_id ON artifact_versions
      WHEN NOT EXISTS (SELECT 1 FROM artifacts a WHERE a.id=NEW.artifact_id AND a.project_id=NEW.project_id)
      BEGIN SELECT RAISE(ABORT, 'artifact_version_project_mismatch'); END;

      CREATE TRIGGER lineage_project_guard_insert
      BEFORE INSERT ON lineage_edges
      WHEN NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.parent_version_id AND v.project_id=NEW.project_id)
        OR NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.child_version_id AND v.project_id=NEW.project_id)
      BEGIN SELECT RAISE(ABORT, 'lineage_project_mismatch'); END;

      CREATE TRIGGER staleness_project_guard_insert
      BEFORE INSERT ON staleness_events
      WHEN NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.stale_version_id AND v.project_id=NEW.project_id)
        OR NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.old_parent_version_id AND v.project_id=NEW.project_id)
        OR NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.new_parent_version_id AND v.project_id=NEW.project_id)
      BEGIN SELECT RAISE(ABORT, 'staleness_project_mismatch'); END;
    `,
  },
  {
    version: 5,
    name: "005_project_isolation_update_guards",
    sql: `
      CREATE TRIGGER artifacts_active_version_guard_insert
      BEFORE INSERT ON artifacts
      WHEN NEW.active_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.active_version_id AND v.project_id=NEW.project_id AND v.artifact_id=NEW.id)
      BEGIN SELECT RAISE(ABORT, 'artifact_active_version_mismatch'); END;

      CREATE TRIGGER artifacts_active_version_guard_update
      BEFORE UPDATE OF project_id,active_version_id ON artifacts
      WHEN NEW.active_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.active_version_id AND v.project_id=NEW.project_id AND v.artifact_id=NEW.id)
      BEGIN SELECT RAISE(ABORT, 'artifact_active_version_mismatch'); END;

      CREATE TRIGGER lineage_project_guard_update
      BEFORE UPDATE OF project_id,parent_version_id,child_version_id ON lineage_edges
      WHEN NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.parent_version_id AND v.project_id=NEW.project_id)
        OR NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.child_version_id AND v.project_id=NEW.project_id)
      BEGIN SELECT RAISE(ABORT, 'lineage_project_mismatch'); END;

      CREATE TRIGGER staleness_project_guard_update
      BEFORE UPDATE OF project_id,stale_version_id,old_parent_version_id,new_parent_version_id ON staleness_events
      WHEN NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.stale_version_id AND v.project_id=NEW.project_id)
        OR NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.old_parent_version_id AND v.project_id=NEW.project_id)
        OR NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.id=NEW.new_parent_version_id AND v.project_id=NEW.project_id)
      BEGIN SELECT RAISE(ABORT, 'staleness_project_mismatch'); END;
    `,
  },
  {
    version: 6,
    name: "006_knowledge_engine_fts_memory",
    sql: `
      ALTER TABLE project_settings ADD COLUMN knowledge_enabled INTEGER NOT NULL DEFAULT 1
        CHECK (knowledge_enabled IN (0,1));

      CREATE TABLE knowledge_libraries (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK (scope IN ('GLOBAL','PROJECT')),
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
        description TEXT CHECK (description IS NULL OR length(description) <= 2000),
        domain TEXT NOT NULL DEFAULT 'GENERAL' CHECK (length(trim(domain)) BETWEEN 1 AND 80),
        category TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json) AND json_type(tags_json)='array'),
        priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
        is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK ((scope='GLOBAL' AND project_id IS NULL) OR (scope='PROJECT' AND project_id IS NOT NULL))
      ) STRICT;

      CREATE UNIQUE INDEX knowledge_libraries_global_name_unique
        ON knowledge_libraries(lower(name)) WHERE scope='GLOBAL';
      CREATE UNIQUE INDEX knowledge_libraries_project_name_unique
        ON knowledge_libraries(project_id, lower(name)) WHERE scope='PROJECT';
      CREATE INDEX knowledge_libraries_scope_project_idx
        ON knowledge_libraries(scope, project_id, is_enabled, priority DESC);

      CREATE TABLE project_knowledge_libraries (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        library_id TEXT NOT NULL REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
        is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
        priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
        selected_at TEXT NOT NULL,
        PRIMARY KEY(project_id, library_id)
      ) STRICT, WITHOUT ROWID;

      CREATE TABLE knowledge_documents (
        id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
        scope TEXT NOT NULL CHECK (scope IN ('GLOBAL','PROJECT')),
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        import_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
        description TEXT CHECK (description IS NULL OR length(description) <= 4000),
        document_type TEXT NOT NULL CHECK (document_type IN ('pdf','docx','txt','markdown','html','manual')),
        mime_type TEXT,
        original_filename TEXT,
        stored_relative_path TEXT,
        file_sha256 TEXT CHECK (file_sha256 IS NULL OR length(file_sha256)=64),
        byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
        category TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json) AND json_type(tags_json)='array'),
        original_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(original_metadata_json) AND json_type(original_metadata_json)='object'),
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','PROCESSING','READY','FAILED','NEEDS_OCR')),
        chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK ((scope='GLOBAL' AND project_id IS NULL) OR (scope='PROJECT' AND project_id IS NOT NULL)),
        CHECK (stored_relative_path IS NULL OR (stored_relative_path LIKE 'knowledge/%' AND instr(stored_relative_path,'..')=0 AND substr(stored_relative_path,1,1)<>'/'))
      ) STRICT;

      CREATE UNIQUE INDEX knowledge_documents_library_hash_unique
        ON knowledge_documents(library_id, file_sha256) WHERE file_sha256 IS NOT NULL;
      CREATE INDEX knowledge_documents_library_status_idx
        ON knowledge_documents(library_id, status, updated_at DESC);
      CREATE INDEX knowledge_documents_project_idx
        ON knowledge_documents(project_id, updated_at DESC) WHERE project_id IS NOT NULL;

      CREATE TABLE knowledge_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        library_id TEXT NOT NULL REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
        scope TEXT NOT NULL CHECK (scope IN ('GLOBAL','PROJECT')),
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
        title_text TEXT NOT NULL,
        heading TEXT,
        page_number INTEGER CHECK (page_number IS NULL OR page_number > 0),
        content_text TEXT NOT NULL CHECK (length(trim(content_text)) > 0),
        content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64),
        tags_text TEXT NOT NULL DEFAULT '',
        token_estimate INTEGER NOT NULL CHECK (token_estimate >= 0),
        previous_chunk_id TEXT REFERENCES knowledge_chunks(id) ON DELETE SET NULL,
        next_chunk_id TEXT REFERENCES knowledge_chunks(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        UNIQUE(document_id, chunk_index),
        CHECK ((scope='GLOBAL' AND project_id IS NULL) OR (scope='PROJECT' AND project_id IS NOT NULL))
      ) STRICT;

      CREATE INDEX knowledge_chunks_document_idx ON knowledge_chunks(document_id, chunk_index);
      CREATE INDEX knowledge_chunks_visibility_idx ON knowledge_chunks(scope, project_id, library_id);
      CREATE INDEX knowledge_chunks_hash_idx ON knowledge_chunks(content_sha256);

      CREATE VIRTUAL TABLE knowledge_chunks_fts USING fts5(
        title_text, heading, content_text, tags_text,
        content='knowledge_chunks', content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER knowledge_chunks_fts_insert AFTER INSERT ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_fts(rowid,title_text,heading,content_text,tags_text)
        VALUES(NEW.rowid,NEW.title_text,NEW.heading,NEW.content_text,NEW.tags_text);
      END;
      CREATE TRIGGER knowledge_chunks_fts_delete AFTER DELETE ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts,rowid,title_text,heading,content_text,tags_text)
        VALUES('delete',OLD.rowid,OLD.title_text,OLD.heading,OLD.content_text,OLD.tags_text);
      END;
      CREATE TRIGGER knowledge_chunks_fts_update AFTER UPDATE OF title_text,heading,content_text,tags_text ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts,rowid,title_text,heading,content_text,tags_text)
        VALUES('delete',OLD.rowid,OLD.title_text,OLD.heading,OLD.content_text,OLD.tags_text);
        INSERT INTO knowledge_chunks_fts(rowid,title_text,heading,content_text,tags_text)
        VALUES(NEW.rowid,NEW.title_text,NEW.heading,NEW.content_text,NEW.tags_text);
      END;
      CREATE TRIGGER knowledge_document_title_chunks_update AFTER UPDATE OF title ON knowledge_documents BEGIN
        UPDATE knowledge_chunks SET title_text=NEW.title WHERE document_id=NEW.id;
      END;

      CREATE TABLE approved_output_memory (
        id TEXT PRIMARY KEY,
        origin_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        artifact_version_id TEXT NOT NULL REFERENCES artifact_versions(id) ON DELETE CASCADE,
        generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
        artifact_type TEXT NOT NULL,
        disposition TEXT NOT NULL CHECK (disposition IN ('APPROVED','REJECTED')),
        visibility TEXT NOT NULL DEFAULT 'PROJECT' CHECK (visibility IN ('PROJECT','GLOBAL')),
        reusable INTEGER NOT NULL DEFAULT 0 CHECK (reusable IN (0,1)),
        preferred INTEGER NOT NULL DEFAULT 0 CHECK (preferred IN (0,1)),
        original_output_json TEXT NOT NULL CHECK (json_valid(original_output_json)),
        edited_output_json TEXT CHECK (edited_output_json IS NULL OR json_valid(edited_output_json)),
        search_text TEXT NOT NULL DEFAULT '',
        notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(artifact_version_id),
        CHECK (disposition='APPROVED' OR (reusable=0 AND preferred=0)),
        CHECK (reusable=1 OR preferred=0)
      ) STRICT;

      CREATE INDEX approved_output_memory_visibility_idx
        ON approved_output_memory(visibility, origin_project_id, disposition, reusable, updated_at DESC);

      CREATE VIRTUAL TABLE approved_output_memory_fts USING fts5(
        artifact_type, search_text,
        content='approved_output_memory', content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER approved_output_memory_fts_insert AFTER INSERT ON approved_output_memory BEGIN
        INSERT INTO approved_output_memory_fts(rowid,artifact_type,search_text)
        VALUES(NEW.rowid,NEW.artifact_type,NEW.search_text);
      END;
      CREATE TRIGGER approved_output_memory_fts_delete AFTER DELETE ON approved_output_memory BEGIN
        INSERT INTO approved_output_memory_fts(approved_output_memory_fts,rowid,artifact_type,search_text)
        VALUES('delete',OLD.rowid,OLD.artifact_type,OLD.search_text);
      END;
      CREATE TRIGGER approved_output_memory_fts_update AFTER UPDATE OF artifact_type,search_text ON approved_output_memory BEGIN
        INSERT INTO approved_output_memory_fts(approved_output_memory_fts,rowid,artifact_type,search_text)
        VALUES('delete',OLD.rowid,OLD.artifact_type,OLD.search_text);
        INSERT INTO approved_output_memory_fts(rowid,artifact_type,search_text)
        VALUES(NEW.rowid,NEW.artifact_type,NEW.search_text);
      END;

      CREATE TABLE knowledge_retrieval_logs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
        agent_key TEXT NOT NULL,
        query_text TEXT NOT NULL CHECK (length(trim(query_text)) > 0),
        policy_json TEXT NOT NULL CHECK (json_valid(policy_json) AND json_type(policy_json)='object'),
        selected_libraries_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(selected_libraries_json) AND json_type(selected_libraries_json)='array'),
        max_chunks INTEGER NOT NULL CHECK (max_chunks BETWEEN 0 AND 100),
        max_context_tokens INTEGER NOT NULL CHECK (max_context_tokens >= 0),
        context_token_estimate INTEGER NOT NULL DEFAULT 0 CHECK (context_token_estimate >= 0),
        embedding_provider TEXT NOT NULL DEFAULT 'disabled' CHECK (embedding_provider='disabled'),
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX knowledge_retrieval_logs_project_idx
        ON knowledge_retrieval_logs(project_id, created_at DESC);
      CREATE INDEX knowledge_retrieval_logs_generation_idx
        ON knowledge_retrieval_logs(generation_id) WHERE generation_id IS NOT NULL;

      CREATE TABLE knowledge_retrieval_items (
        id TEXT PRIMARY KEY,
        retrieval_log_id TEXT NOT NULL REFERENCES knowledge_retrieval_logs(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        knowledge_kind TEXT NOT NULL CHECK (knowledge_kind IN ('PROJECT_KNOWLEDGE','GLOBAL_KNOWLEDGE','APPROVED_MEMORY')),
        chunk_id TEXT REFERENCES knowledge_chunks(id) ON DELETE RESTRICT,
        memory_id TEXT REFERENCES approved_output_memory(id) ON DELETE RESTRICT,
        rank_position INTEGER NOT NULL CHECK (rank_position > 0),
        raw_score REAL NOT NULL,
        token_estimate INTEGER NOT NULL CHECK (token_estimate >= 0),
        citation_json TEXT NOT NULL CHECK (json_valid(citation_json) AND json_type(citation_json)='object'),
        created_at TEXT NOT NULL,
        UNIQUE(retrieval_log_id, rank_position),
        CHECK ((chunk_id IS NOT NULL AND memory_id IS NULL AND knowledge_kind IN ('PROJECT_KNOWLEDGE','GLOBAL_KNOWLEDGE')) OR
               (chunk_id IS NULL AND memory_id IS NOT NULL AND knowledge_kind='APPROVED_MEMORY'))
      ) STRICT;

      CREATE INDEX knowledge_retrieval_items_chunk_idx ON knowledge_retrieval_items(chunk_id) WHERE chunk_id IS NOT NULL;
      CREATE INDEX knowledge_retrieval_items_memory_idx ON knowledge_retrieval_items(memory_id) WHERE memory_id IS NOT NULL;

      CREATE TRIGGER project_knowledge_library_guard_insert BEFORE INSERT ON project_knowledge_libraries
      WHEN NOT EXISTS (
        SELECT 1 FROM knowledge_libraries library
        WHERE library.id=NEW.library_id AND (library.scope='GLOBAL' OR library.project_id=NEW.project_id)
      ) BEGIN SELECT RAISE(ABORT,'knowledge_library_project_mismatch'); END;
      CREATE TRIGGER project_knowledge_library_guard_update BEFORE UPDATE OF project_id,library_id ON project_knowledge_libraries
      WHEN NOT EXISTS (
        SELECT 1 FROM knowledge_libraries library
        WHERE library.id=NEW.library_id AND (library.scope='GLOBAL' OR library.project_id=NEW.project_id)
      ) BEGIN SELECT RAISE(ABORT,'knowledge_library_project_mismatch'); END;

      CREATE TRIGGER knowledge_document_library_guard_insert BEFORE INSERT ON knowledge_documents
      WHEN NOT EXISTS (
        SELECT 1 FROM knowledge_libraries library
        WHERE library.id=NEW.library_id AND library.scope=NEW.scope AND library.project_id IS NEW.project_id
      ) BEGIN SELECT RAISE(ABORT,'knowledge_document_library_mismatch'); END;
      CREATE TRIGGER knowledge_document_library_guard_update BEFORE UPDATE OF library_id,scope,project_id ON knowledge_documents
      WHEN NOT EXISTS (
        SELECT 1 FROM knowledge_libraries library
        WHERE library.id=NEW.library_id AND library.scope=NEW.scope AND library.project_id IS NEW.project_id
      ) BEGIN SELECT RAISE(ABORT,'knowledge_document_library_mismatch'); END;

      CREATE TRIGGER knowledge_chunk_document_guard_insert BEFORE INSERT ON knowledge_chunks
      WHEN NOT EXISTS (
        SELECT 1 FROM knowledge_documents document
        WHERE document.id=NEW.document_id AND document.library_id=NEW.library_id
          AND document.scope=NEW.scope AND document.project_id IS NEW.project_id
      ) BEGIN SELECT RAISE(ABORT,'knowledge_chunk_document_mismatch'); END;
      CREATE TRIGGER knowledge_chunk_document_guard_update BEFORE UPDATE OF document_id,library_id,scope,project_id ON knowledge_chunks
      WHEN NOT EXISTS (
        SELECT 1 FROM knowledge_documents document
        WHERE document.id=NEW.document_id AND document.library_id=NEW.library_id
          AND document.scope=NEW.scope AND document.project_id IS NEW.project_id
      ) BEGIN SELECT RAISE(ABORT,'knowledge_chunk_document_mismatch'); END;
      CREATE TRIGGER knowledge_chunk_neighbors_guard_insert BEFORE INSERT ON knowledge_chunks
      WHEN (NEW.previous_chunk_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM knowledge_chunks neighbor WHERE neighbor.id=NEW.previous_chunk_id AND neighbor.document_id=NEW.document_id))
        OR (NEW.next_chunk_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM knowledge_chunks neighbor WHERE neighbor.id=NEW.next_chunk_id AND neighbor.document_id=NEW.document_id))
      BEGIN SELECT RAISE(ABORT,'knowledge_chunk_neighbor_mismatch'); END;
      CREATE TRIGGER knowledge_chunk_neighbors_guard_update BEFORE UPDATE OF previous_chunk_id,next_chunk_id,document_id ON knowledge_chunks
      WHEN (NEW.previous_chunk_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM knowledge_chunks neighbor WHERE neighbor.id=NEW.previous_chunk_id AND neighbor.document_id=NEW.document_id))
        OR (NEW.next_chunk_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM knowledge_chunks neighbor WHERE neighbor.id=NEW.next_chunk_id AND neighbor.document_id=NEW.document_id))
      BEGIN SELECT RAISE(ABORT,'knowledge_chunk_neighbor_mismatch'); END;

      CREATE TRIGGER approved_output_memory_project_guard_insert BEFORE INSERT ON approved_output_memory
      WHEN NOT EXISTS (SELECT 1 FROM artifact_versions version WHERE version.id=NEW.artifact_version_id AND version.project_id=NEW.origin_project_id)
        OR (NEW.generation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM generations generation WHERE generation.id=NEW.generation_id AND generation.project_id=NEW.origin_project_id))
      BEGIN SELECT RAISE(ABORT,'approved_memory_project_mismatch'); END;
      CREATE TRIGGER approved_output_memory_project_guard_update BEFORE UPDATE OF origin_project_id,artifact_version_id,generation_id ON approved_output_memory
      WHEN NOT EXISTS (SELECT 1 FROM artifact_versions version WHERE version.id=NEW.artifact_version_id AND version.project_id=NEW.origin_project_id)
        OR (NEW.generation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM generations generation WHERE generation.id=NEW.generation_id AND generation.project_id=NEW.origin_project_id))
      BEGIN SELECT RAISE(ABORT,'approved_memory_project_mismatch'); END;

      CREATE TRIGGER knowledge_retrieval_generation_guard_insert BEFORE INSERT ON knowledge_retrieval_logs
      WHEN NEW.generation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM generations generation WHERE generation.id=NEW.generation_id AND generation.project_id=NEW.project_id)
      BEGIN SELECT RAISE(ABORT,'knowledge_retrieval_generation_mismatch'); END;
      CREATE TRIGGER knowledge_retrieval_generation_guard_update BEFORE UPDATE OF project_id,generation_id ON knowledge_retrieval_logs
      WHEN NEW.generation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM generations generation WHERE generation.id=NEW.generation_id AND generation.project_id=NEW.project_id)
      BEGIN SELECT RAISE(ABORT,'knowledge_retrieval_generation_mismatch'); END;

      CREATE TRIGGER knowledge_retrieval_item_guard_insert BEFORE INSERT ON knowledge_retrieval_items
      WHEN NOT EXISTS (SELECT 1 FROM knowledge_retrieval_logs log WHERE log.id=NEW.retrieval_log_id AND log.project_id=NEW.project_id)
        OR (NEW.chunk_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM knowledge_chunks chunk
          JOIN knowledge_libraries library ON library.id=chunk.library_id
          LEFT JOIN project_knowledge_libraries selected ON selected.library_id=library.id AND selected.project_id=NEW.project_id AND selected.is_enabled=1
          WHERE chunk.id=NEW.chunk_id AND ((chunk.scope='PROJECT' AND chunk.project_id=NEW.project_id) OR (chunk.scope='GLOBAL' AND selected.library_id IS NOT NULL))
        ))
        OR (NEW.memory_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM approved_output_memory memory WHERE memory.id=NEW.memory_id
            AND memory.disposition='APPROVED' AND memory.reusable=1
            AND (memory.origin_project_id=NEW.project_id OR memory.visibility='GLOBAL')
        ))
      BEGIN SELECT RAISE(ABORT,'knowledge_retrieval_item_project_mismatch'); END;
      CREATE TRIGGER knowledge_retrieval_item_guard_update BEFORE UPDATE OF retrieval_log_id,project_id,chunk_id,memory_id ON knowledge_retrieval_items
      WHEN NOT EXISTS (SELECT 1 FROM knowledge_retrieval_logs log WHERE log.id=NEW.retrieval_log_id AND log.project_id=NEW.project_id)
        OR (NEW.chunk_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM knowledge_chunks chunk
          JOIN knowledge_libraries library ON library.id=chunk.library_id
          LEFT JOIN project_knowledge_libraries selected ON selected.library_id=library.id AND selected.project_id=NEW.project_id AND selected.is_enabled=1
          WHERE chunk.id=NEW.chunk_id AND ((chunk.scope='PROJECT' AND chunk.project_id=NEW.project_id) OR (chunk.scope='GLOBAL' AND selected.library_id IS NOT NULL))
        ))
        OR (NEW.memory_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM approved_output_memory memory WHERE memory.id=NEW.memory_id
            AND memory.disposition='APPROVED' AND memory.reusable=1
            AND (memory.origin_project_id=NEW.project_id OR memory.visibility='GLOBAL')
        ))
      BEGIN SELECT RAISE(ABORT,'knowledge_retrieval_item_project_mismatch'); END;
    `,
  },
];

export const LATEST_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;
