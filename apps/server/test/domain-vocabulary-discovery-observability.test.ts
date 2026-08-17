import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
const photoProposalFor = (projectId: string) => ({
  concepts: [
    { label: "Ruido digital", definition: "Ruido de sensor", aliases: ["ruido"], evidenceIds: [`e1-${projectId}`, `e2-${projectId}`] },
  ],
});

const dirs: string[] = [];

function buildModuleService(db: AppDatabase, vocabulary: VocabularyRepo, discoveryProvider?: LlmProvider): ModuleService {
  const dataRoot = mkdtempSync(join(tmpdir(), "obs-"));
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

type DiscoveryAudit = {
  status?: string;
  sourceItemCount?: number;
  vocabularyVersionId?: string;
  validationStatus?: string;
  issues?: Array<{ code?: string; message?: string }>;
  statistics?: { totalConcepts?: number; validConcepts?: number; rejectedConcepts?: number };
  provider?: { provider?: string | null; model?: string | null };
};

/* ------------------------------------------------------------------ */
/*  Suite                                                             */
/* ------------------------------------------------------------------ */

describe("PHASE 4C — domain vocabulary discovery observability", () => {
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

  const setup = async (provider: LlmProvider) => {
    const project = projects.create({ name: "Obs", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const service = buildModuleService(db, vocabulary, provider);
    return { project, result: await service.run(project.id, "problems", "mock") };
  };

  const audit = (result: { outputData: unknown }): DiscoveryAudit =>
    ((result.outputData as Record<string, unknown>).domainVocabularyDiscovery ?? {}) as DiscoveryAudit;

  /* ================================================================ */
  /*  TEST A — PROVIDER_FAILED surfaces a safe issue in the output     */
  /* ================================================================ */
  it("A: PROVIDER_FAILED aparece en el audit con issue seguro", async () => {
    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: () => {
          throw new Error("Gemini http_error status=429: AIzaSyFAKEKEY1234567890ABCDEF rate limited");
        },
      },
    });
    const { result } = await setup(provider);
    const a = audit(result);
    expect(a.status).toBe("PROVIDER_FAILED");
    expect(a.provider?.provider).toBe("mock");
    expect(a.provider?.model).toBeDefined();
    expect(Array.isArray(a.issues)).toBe(true);
    expect(a.issues!.some((i) => i.code === "PROVIDER_ERROR")).toBe(true);
    expect(a.issues![0]!.message).toContain("[redacted]");
  });

  /* ================================================================ */
  /*  TEST B — REJECTED surfaces validationStatus/issues/statistics     */
  /* ================================================================ */
  it("B: REJECTED expone validationStatus/issues/statistics", async () => {
    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: {
          concepts: [{ label: "Problema", aliases: ["ayuda"], evidenceIds: ["e1"] }],
        },
      },
    });
    const { result } = await setup(provider);
    const a = audit(result);
    expect(a.status).toBe("REJECTED");
    expect(a.validationStatus).toBe("REJECTED");
    expect(Array.isArray(a.issues)).toBe(true);
    expect(typeof a.statistics?.totalConcepts).toBe("number");
  });

  /* ================================================================ */
  /*  TEST C — CREATED_CANDIDATE exposes the candidate id              */
  /* ================================================================ */
  it("C: CREATED_CANDIDATE expone el candidate id", async () => {
    const project = projects.create({ name: "ObsC", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const service = buildModuleService(
      db,
      vocabulary,
      new MockLLMProvider({
        strictFixtures: true,
        fixtures: { domain_vocabulary_discovery_output: photoProposalFor(project.id) },
      }),
    );
    const result = await service.run(project.id, "problems", "mock");
    const a = audit(result);
    expect(["CREATED_CANDIDATE", "REUSED_CANDIDATE"]).toContain(a.status);
    expect(a.vocabularyVersionId).toBeDefined();
    expect(a.sourceItemCount).toBeGreaterThan(0);
  });

  /* ================================================================ */
  /*  TEST D — no API keys / secrets / raw prompt in the audit         */
  /* ================================================================ */
  it("D: el audit no expone keys, secretos ni prompt raw", async () => {
    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: () => {
          throw new Error("Bearer sk-SECRETKEY12345678901234 AIzaSyANOTHERFAKEKEY876543210987 status=429");
        },
      },
    });
    const { result } = await setup(provider);
    const a = audit(result);
    const serialized = JSON.stringify(a);
    expect(serialized).not.toContain("sk-SECRETKEY12345678901234");
    expect(serialized).not.toContain("AIzaSyANOTHERFAKEKEY876543210987");
    expect(serialized).toContain("[redacted]");
    // Estructural: el audit nunca lleva campos de prompt/instructions.
    expect(Object.keys(a)).not.toContain("prompt");
    expect(Object.keys(a)).not.toContain("instructions");
    expect(Object.keys(a.provider ?? {})).not.toContain("promptVersion");
  });

  /* ================================================================ */
  /*  TEST E — fallback CORE sigue funcionando sin discovery           */
  /* ================================================================ */
  it("E: sin discovery el fallback CORE se conserva y no expone audit", async () => {
    const project = projects.create({ name: "Legacy", niche: "fotografía" });
    seedAnalysisSet(db, project.id, photoRows(project.id));
    settings.setResearchFocus(project.id, FOCUS, "user");
    const service = buildModuleService(db, vocabulary); // no discoveryProvider

    const result = await service.run(project.id, "problems", "mock");
    const output = result.outputData as Record<string, unknown>;
    expect(output.domainVocabularyDiscovery).toBeUndefined();
    expect(output.analysisAudit).toBeDefined();
    const gen = db.connection
      .prepare(`SELECT vocabulary_version_id FROM generations WHERE project_id=? AND agent_key=? ORDER BY created_at DESC LIMIT 1`)
      .get(project.id, "problems") as { vocabulary_version_id: string | null };
    expect(gen.vocabulary_version_id).toBeNull();
  });
});
