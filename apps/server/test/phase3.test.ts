import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { ProjectSettingsRepository } from "../src/repositories/project-settings-repository.js";
import { ArtifactRepository } from "../src/repositories/artifact-repository.js";
import { WorkflowRepository } from "../src/repositories/workflow-repository.js";
import { KnowledgeRepository } from "../src/repositories/knowledge-repository.js";
import { SemanticVocabularyRepository } from "../src/repositories/semantic-vocabulary-repository.js";
import type { SemanticVocabularyRepository as VocabularyRepo } from "../src/repositories/semantic-vocabulary-repository.js";
import { FileExporterService } from "../src/services/file-exporter-service.js";
import { ModuleService } from "../src/services/module-service.js";
import {
  type ConceptInput,
  analysisSnapshotHash,
  analysisSnapshotHashFromRows,
  canonicalContentHash,
  researchFocusHash,
} from "../src/services/semantic-vocabulary.js";
import * as pqe from "../src/services/problem-quality-engine.js";

interface SeedRow {
  eid: string;
  cid: string;
  sid: string;
  quote: string;
}

const NOW = "2026-01-01T00:00:00.000Z";

function seedAnalysisSet(db: AppDatabase, projectId: string, rows: SeedRow[]): void {
  for (const row of rows) {
    db.connection
      .prepare(
        `INSERT INTO sources(id,project_id,source_type,title,status,raw_text,metadata_json,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(row.sid, projectId, "manual", `Source ${row.sid}`, "ready", "raw", "{}", NOW, NOW);
    db.connection
      .prepare(
        `INSERT INTO comments(id,project_id,source_id,platform_comment_id,author,text,likes,is_reply,is_demo,metadata_json,created_at,analysis_eligible,quality_score)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        row.cid,
        projectId,
        row.sid,
        `pc_${row.cid}`,
        "author",
        row.quote,
        0,
        0,
        0,
        "{}",
        NOW,
        1,
        100,
      );
    db.connection
      .prepare(
        `INSERT INTO evidence_snippets(id,project_id,source_id,comment_id,quote_text,provenance,created_at)
         VALUES(?,?,?,?,?,?,?)`,
      )
      .run(row.eid, projectId, row.sid, row.cid, row.quote, "EVIDENCE_BACKED", NOW);
  }
}

function buildModuleService(db: AppDatabase, vocabulary: VocabularyRepo): ModuleService {
  const dataRoot = mkdtempSync(join(tmpdir(), "phase3-"));
  return new ModuleService(
    db,
    new ArtifactRepository(db),
    new WorkflowRepository(db),
    new FileExporterService(db, dataRoot),
    new ProjectSettingsRepository(db),
    new KnowledgeRepository(db),
    vocabulary,
    { openAI: { configured: false } as never, gemini: { configured: false } as never },
  );
}

function latestProblemsGeneration(db: AppDatabase, projectId: string) {
  return db.connection
    .prepare(
      `SELECT id, agent_key, vocabulary_version_id FROM generations
       WHERE project_id=? AND agent_key='problems' ORDER BY created_at DESC LIMIT 1`,
    )
    .get(projectId) as {
    id: string;
    agent_key: string;
    vocabulary_version_id: string | null;
  };
}

/** Returns true if any evidence audit row references the given domain concept key. */
function auditReferencesConcept(output: Record<string, unknown>, conceptKey: string): boolean {
  const audit = output.analysisAudit as
    | { postMergeClusters?: Array<{ evidenceQuality: Array<{ semanticConceptsShared?: string[] }> }>; preMergeRejectedCandidates?: Array<{ evidenceQuality: Array<{ semanticConceptsShared?: string[] }> }> }
    | undefined;
  if (!audit) return false;
  const clusters = [...(audit.postMergeClusters ?? []), ...(audit.preMergeRejectedCandidates ?? [])];
  for (const cluster of clusters) {
    for (const quality of cluster.evidenceQuality ?? []) {
      if ((quality.semanticConceptsShared ?? []).includes(conceptKey)) return true;
    }
  }
  return false;
}

const FOCUS = " ruido  en  FOTOGRAFÍA  de  perros ";
const FOCUS_WRONG = "iluminacion en estudio";

describe("PHASE 3 — wire dynamic semantic vocabulary into Problems runtime", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const snapshotOf = (db: AppDatabase, projectId: string) =>
    db.connection
      .prepare(
        `SELECT e.id id, e.comment_id commentId, e.source_id sourceId, e.quote_text quoteText
         FROM evidence_snippets e
         JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id
         JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id
         WHERE e.project_id=? AND s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed')
         ORDER BY e.id ASC`,
      )
      .all(projectId) as unknown as SeedRow[];

  const realSnapshotHash = (db: AppDatabase, projectId: string) =>
    analysisSnapshotHash(db, projectId);

  const sampleRows = (tag: string): SeedRow[] => [
    { eid: `e1-${tag}`, cid: `c1-${tag}`, sid: `s1-${tag}`, quote: "Las fotos tienen mucho ruido digital molesto" },
    { eid: `e2-${tag}`, cid: `c2-${tag}`, sid: `s2-${tag}`, quote: "El ruido arruina la toma de la cámara" },
  ];

  const conceptInput: ConceptInput = {
    conceptKey: "ruido_digital",
    label: "Ruido digital",
    cohesionWeight: 1.2,
    aliases: [{ alias: "ruido" }, { alias: "ruido digital" }],
  };

  // TEST A — NO ACTIVE vocabulary => legacy exact behavior, generation link NULL.
  it("A: sin vocabulary ACTIVE completa con comportamiento legacy y link NULL", async () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const repository = new SemanticVocabularyRepository(db);
    const project = projects.create({ name: "Legacy", niche: "fotografía" });
    seedAnalysisSet(db, project.id, sampleRows(project.id));
    const service = buildModuleService(db, repository);

    const result = await service.run(project.id, "problems", "mock");
    const gen = latestProblemsGeneration(db, project.id);

    expect(gen.vocabulary_version_id).toBeNull();
    expect((result.outputData as Record<string, unknown>).analysisAudit).toBeDefined();
    expect(auditReferencesConcept(result.outputData as Record<string, unknown>, "ruido_digital")).toBe(false);
    db.close();
  });

  // TEST B — ACTIVE found => loaded, passed to engine, deterministic effect, generation link exact.
  it("B: vocabulary ACTIVE se carga, afecta deterministicamente y vincula la generacion", async () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const settings = new ProjectSettingsRepository(db);
    const repository = new SemanticVocabularyRepository(db);
    const project = projects.create({ name: "ConVocab", niche: "fotografía" });
    seedAnalysisSet(db, project.id, sampleRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const focusHash = researchFocusHash(FOCUS);
    const analysisHash = realSnapshotHash(db, project.id);
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: analysisHash,
      contentHash: canonicalContentHash([conceptInput]),
      concepts: [conceptInput],
    });
    repository.activateVocabularyVersion(version.id);
    const service = buildModuleService(db, repository);

    const result = await service.run(project.id, "problems", "mock");
    const gen = latestProblemsGeneration(db, project.id);

    expect(gen.vocabulary_version_id).toBe(version.id);
    expect(auditReferencesConcept(result.outputData as Record<string, unknown>, "ruido_digital")).toBe(true);
    db.close();
  });

  // TEST C — WRONG FOCUS => ACTIVE for same project/snapshot but different focus hash must NOT load.
  it("C: ACTIVE con researchFocus distinto NO se carga", async () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const settings = new ProjectSettingsRepository(db);
    const repository = new SemanticVocabularyRepository(db);
    const project = projects.create({ name: "WrongFocus", niche: "fotografía" });
    seedAnalysisSet(db, project.id, sampleRows(project.id));
    const focusHash = researchFocusHash(FOCUS);
    const analysisHash = realSnapshotHash(db, project.id);
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: analysisHash,
      contentHash: canonicalContentHash([conceptInput]),
      concepts: [conceptInput],
    });
    repository.activateVocabularyVersion(version.id);
    // Project uses a DIFFERENT focus => different researchFocusHash.
    settings.setResearchFocus(project.id, FOCUS_WRONG, "user");
    const service = buildModuleService(db, repository);

    const result = await service.run(project.id, "problems", "mock");
    const gen = latestProblemsGeneration(db, project.id);

    expect(gen.vocabulary_version_id).toBeNull();
    expect(auditReferencesConcept(result.outputData as Record<string, unknown>, "ruido_digital")).toBe(false);
    db.close();
  });

  // TEST D — WRONG SNAPSHOT => ACTIVE for same project/focus but different analysis set must NOT load.
  it("D: ACTIVE con analysis snapshot distinto NO se carga", async () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const settings = new ProjectSettingsRepository(db);
    const repository = new SemanticVocabularyRepository(db);
    const project = projects.create({ name: "WrongSnap", niche: "fotografía" });
    seedAnalysisSet(db, project.id, sampleRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const focusHash = researchFocusHash(FOCUS);
    // Store a deliberately WRONG analysis snapshot hash.
    repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: "SNAPSHOT-QUE-NO-COINCIDE",
      contentHash: canonicalContentHash([conceptInput]),
      concepts: [conceptInput],
    }).id;
    const service = buildModuleService(db, repository);

    const result = await service.run(project.id, "problems", "mock");
    const gen = latestProblemsGeneration(db, project.id);

    expect(gen.vocabulary_version_id).toBeNull();
    expect(auditReferencesConcept(result.outputData as Record<string, unknown>, "ruido_digital")).toBe(false);
    db.close();
  });

  // TEST E — MULTIPLE ACTIVE => deterministic (highest version) and historical generation intact.
  it("E: multiples ACTIVE resuelven deterministicamente y generacion historica queda intacta", async () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const settings = new ProjectSettingsRepository(db);
    const repository = new SemanticVocabularyRepository(db);
    const project = projects.create({ name: "MultiActive", niche: "fotografía" });
    seedAnalysisSet(db, project.id, sampleRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const focusHash = researchFocusHash(FOCUS);
    const analysisHash = realSnapshotHash(db, project.id);

    const v1 = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: analysisHash,
      contentHash: canonicalContentHash([{ conceptKey: "ruido_digital", label: "v1" }]),
      concepts: [{ conceptKey: "ruido_digital", label: "v1" }],
    });
    repository.activateVocabularyVersion(v1.id);

    const v2 = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: analysisHash,
      contentHash: canonicalContentHash([conceptInput]),
      concepts: [conceptInput],
    });
    repository.activateVocabularyVersion(v2.id);

    // Historical generation already linked to v1.
    const historicalId = "gen-historical-v1";
    db.connection
      .prepare(
        `INSERT INTO generations(id,project_id,agent_key,provider,model,status,created_at,vocabulary_version_id)
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(historicalId, project.id, "problems", "mock", "demo", "COMPLETED", NOW, v1.id);

    const service = buildModuleService(db, repository);
    await service.run(project.id, "problems", "mock");
    const gen = latestProblemsGeneration(db, project.id);

    expect(gen.vocabulary_version_id).toBe(v2.id);
    const historical = db.connection
      .prepare(`SELECT vocabulary_version_id FROM generations WHERE id=?`)
      .get(historicalId) as { vocabulary_version_id: string | null };
    expect(historical.vocabulary_version_id).toBe(v1.id);
    db.close();
  });

  // TEST F — PROJECT ISOLATION => vocabulary of project A never used by project B.
  it("F: aislamiento de proyecto, vocabulary A no se usa en B", async () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const settings = new ProjectSettingsRepository(db);
    const repository = new SemanticVocabularyRepository(db);
    const a = projects.create({ name: "A", niche: "fotografía" });
    const b = projects.create({ name: "B", niche: "fotografía" });
    seedAnalysisSet(db, a.id, sampleRows(a.id));
    seedAnalysisSet(db, b.id, sampleRows(b.id));
    settings.setResearchFocus(a.id, FOCUS, "user");
    settings.setResearchFocus(b.id, FOCUS, "user");
    const focusHash = researchFocusHash(FOCUS);
    const version = repository.createVocabularyVersion({
      projectId: a.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: realSnapshotHash(db, a.id),
      contentHash: canonicalContentHash([conceptInput]),
      concepts: [conceptInput],
    });
    repository.activateVocabularyVersion(version.id);
    const service = buildModuleService(db, repository);

    await service.run(b.id, "problems", "mock");
    const genB = latestProblemsGeneration(db, b.id);
    expect(genB.vocabulary_version_id).toBeNull();
    db.close();
  });

  // TEST G — SINGLE LOAD => repository.loadActiveVocabularySnapshot called exactly once per run.
  it("G: el vocabulary se carga una sola vez por corrida", async () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const settings = new ProjectSettingsRepository(db);
    const repository = new SemanticVocabularyRepository(db);
    const project = projects.create({ name: "SingleLoad", niche: "fotografía" });
    seedAnalysisSet(db, project.id, sampleRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const focusHash = researchFocusHash(FOCUS);
    const analysisHash = analysisSnapshotHash(db, project.id);
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: analysisHash,
      contentHash: canonicalContentHash([conceptInput]),
      concepts: [conceptInput],
    });
    repository.activateVocabularyVersion(version.id);

    // Counting wrapper that delegates to the real repository so the snapshot id is valid.
    let calls = 0;
    const countingRepo = {
      loadActiveVocabularySnapshot: (...args: Parameters<VocabularyRepo["loadActiveVocabularySnapshot"]>) => {
        calls += 1;
        return repository.loadActiveVocabularySnapshot(...args);
      },
    } as unknown as VocabularyRepo;
    const service = buildModuleService(db, countingRepo);

    await service.run(project.id, "problems", "mock");
    expect(calls).toBe(1);
    db.close();
  });

  // TEST H — EXACT SNAPSHOT => modifying the Analysis Set after vocabulary creation changes hash.
  it("H: modificar el Analysis Set despues cambia el hash y no reutiliza el vocabulary", async () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const settings = new ProjectSettingsRepository(db);
    const repository = new SemanticVocabularyRepository(db);
    const project = projects.create({ name: "ExactSnap", niche: "fotografía" });
    seedAnalysisSet(db, project.id, sampleRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const focusHash = researchFocusHash(FOCUS);
    const firstHash = realSnapshotHash(db, project.id);
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: firstHash,
      contentHash: canonicalContentHash([conceptInput]),
      concepts: [conceptInput],
    });
    repository.activateVocabularyVersion(version.id);
    const service = buildModuleService(db, repository);

    // First run: exact snapshot matches => loads v1.
    await service.run(project.id, "problems", "mock");
    expect(latestProblemsGeneration(db, project.id).vocabulary_version_id).toBe(version.id);

    // Mutate the Analysis Set (add a new evidence row) => new snapshot hash.
    seedAnalysisSet(db, project.id, [{ eid: "e3", cid: "c3", sid: "s3", quote: "Comentario nuevo sobre ruido" }]);
    const secondHash = realSnapshotHash(db, project.id);
    expect(secondHash).not.toBe(firstHash);

    await service.run(project.id, "problems", "mock");
    expect(latestProblemsGeneration(db, project.id).vocabulary_version_id).toBeNull();
    db.close();
  });

  // TEST I — MUTATION BETWEEN STEPS: qualityProblems debe usar el snapshot materializado A,
  // no re-consultar B después de que la DB cambie.
  it("I: mutation entre materializacion y qualityProblems usa el snapshot A, no B", async () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const settings = new ProjectSettingsRepository(db);
    const repository = new SemanticVocabularyRepository(db);
    const project = projects.create({ name: "Mutation", niche: "fotografía" });
    seedAnalysisSet(db, project.id, sampleRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const focusHash = researchFocusHash(FOCUS);

    // 1. Materialize snapshot A.
    const analysisSetA = pqe.analysisSetSnapshot(db, project.id);
    const hashA = analysisSnapshotHashFromRows(analysisSetA.rows);
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: hashA,
      contentHash: canonicalContentHash([conceptInput]),
      concepts: [conceptInput],
    });
    repository.activateVocabularyVersion(version.id);

    // 2. Mutate DB para crear Analysis Set B (añadimos evidencia nueva).
    seedAnalysisSet(db, project.id, [
      { eid: `e3-${project.id}`, cid: `c3-${project.id}`, sid: `s3-${project.id}`, quote: "Evidencia NUEVA que no existia en A" },
    ]);
    // Recomputar hash de B para confirmar que cambió.
    const analysisSetB = pqe.analysisSetSnapshot(db, project.id);
    const hashB = analysisSnapshotHashFromRows(analysisSetB.rows);
    expect(hashB).not.toBe(hashA);

    // 3. Ejecutar qualityProblems con snapshot A explícito + vocabulary de A.
    const vocabularySnapshot = repository.loadActiveVocabularySnapshot(project.id, focusHash, hashA);
    expect(vocabularySnapshot).not.toBeNull();
    const evidenceIdsA = analysisSetA.rows.map((r) => r.id);
    const raw = {
      schemaVersion: 1,
      items: analysisSetA.rows.map((row, idx) => ({
        id: `problem-${idx + 1}`,
        name: `Patrón observado ${idx + 1}`,
        summary: row.quoteText,
        category: "pain",
        evidenceIds: [row.id],
      })),
    };
    const output = pqe.qualityProblems(db, project.id, raw, {
      vocabularySnapshot,
      analysisSetSnapshot: analysisSetA,
    }) as Record<string, unknown>;

    // 4. El engine usó A: la evidencia nueva (e3) NO aparece en el audit.
    const allEvidenceIds = new Set<string>();
    const audit = output.analysisAudit as {
      postMergeClusters?: Array<{ evidenceIds?: string[] }>;
      preMergeRejectedCandidates?: Array<{ evidenceIds?: string[] }>;
    } | undefined;
    if (audit) {
      for (const cluster of [...(audit.postMergeClusters ?? []), ...(audit.preMergeRejectedCandidates ?? [])]) {
        for (const eid of cluster.evidenceIds ?? []) allEvidenceIds.add(eid);
      }
    }
    expect(allEvidenceIds.has(`e3-${project.id}`)).toBe(false);

    // 5. La vocabulary de A sí tuvo efecto determinista (alias "ruido" coincide en A).
    expect(auditReferencesConcept(output, "ruido_digital")).toBe(true);

    // 6. Provenance queda cubierta por los tests de ModuleService (B, E, H).
    db.close();
  });

  // TEST J — SINGLE MATERIALIZATION: analysisSetSnapshot se llama exactamente una vez por corrida.
  it("J: analysisSetSnapshot se materializa una sola vez por corrida de problems", async () => {
    const db = new AppDatabase(":memory:");
    const projects = new ProjectRepository(db);
    const settings = new ProjectSettingsRepository(db);
    const repository = new SemanticVocabularyRepository(db);
    const project = projects.create({ name: "SingleMat", niche: "fotografía" });
    seedAnalysisSet(db, project.id, sampleRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const focusHash = researchFocusHash(FOCUS);
    const analysisHash = analysisSnapshotHash(db, project.id);
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: analysisHash,
      contentHash: canonicalContentHash([conceptInput]),
      concepts: [conceptInput],
    });
    repository.activateVocabularyVersion(version.id);

    const spy = vi.spyOn(pqe, "analysisSetSnapshot");
    const service = buildModuleService(db, repository);

    await service.run(project.id, "problems", "mock");
    // ModuleService materializa una vez; qualityProblems recibe el snapshot explícito
    // y no vuelve a consultar, así que analysisSetSnapshot solo se llama 1 vez.
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    db.close();
  });
});
