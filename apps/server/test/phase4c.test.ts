import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LlmProvider } from "@our-platform/shared";

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
import { MockLLMProvider } from "../src/integrations/mock-llm-provider.js";
import {
  type ConceptInput,
  analysisSnapshotHash,
  canonicalContentHash,
  researchFocusHash,
} from "../src/services/semantic-vocabulary.js";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */

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

const photoRows = (tag: string): SeedRow[] => [
  { eid: `e1-${tag}`, cid: `c1-${tag}`, sid: `s1-${tag}`, quote: "Las fotos tienen mucho ruido digital molesto" },
  { eid: `e2-${tag}`, cid: `c2-${tag}`, sid: `s2-${tag}`, quote: "El ruido arruina la toma de la camara" },
  { eid: `e3-${tag}`, cid: `c3-${tag}`, sid: `s3-${tag}`, quote: "La tarjeta de memoria esta llena" },
  { eid: `e4-${tag}`, cid: `c4-${tag}`, sid: `s4-${tag}`, quote: "Los colores se ven apagados al exportar" },
  { eid: `e5-${tag}`, cid: `c5-${tag}`, sid: `s5-${tag}`, quote: "El software tarda al procesar archivos raw" },
  { eid: `e6-${tag}`, cid: `c6-${tag}`, sid: `s6-${tag}`, quote: "El programa se cierra al abrir muchas fotos" },
];

const FOCUS = "ruido digital en fotografia";
const FOCUS_WRONG = "iluminacion en estudio";

const ruidoConcept: ConceptInput = {
  conceptKey: "ruido_digital",
  label: "Ruido digital",
  cohesionWeight: 1,
  aliases: [{ alias: "ruido" }],
};

function ruidoProposal(evidenceIds: string[] = ["e1", "e2"]): unknown {
  return {
    concepts: [
      {
        label: "Ruido digital",
        definition: "Ruido de sensor en la imagen",
        aliases: ["ruido"],
        evidenceIds,
      },
    ],
  };
}

/** Photo proposal grounded on the REAL evidence ids of a seeded project. */
const photoProposalFor = (projectId: string) =>
  ruidoProposal([`e1-${projectId}`, `e2-${projectId}`]);

function countingProvider(provider: MockLLMProvider): LlmProvider & { getCount: () => number } {
  let count = 0;
  return {
    name: provider.name,
    generate: async <T,>(request: Parameters<MockLLMProvider["generate"]>[0]) => {
      count += 1;
      return provider.generate<T>(request as never);
    },
    getCount: () => count,
  };
}

const dirs: string[] = [];

function buildModuleService(
  db: AppDatabase,
  vocabulary: VocabularyRepo,
  discoveryProvider?: LlmProvider,
): ModuleService {
  const dataRoot = mkdtempSync(join(tmpdir(), "phase4c-"));
  dirs.push(dataRoot);
  return new ModuleService(
    db,
    new ArtifactRepository(db),
    new WorkflowRepository(db),
    new FileExporterService(db, dataRoot),
    new ProjectSettingsRepository(db),
    new KnowledgeRepository(db),
    vocabulary,
    {
      openAI: { configured: false } as never,
      gemini: { configured: false } as never,
      ...(discoveryProvider ? { discoveryProvider } : {}),
    },
  );
}

function latestProblemsGeneration(db: AppDatabase, projectId: string) {
  return db.connection
    .prepare(
      `SELECT id, agent_key, vocabulary_version_id FROM generations
       WHERE project_id=? AND agent_key='problems' ORDER BY created_at DESC LIMIT 1`,
    )
    .get(projectId) as { id: string; agent_key: string; vocabulary_version_id: string | null };
}

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

/* ------------------------------------------------------------------ */
/*  Suite                                                             */
/* ------------------------------------------------------------------ */

describe("PHASE 4C — safe dry-run, auto-activation and real problems wiring", () => {
  let db: AppDatabase;
  let projects: ProjectRepository;
  let settings: ProjectSettingsRepository;
  let vocabulary: VocabularyRepo;

  beforeEach(() => {
    db = new AppDatabase(":memory:");
    projects = new ProjectRepository(db);
    settings = new ProjectSettingsRepository(db);
    vocabulary = new SemanticVocabularyRepository(db);
  });

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    db.close();
  });

  /* ================================================================ */
  /*  TEST A — ACTIVE exact exists => discovery calls 0, uses ACTIVE  */
  /* ================================================================ */
  it("A: ACTIVE exacto evita discovery y se usa", async () => {
    const project = projects.create({ name: "A", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const focusHash = researchFocusHash(FOCUS);
    const snapshotHash = analysisSnapshotHash(db, project.id);
    const active = vocabulary.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: snapshotHash,
      contentHash: canonicalContentHash([ruidoConcept]),
      concepts: [ruidoConcept],
    });
    vocabulary.activateVocabularyVersion(active.id);

    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);

    const result = await service.run(project.id, "problems", "mock");
    const gen = latestProblemsGeneration(db, project.id);

    expect(provider.getCount()).toBe(0);
    expect(gen.vocabulary_version_id).toBe(active.id);
    expect(auditReferencesConcept(result.outputData as Record<string, unknown>, "ruido_digital")).toBe(true);
  });

  /* ================================================================ */
  /*  TEST B — no ACTIVE + valid candidate => PASS => activate + use   */
  /* ================================================================ */
  it("B: candidato valido pasa dry-run, queda ACTIVE y se usa", async () => {
    const project = projects.create({ name: "B", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");

    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);

    const result = await service.run(project.id, "problems", "mock");
    const gen = latestProblemsGeneration(db, project.id);

    // Exactly one discovery call when it is genuinely needed.
    expect(provider.getCount()).toBe(1);
    const active = db.connection
      .prepare(`SELECT id, status FROM semantic_vocabulary_versions WHERE project_id=? AND status='active'`)
      .get(project.id) as { id: string; status: string } | undefined;
    expect(active).toBeDefined();
    expect(active!.status).toBe("active");
    expect(gen.vocabulary_version_id).toBe(active!.id);

    const conceptKey = vocabulary.listConceptsWithAliases(active!.id)[0]!.concept.conceptKey;
    expect(conceptKey).toMatch(/^dom_/);
    expect(auditReferencesConcept(result.outputData as Record<string, unknown>, conceptKey)).toBe(true);
  });

  /* ================================================================ */
  /*  TEST F — provider failure => legacy CORE, generation NULL        */
  /* ================================================================ */
  it("F: fallo de provider -> legacy CORE, vocabulary NULL", async () => {
    const project = projects.create({ name: "F", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");

    const provider = countingProvider(
      new MockLLMProvider({
        strictFixtures: true,
        fixtures: {
          domain_vocabulary_discovery_output: () => {
            throw new Error("Provider timeout");
          },
        },
      }),
    );
    const service = buildModuleService(db, vocabulary, provider);

    const result = await service.run(project.id, "problems", "mock");
    const gen = latestProblemsGeneration(db, project.id);

    expect(gen.vocabulary_version_id).toBeNull();
    expect((result.outputData as Record<string, unknown>).analysisAudit).toBeDefined();
    const versions = db.connection
      .prepare(`SELECT id FROM semantic_vocabulary_versions WHERE project_id=?`)
      .all(project.id) as Array<{ id: string }>;
    expect(versions).toHaveLength(0);
  });

  /* ================================================================ */
  /*  TEST G — validator REJECTED => legacy CORE                      */
  /* ================================================================ */
  it("G: validator REJECTED -> legacy CORE", async () => {
    const project = projects.create({ name: "G", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");

    const provider = countingProvider(
      new MockLLMProvider({
        strictFixtures: true,
        fixtures: {
          domain_vocabulary_discovery_output: {
            concepts: [{ label: "Problema", aliases: ["ayuda"], evidenceIds: ["e1"] }],
          },
        },
      }),
    );
    const service = buildModuleService(db, vocabulary, provider);

    await service.run(project.id, "problems", "mock");
    const gen = latestProblemsGeneration(db, project.id);

    expect(gen.vocabulary_version_id).toBeNull();
    const versions = db.connection
      .prepare(`SELECT id FROM semantic_vocabulary_versions WHERE project_id=?`)
      .all(project.id) as Array<{ id: string }>;
    expect(versions).toHaveLength(0);
  });

  /* ================================================================ */
  /*  TEST H — wrong project candidate is never activated             */
  /* ================================================================ */
  it("H: candidate de otro proyecto nunca se activa", async () => {
    const a = projects.create({ name: "A", niche: "fotografía" });
    const b = projects.create({ name: "B", niche: "fotografía" });
    seedAnalysisSet(db, a.id, photoRows(a.id));
    seedAnalysisSet(db, b.id, photoRows(b.id));
    settings.setResearchFocus(a.id, FOCUS, "user");
    settings.setResearchFocus(b.id, FOCUS, "user");

    // A valid candidate for project B (would pass its own dry-run).
    const bFocusHash = researchFocusHash(FOCUS);
    const bSnapshotHash = analysisSnapshotHash(db, b.id);
    const bCandidate = vocabulary.createVocabularyVersion({
      projectId: b.id,
      researchFocus: FOCUS,
      researchFocusHash: bFocusHash,
      analysisSnapshotHash: bSnapshotHash,
      contentHash: canonicalContentHash([ruidoConcept]),
      concepts: [ruidoConcept],
    });

    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(a.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);
    await service.run(a.id, "problems", "mock");

    const bAfter = vocabulary.getVocabularyVersion(bCandidate.id);
    expect(bAfter!.status).toBe("candidate");
    const aGen = latestProblemsGeneration(db, a.id);
    expect(aGen.vocabulary_version_id).not.toBe(bCandidate.id);
  });

  /* ================================================================ */
  /*  TEST I — wrong focus candidate is never activated               */
  /* ================================================================ */
  it("I: candidate con focus equivocado nunca se activa", async () => {
    const project = projects.create({ name: "I", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const snapshotHash = analysisSnapshotHash(db, project.id);

    const wrongFocusCandidate = vocabulary.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS_WRONG,
      researchFocusHash: researchFocusHash(FOCUS_WRONG),
      analysisSnapshotHash: snapshotHash,
      contentHash: canonicalContentHash([ruidoConcept]),
      concepts: [ruidoConcept],
    });

    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);
    await service.run(project.id, "problems", "mock");

    expect(vocabulary.getVocabularyVersion(wrongFocusCandidate.id)!.status).toBe("candidate");
    const active = db.connection
      .prepare(`SELECT id FROM semantic_vocabulary_versions WHERE project_id=? AND status='active'`)
      .get(project.id) as { id: string } | undefined;
    expect(active).toBeDefined();
    expect(active!.id).not.toBe(wrongFocusCandidate.id);
  });

  /* ================================================================ */
  /*  TEST J — wrong snapshot candidate is never activated            */
  /* ================================================================ */
  it("J: candidate con snapshot equivocado nunca se activa", async () => {
    const project = projects.create({ name: "J", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");

    const wrongSnapshotCandidate = vocabulary.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: researchFocusHash(FOCUS),
      analysisSnapshotHash: "SNAPSHOT-QUE-NO-COINCIDE",
      contentHash: canonicalContentHash([ruidoConcept]),
      concepts: [ruidoConcept],
    });

    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);
    await service.run(project.id, "problems", "mock");

    expect(vocabulary.getVocabularyVersion(wrongSnapshotCandidate.id)!.status).toBe("candidate");
    const active = db.connection
      .prepare(`SELECT id FROM semantic_vocabulary_versions WHERE project_id=? AND status='active'`)
      .get(project.id) as { id: string } | undefined;
    expect(active).toBeDefined();
    expect(active!.id).not.toBe(wrongSnapshotCandidate.id);
  });

  /* ================================================================ */
  /*  TEST K — reusable exact candidate => 0 provider calls + activate */
  /* ================================================================ */
  it("K: candidate reusable exacto -> 0 llamadas provider -> dry-run -> activa", async () => {
    const project = projects.create({ name: "K", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const candidate = vocabulary.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: researchFocusHash(FOCUS),
      analysisSnapshotHash: analysisSnapshotHash(db, project.id),
      contentHash: canonicalContentHash([ruidoConcept]),
      concepts: [ruidoConcept],
    });

    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);
    await service.run(project.id, "problems", "mock");

    expect(provider.getCount()).toBe(0);
    expect(vocabulary.getVocabularyVersion(candidate.id)!.status).toBe("active");
    expect(latestProblemsGeneration(db, project.id).vocabulary_version_id).toBe(candidate.id);
  });

  /* ================================================================ */
  /*  TEST L — activation uses the exact candidate ID, not latest     */
  /* ================================================================ */
  it("L: activation usa el candidate ID exacto evaluado", async () => {
    const project = projects.create({ name: "L", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const tuple = { projectId: project.id, researchFocus: FOCUS, researchFocusHash: researchFocusHash(FOCUS), analysisSnapshotHash: analysisSnapshotHash(db, project.id) };
    const v1 = vocabulary.createVocabularyVersion({ ...tuple, contentHash: canonicalContentHash([ruidoConcept]), concepts: [ruidoConcept] });
    const v2 = vocabulary.createVocabularyVersion({ ...tuple, contentHash: canonicalContentHash([ruidoConcept]), concepts: [ruidoConcept] });

    const activateSpy = vi.spyOn(vocabulary, "activateVocabularyVersion");
    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);
    await service.run(project.id, "problems", "mock");

    // discover reuses the latest candidate for the exact tuple (v2); activation
    // is called with exactly that evaluated id and never v1.
    expect(activateSpy).toHaveBeenCalled();
    expect(activateSpy.mock.calls[0]![0]).toBe(v2.id);
    expect(vocabulary.getVocabularyVersion(v2.id)!.status).toBe("active");
    expect(vocabulary.getVocabularyVersion(v1.id)!.status).toBe("candidate");
    activateSpy.mockRestore();
  });

  /* ================================================================ */
  /*  TEST M — candidate v1 evaluated; a new v2 never steals activation */
  /* ================================================================ */
  it("M: candidate v1 evaluado; una v2 posterior no roba la activation", async () => {
    const project = projects.create({ name: "M", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const v1 = vocabulary.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: researchFocusHash(FOCUS),
      analysisSnapshotHash: analysisSnapshotHash(db, project.id),
      contentHash: canonicalContentHash([ruidoConcept]),
      concepts: [ruidoConcept],
    });

    const activateSpy = vi.spyOn(vocabulary, "activateVocabularyVersion");
    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);
    await service.run(project.id, "problems", "mock");

    // The run evaluated v1 (the only candidate at that moment) and activated it.
    expect(activateSpy.mock.calls[0]![0]).toBe(v1.id);
    expect(vocabulary.getVocabularyVersion(v1.id)!.status).toBe("active");
    activateSpy.mockRestore();

    // A newer candidate v2 appears afterwards (concurrent request) — the prior
    // run's exact-id activation must NOT have touched it.
    const v2 = vocabulary.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: researchFocusHash(FOCUS),
      analysisSnapshotHash: analysisSnapshotHash(db, project.id),
      contentHash: canonicalContentHash([ruidoConcept]),
      concepts: [ruidoConcept],
    });
    expect(vocabulary.getVocabularyVersion(v2.id)!.status).toBe("candidate");
    expect(vocabulary.getVocabularyVersion(v1.id)!.status).toBe("active");
  });

  /* ================================================================ */
  /*  TEST R — generation provenance = exact activated vocabulary id  */
  /* ================================================================ */
  it("R: provenance de generacion = id exacto del vocabulary activado", async () => {
    const project = projects.create({ name: "R", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);
    await service.run(project.id, "problems", "mock");

    const active = db.connection
      .prepare(`SELECT id FROM semantic_vocabulary_versions WHERE project_id=? AND status='active'`)
      .get(project.id) as { id: string } | undefined;
    const gen = latestProblemsGeneration(db, project.id);
    expect(gen.vocabulary_version_id).toBe(active!.id);
    const inputSnapshot = db.connection
      .prepare(`SELECT input_snapshot FROM generations WHERE id=?`)
      .get(gen.id) as { input_snapshot: string };
    const snapshot = JSON.parse(inputSnapshot.input_snapshot) as { vocabularyVersionId: string | null; vocabularyContentHash: string | null };
    expect(snapshot.vocabularyVersionId).toBe(active!.id);
    expect(snapshot.vocabularyContentHash).toBe(vocabulary.getVocabularyVersion(active!.id)!.contentHash);
  });

  /* ================================================================ */
  /*  TEST S — legacy fallback conserva el comportamiento previo       */
  /* ================================================================ */
  it("S: sin ACTIVE ni discovery, el comportamiento legacy se conserva", async () => {
    const project = projects.create({ name: "S", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const service = buildModuleService(db, vocabulary); // no discoveryProvider

    const result = await service.run(project.id, "problems", "mock");
    const gen = latestProblemsGeneration(db, project.id);

    expect(gen.vocabulary_version_id).toBeNull();
    expect((result.outputData as Record<string, unknown>).analysisAudit).toBeDefined();
    expect(auditReferencesConcept(result.outputData as Record<string, unknown>, "ruido_digital")).toBe(false);
  });

  /* ================================================================ */
  /*  TEST T — ACTIVE corrupto produce error explicito                */
  /* ================================================================ */
  it("T: ACTIVE corrupto (sin concepts) produce error explicito", async () => {
    const project = projects.create({ name: "T", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    vocabulary.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: researchFocusHash(FOCUS),
      analysisSnapshotHash: analysisSnapshotHash(db, project.id),
      contentHash: canonicalContentHash([]),
      status: "active",
      concepts: [],
    });

    const service = buildModuleService(db, vocabulary);
    await expect(service.run(project.id, "problems", "mock")).rejects.toThrow(/corruption/);
  });

  /* ================================================================ */
  /*  TEST U — multi-nicho photography/dogs/sales without hardcoded    */
  /* ================================================================ */
  it("U: multi-nicho sin conceptos hardcodeados en produccion", async () => {
    const photo = projects.create({ name: "Foto", niche: "fotografía" });
    seedAnalysisSet(db, photo.id, photoRows(photo.id));
    settings.setResearchFocus(photo.id, FOCUS, "user");

    const dogs = projects.create({ name: "Dogs", niche: "perros" });
    seedAnalysisSet(db, dogs.id, [
      { eid: "d1", cid: "dc1", sid: "ds1", quote: "Mi perro ladra cuando queda solo" },
      { eid: "d2", cid: "dc2", sid: "ds2", quote: "El ladrido empeora al salir de casa" },
      { eid: "d3", cid: "dc3", sid: "ds3", quote: "Come bien por las mananas" },
      { eid: "d4", cid: "dc4", sid: "ds4", quote: "Le gusta jugar en el parque" },
      { eid: "d5", cid: "dc5", sid: "ds5", quote: "Camina despacio en dias de lluvia" },
      { eid: "d6", cid: "dc6", sid: "ds6", quote: "Duerme mucho por la tarde" },
    ]);
    settings.setResearchFocus(dogs.id, "ladrido por separacion en perros", "user");

    const sales = projects.create({ name: "Sales", niche: "ventas" });
    seedAnalysisSet(db, sales.id, [
      { eid: "s1", cid: "sc1", sid: "ss1", quote: "El precio es demasiado alto" },
      { eid: "s2", cid: "sc2", sid: "ss2", quote: "No puedo pagarlo con mi presupuesto" },
      { eid: "s3", cid: "sc3", sid: "ss3", quote: "La entrega fue rapida" },
      { eid: "s4", cid: "sc4", sid: "ss4", quote: "El envio llego bien empaquetado" },
      { eid: "s5", cid: "sc5", sid: "ss5", quote: "El producto cumple lo prometido" },
      { eid: "s6", cid: "sc6", sid: "ss6", quote: "Recomiendo la compra" },
    ]);
    settings.setResearchFocus(sales.id, "objeciones de precio en ventas", "user");

    const photoProvider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(photo.id) } }),
    );
    const dogsProvider = countingProvider(
      new MockLLMProvider({
        strictFixtures: true,
        fixtures: {
          domain_vocabulary_discovery_output: {
            concepts: [{ label: "Ladrido por separacion", aliases: ["ladrido"], evidenceIds: ["d1", "d2"] }],
          },
        },
      }),
    );
    const salesProvider = countingProvider(
      new MockLLMProvider({
        strictFixtures: true,
        fixtures: {
          domain_vocabulary_discovery_output: {
            concepts: [{ label: "Objecion de precio", aliases: ["precio"], evidenceIds: ["s1", "s2"] }],
          },
        },
      }),
    );

    await buildModuleService(db, vocabulary, photoProvider).run(photo.id, "problems", "mock");
    await buildModuleService(db, vocabulary, dogsProvider).run(dogs.id, "problems", "mock");
    await buildModuleService(db, vocabulary, salesProvider).run(sales.id, "problems", "mock");

    for (const [pid, label] of [[photo.id, "ruido digital"], [dogs.id, "ladrido por separacion"], [sales.id, "objecion de precio"]] as const) {
      const active = db.connection
        .prepare(`SELECT id, project_id FROM semantic_vocabulary_versions WHERE project_id=? AND status='active'`)
        .get(pid) as { id: string; project_id: string } | undefined;
      expect(active).toBeDefined();
      expect(active!.project_id).toBe(pid);
      const concepts = vocabulary.listConceptsWithAliases(active!.id);
      expect(concepts[0]!.concept.conceptKey).toMatch(/^dom_/);
      expect(concepts[0]!.concept.label).toBe(label);
      expect(latestProblemsGeneration(db, pid).vocabulary_version_id).toBe(active!.id);
    }
  });

  /* ================================================================ */
  /*  TEST V — single discovery call when it is really needed          */
  /* ================================================================ */
  it("V: una sola llamada discovery cuando realmente hace falta", async () => {
    const project = projects.create({ name: "V", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);
    await service.run(project.id, "problems", "mock");
    expect(provider.getCount()).toBe(1);
  });

  /* ================================================================ */
  /*  TEST W — historical vocabulary versions remain intact            */
  /* ================================================================ */
  it("W: las versiones historicas permanecen intactas", async () => {
    const project = projects.create({ name: "W", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");

    // Run 1: discover + activate v1.
    const provider = countingProvider(
      new MockLLMProvider({ strictFixtures: true, fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) } }),
    );
    const service = buildModuleService(db, vocabulary, provider);
    await service.run(project.id, "problems", "mock");
    const v1 = db.connection
      .prepare(`SELECT id, version, content_hash, status FROM semantic_vocabulary_versions WHERE project_id=? AND status='active'`)
      .get(project.id) as { id: string; version: number; content_hash: string; status: string };
    expect(v1.status).toBe("active");

    // A new candidate v2 for the same tuple is created afterwards.
    const v2 = vocabulary.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: researchFocusHash(FOCUS),
      analysisSnapshotHash: analysisSnapshotHash(db, project.id),
      contentHash: canonicalContentHash([ruidoConcept]),
      concepts: [ruidoConcept],
    });
    expect(v2.version).toBe(v1.version + 1);
    expect(v2.status).toBe("candidate");

    // v1 record is untouched and the historical generation still links v1.
    const v1After = vocabulary.getVocabularyVersion(v1.id)!;
    expect(v1After.version).toBe(v1.version);
    expect(v1After.contentHash).toBe(v1.content_hash);
    expect(v1After.status).toBe("active");
    expect(latestProblemsGeneration(db, project.id).vocabulary_version_id).toBe(v1.id);
    expect(vocabulary.getVocabularyVersion(v2.id)!.status).toBe("candidate");
  });
});
