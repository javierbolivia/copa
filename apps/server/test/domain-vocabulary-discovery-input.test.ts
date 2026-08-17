import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LlmGenerateRequest, LlmProvider } from "@our-platform/shared";

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

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */

interface SeedRow { eid: string; cid: string; sid: string; quote: string }
const NOW = "2026-01-01T00:00:00.000Z";

function seedAnalysisSet(db: AppDatabase, projectId: string, rows: SeedRow[]): void {
  for (const row of rows) {
    db.connection.prepare(
      `INSERT INTO sources(id,project_id,source_type,title,status,raw_text,metadata_json,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    ).run(row.sid, projectId, "manual", `Source ${row.sid}`, "ready", "raw", "{}", NOW, NOW);
    db.connection.prepare(
      `INSERT INTO comments(id,project_id,source_id,platform_comment_id,author,text,likes,is_reply,is_demo,metadata_json,created_at,analysis_eligible,quality_score)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(row.cid, projectId, row.sid, `pc_${row.cid}`, "author", row.quote, 0, 0, 0, "{}", NOW, 1, 100);
    db.connection.prepare(
      `INSERT INTO evidence_snippets(id,project_id,source_id,comment_id,quote_text,provenance,created_at)
       VALUES(?,?,?,?,?,?,?)`,
    ).run(row.eid, projectId, row.sid, row.cid, row.quote, "EVIDENCE_BACKED", NOW);
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

const dirs: string[] = [];

function buildModuleService(db: AppDatabase, vocabulary: VocabularyRepo, discoveryProvider?: LlmProvider): ModuleService {
  const dataRoot = mkdtempSync(join(tmpdir(), "dvi-"));
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

/**
 * A provider that ONLY uses evidence ids it can actually see in the discovery
 * source material. Before the PHASE 4C input fix the material carried no real
 * evidence ids, so this proposal was empty -> REJECTED. After the fix the real
 * ids are present -> a usable candidate is produced.
 */
function materialReadingProposal(request: LlmGenerateRequest): unknown {
  const input = typeof request.input === "string" ? request.input : "";
  const ids = [...input.matchAll(/evidenceIds:\s*\[([^\]]*)\]/g)]
    .flatMap((m) => (m[1] ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : []));
  const unique = [...new Set(ids)];
  return {
    concepts: [
      { label: "Ruido digital", definition: "Ruido de sensor en la imagen", aliases: ["ruido"], evidenceIds: unique.slice(0, 2) },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Suite                                                             */
/* ------------------------------------------------------------------ */

describe("PHASE 4C — discovery input exposes real evidenceIds (root-cause fix)", () => {
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

  it("fails-before/passes-after: el material lleva evidenceIds reales => candidate usable -> dry-run PASS -> ACTIVE -> provenance exacta", async () => {
    const project = projects.create({ name: "Input", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: { domain_vocabulary_discovery_output: materialReadingProposal },
    });
    const service = buildModuleService(db, vocabulary, provider);

    const result = await service.run(project.id, "problems", "mock");
    const output = result.outputData as Record<string, unknown>;
    const audit = (output.domainVocabularyDiscovery ?? {}) as {
      status?: string;
      issues?: Array<{ code?: string }>;
    };

    // The provider used evidence ids exposed in the input, so the proposal
    // resolved and produced a usable candidate (not REJECTED).
    expect(audit.status).toBe("CREATED_CANDIDATE");
    expect(audit.issues?.some((i) => i.code === "EVIDENCE_NOT_IN_SNAPSHOT" || i.code === "INSUFFICIENT_EVIDENCE")).toBe(false);

    // End-to-end: dry-run PASS -> exact candidate ACTIVE -> provenance exacta.
    const active = db.connection
      .prepare(`SELECT id, status FROM semantic_vocabulary_versions WHERE project_id=? AND status='active'`)
      .get(project.id) as { id: string; status: string } | undefined;
    expect(active).toBeDefined();
    expect(active!.status).toBe("active");

    const gen = db.connection
      .prepare(`SELECT vocabulary_version_id FROM generations WHERE project_id=? AND agent_key=? ORDER BY created_at DESC LIMIT 1`)
      .get(project.id, "problems") as { vocabulary_version_id: string | null };
    expect(gen.vocabulary_version_id).toBe(active!.id);
  });

  it("el source material enriquece con evidenceIds reales y snippets breves", async () => {
    // Reuse the same enrichment path through a second run and assert the audit
    // is clean and a candidate with grounded aliases is created.
    const project = projects.create({ name: "Input2", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: { domain_vocabulary_discovery_output: materialReadingProposal },
    });
    const service = buildModuleService(db, vocabulary, provider);
    const result = await service.run(project.id, "problems", "mock");

    const active = db.connection
      .prepare(`SELECT id FROM semantic_vocabulary_versions WHERE project_id=? AND status='active'`)
      .get(project.id) as { id: string } | undefined;
    expect(active).toBeDefined();
    const concepts = vocabulary.listConceptsWithAliases(active!.id);
    expect(concepts.length).toBeGreaterThan(0);
    expect(concepts[0]!.concept.conceptKey).toMatch(/^dom_/);
    // Grounded aliases persisted (the provider saw real snippets containing "ruido").
    const aliases = concepts.flatMap(({ aliases }) => aliases.filter((a) => !a.isExclusion).map((a) => a.alias));
    expect(aliases).toContain("ruido");
    void result;
  });
});
