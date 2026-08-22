import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { AppDatabase } from "../src/database/database.js";
import { migrations } from "../src/database/migrations.js";
import { ArtifactRepository } from "../src/repositories/artifact-repository.js";
import { KnowledgeRepository } from "../src/repositories/knowledge-repository.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("Knowledge schema 6 y repository", () => {
  it("migra schema 5 conservando datos y crea FTS5", () => {
    const directory = mkdtempSync(join(tmpdir(), "knowledge-migration-"));
    directories.push(directory);
    const path = join(directory, "app.db");
    const legacy = new DatabaseSync(path);
    const now = new Date().toISOString();
    legacy.exec("PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,applied_at TEXT NOT NULL) STRICT;");
    for (const migration of migrations.filter((item) => item.version <= 5)) {
      legacy.exec(migration.sql);
      legacy.prepare("INSERT INTO schema_migrations VALUES(?,?,?)").run(migration.version, migration.name, now);
    }
    legacy.prepare(`INSERT INTO projects(id,name,niche,status,language,currency,created_at,updated_at)
      VALUES(?,?,?,'active','es','USD',?,?)`).run(
        "01912345-6789-7abc-8def-0123456789ab", "Legado", "Nicho", now, now,
      );
    legacy.close();
    // AppDatabase applies all missing migrations 1-6. A truly marked v5 database would
    // already contain tables 1-5; this minimal legacy fixture exercises the additive path.
    const db = new AppDatabase(path);
    expect(db.getSchemaVersion()).toBe(11);
    expect(db.connection.prepare("SELECT name FROM projects").get()).toMatchObject({ name: "Legado" });
    expect(db.connection.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='knowledge_chunks_fts'").get()).toMatchObject({ ok: 1 });
    expect(db.connection.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
    db.close();
  });

  it("busca frases, rankea, pagina y sincroniza update/delete en FTS", () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const knowledge = new KnowledgeRepository(db);
    const project = projects.create({ name: "A", niche: "N" });
    const library = knowledge.createLibrary({ scope: "PROJECT", projectId: project.id, name: "Privada" });
    const document = knowledge.createDocument({ libraryId: library.id, title: "Oferta", documentType: "markdown" });
    knowledge.replaceChunks(document.id, [
      { content: "La propuesta de valor clara conecta problema y resultado." },
      { content: "Una propuesta comercial requiere prueba y claridad." },
      { content: "Texto de relleno sin las palabras objetivo." },
    ]);
    expect(knowledge.search({ projectId: project.id, query: '"propuesta de valor"' })).toHaveLength(1);
    const firstPage = knowledge.search({ projectId: project.id, query: "propuesta", limit: 1, offset: 0 });
    const secondPage = knowledge.search({ projectId: project.id, query: "propuesta", limit: 1, offset: 1 });
    expect(firstPage).toHaveLength(1);
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0]?.chunkId).not.toBe(firstPage[0]?.chunkId);
    const target = knowledge.search({ projectId: project.id, query: '"propuesta de valor"' })[0]!;
    db.connection.prepare("UPDATE knowledge_chunks SET content_text='Sin coincidencia léxica.' WHERE id=?").run(target.chunkId);
    expect(knowledge.search({ projectId: project.id, query: '"propuesta de valor"' })).toHaveLength(0);
    const commercial = knowledge.search({ projectId: project.id, query: '"propuesta comercial"' })[0]!;
    db.connection.prepare("DELETE FROM knowledge_chunks WHERE id=?").run(commercial.chunkId);
    expect(knowledge.search({ projectId: project.id, query: '"propuesta comercial"' })).toHaveLength(0);
    knowledge.checkFtsIntegrity();
    db.close();
  });

  it("aísla proyecto, exige selección global y excluye memoria rechazada", () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const artifacts = new ArtifactRepository(db);
    const knowledge = new KnowledgeRepository(db);
    const a = projects.create({ name: "A", niche: "N" });
    const b = projects.create({ name: "B", niche: "N" });
    const privateLibrary = knowledge.createLibrary({ scope: "PROJECT", projectId: a.id, name: "A privada" });
    const privateDocument = knowledge.createDocument({ libraryId: privateLibrary.id, title: "Secreto", documentType: "manual" });
    knowledge.replaceChunks(privateDocument.id, [{ content: "estrategia ultravioleta privada" }]);
    const globalLibrary = knowledge.createLibrary({ scope: "GLOBAL", name: "Marketing" });
    const globalDocument = knowledge.createDocument({ libraryId: globalLibrary.id, title: "Global", documentType: "manual" });
    knowledge.replaceChunks(globalDocument.id, [{ content: "estrategia ultravioleta global" }]);
    expect(knowledge.search({ projectId: b.id, query: "ultravioleta" })).toEqual([]);
    knowledge.selectLibrary(b.id, globalLibrary.id, true);
    expect(knowledge.search({ projectId: b.id, query: "ultravioleta" }).map((hit) => hit.scope)).toEqual(["GLOBAL"]);

    const artifactA = artifacts.createVersion({ projectId: a.id, artifactType: "offer", name: "Oferta", inputSnapshot: {}, outputData: { promise: "resultado ultravioleta" } });
    const artifactB = artifacts.createVersion({ projectId: b.id, artifactType: "offer", name: "Oferta", inputSnapshot: {}, outputData: { promise: "rechazo ultravioleta" } });
    knowledge.saveMemoryDecision({ originProjectId: a.id, artifactVersionId: artifactA.id, disposition: "APPROVED", visibility: "GLOBAL", reusable: true });
    knowledge.saveMemoryDecision({ originProjectId: b.id, artifactVersionId: artifactB.id, disposition: "REJECTED", visibility: "PROJECT", reusable: true });
    expect(knowledge.searchMemory(b.id, "ultravioleta")).toHaveLength(1);
    expect(knowledge.searchMemory(b.id, "ultravioleta")[0]?.approvalStatus).toBe("APPROVED");
    expect(() => knowledge.selectLibrary(b.id, privateLibrary.id, true)).toThrow(/knowledge_library_project_mismatch/);
    db.close();
  });

  it("persiste logs/items con aislamiento y embedding deshabilitado", () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const knowledge = new KnowledgeRepository(db);
    const project = projects.create({ name: "A", niche: "N" });
    const library = knowledge.createLibrary({ scope: "PROJECT", projectId: project.id, name: "Privada" });
    const document = knowledge.createDocument({ libraryId: library.id, title: "Notas", documentType: "txt" });
    knowledge.replaceChunks(document.id, [{ content: "contexto recuperable" }]);
    const hit = knowledge.search({ projectId: project.id, query: "recuperable" })[0]!;
    const logId = knowledge.createRetrievalLog({
      projectId: project.id, agentKey: "product-builder", query: "recuperable",
      policy: { evidence: "HIGH", knowledge: "HIGH" }, selectedLibraryIds: [library.id],
      maxChunks: 5, maxContextTokens: 1200, contextTokenEstimate: 6,
      items: [{ kind: hit.kind, chunkId: hit.chunkId, rawScore: hit.rawScore, tokenEstimate: 6,
        citation: { documentId: hit.documentId, title: hit.title } }],
    });
    expect(db.connection.prepare("SELECT embedding_provider FROM knowledge_retrieval_logs WHERE id=?").get(logId)).toMatchObject({ embedding_provider: "disabled" });
    expect(db.connection.prepare("SELECT count(*) count FROM knowledge_retrieval_items WHERE retrieval_log_id=?").get(logId)).toMatchObject({ count: 1 });
    expect(db.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
  });
});
