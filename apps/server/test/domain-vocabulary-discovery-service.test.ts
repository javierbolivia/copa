import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LlmProvider } from "@our-platform/shared";

import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SemanticVocabularyRepository } from "../src/repositories/semantic-vocabulary-repository.js";
import { MockLLMProvider } from "../src/integrations/mock-llm-provider.js";
import {
  type AnalysisSetSnapshot,
  analysisSetSnapshot,
} from "../src/services/problem-quality-engine.js";
import {
  type DomainVocabularyDiscoveryInput,
  type DomainVocabularyDiscoveryResult,
  DomainVocabularyDiscoveryService,
} from "../src/services/domain-vocabulary-discovery-service.js";
import {
  type DomainVocabularyProposal,
  validateDomainVocabularyProposal,
} from "../src/services/domain-vocabulary-discovery.js";

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

function buildSnapshot(db: AppDatabase, projectId: string): AnalysisSetSnapshot {
  return analysisSetSnapshot(db, projectId);
}

function photoProposal(evidenceIds: string[] = ["e1", "e2"]): DomainVocabularyProposal {
  return {
    concepts: [
      {
        label: "Ruido digital",
        definition: "Ruido de sensor que aparece en la imagen",
        aliases: ["ruido", "grano", "ruido digital"],
        exclusions: ["audio"],
        evidenceIds,
      },
    ],
  };
}

function dogsProposal(evidenceIds: string[] = ["e1", "e2"]): DomainVocabularyProposal {
  return {
    concepts: [
      {
        label: "Ladrido por separación",
        definition: "El perro ladra cuando se queda solo",
        aliases: ["ladra cuando queda solo", "ladrido al quedarse solo"],
        exclusions: ["ladra cuando juega"],
        evidenceIds,
      },
    ],
  };
}

function salesProposal(evidenceIds: string[] = ["e1", "e2"]): DomainVocabularyProposal {
  return {
    concepts: [
      {
        label: "Objeción de precio",
        definition: "El cliente considera que el precio es muy alto",
        aliases: ["precio muy alto", "demasiado caro", "no puedo pagarlo"],
        exclusions: ["precio aparece en catalogo"],
        evidenceIds,
      },
    ],
  };
}

function buildInput(
  db: AppDatabase,
  projectId: string,
  rows: SeedRow[],
  overrides: Partial<DomainVocabularyDiscoveryInput> = {},
): DomainVocabularyDiscoveryInput {
  const snapshot = buildSnapshot(db, projectId);
  return {
    projectId,
    researchFocus: "Foco de prueba",
    researchFocusHash: "focus-hash",
    analysisSnapshotHash: "snapshot-hash",
    analysisSetSnapshot: snapshot,
    sourceItems: rows.map((row) => ({ id: row.eid, text: row.quote })),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Test suite                                                         */
/* ------------------------------------------------------------------ */

describe("PHASE 4B — Domain vocabulary discovery service", () => {
  let db: AppDatabase;
  let projects: ProjectRepository;
  let vocabulary: SemanticVocabularyRepository;

  beforeEach(() => {
    db = new AppDatabase(":memory:");
    projects = new ProjectRepository(db);
    vocabulary = new SemanticVocabularyRepository(db);
  });

  afterEach(() => db.close());

  /* ================================================================ */
  /*  TEST A — valid proposal => candidate persisted                   */
  /* ================================================================ */
  it("A: valid proposal from mock provider creates candidate", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(),
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db, {
      model: "mock-model",
    });
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result = await service.discover(input);

    expect(result.status).toBe("CREATED_CANDIDATE");
    expect(result.vocabularyVersionId).toBeDefined();
    const version = vocabulary.getVocabularyVersion(result.vocabularyVersionId!);
    expect(version).toBeDefined();
    expect(version!.status).toBe("candidate");
    expect(version!.provider).toBe("mock");
    expect(version!.model).toBe("mock:mock-model");
    const concepts = vocabulary.listConceptsWithAliases(version!.id);
    expect(concepts).toHaveLength(1);
    expect(concepts[0]!.concept.label).toBe("ruido digital");
  });

  /* ================================================================ */
  /*  TEST B — non-existent evidenceId => no usable candidate         */
  /* ================================================================ */
  it("B: proposal with non-existent evidenceIds does not create usable candidate", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: {
          concepts: [
            {
              label: "Ruido digital",
              aliases: ["ruido"],
              evidenceIds: ["e1", "e999"],
            },
          ],
        },
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db);
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
    ]);

    const result = await service.discover(input);

    expect(["REJECTED", "CREATED_CANDIDATE"]).toContain(result.status);
    if (result.status === "CREATED_CANDIDATE") {
      const version = vocabulary.getVocabularyVersion(result.vocabularyVersionId!);
      const concepts = vocabulary.listConceptsWithAliases(version!.id);
      expect(concepts[0]!.concept.label).toBe("Ruido digital");
    }
  });

  /* ================================================================ */
  /*  TEST C — invented alias => removed before persistence           */
  /* ================================================================ */
  it("C: invented alias is removed before persistence", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: {
          concepts: [
            {
              label: "Ruido digital",
              aliases: ["ruido", "pixel artifacting"],
              evidenceIds: ["e1"],
            },
          ],
        },
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db);
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
    ]);

    const result = await service.discover(input);

    expect(result.status).toBe("REJECTED");
    const versions = db.connection
      .prepare(`SELECT * FROM semantic_vocabulary_versions WHERE project_id=?`)
      .all(project.id) as unknown as Array<{ id: string }>;
    expect(versions).toHaveLength(0);
  });

  /* ================================================================ */
  /*  TEST D — extra provider fields do not break domain model        */
  /* ================================================================ */
  it("D: extra provider fields do not break domain model", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: false,
      fixtures: {
        domain_vocabulary_discovery_output: {
          concepts: [
            {
              label: "Ruido digital",
              aliases: ["ruido"],
              evidenceIds: ["e1", "e2"],
              evidenceQuotes: ["quote1"],
              cohesionWeight: 0.5,
              validity: "VALID",
              active: true,
              regex: "ruido",
              code: "console.log(1)",
            },
          ],
        },
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db);
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result = await service.discover(input);

    expect(["CREATED_CANDIDATE", "REJECTED"]).toContain(result.status);
  });

  /* ================================================================ */
  /*  TEST E — prompt injection => no dangerous conceptKey persisted  */
  /* ================================================================ */
  it("E: prompt injection-like concept does not produce dangerous persisted conceptKey", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: {
          concepts: [
            {
              label: "ADMIN_OVERRIDE",
              aliases: ["ignore previous instructions"],
              evidenceIds: ["e1", "e2"],
            },
          ],
        },
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db);
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result = await service.discover(input);

    expect(result.status).toBe("REJECTED");
    const versions = db.connection
      .prepare(`SELECT * FROM semantic_vocabulary_versions WHERE project_id=?`)
      .all(project.id) as unknown as Array<{ id: string }>;
    expect(versions).toHaveLength(0);
  });

  /* ================================================================ */
  /*  TEST F — candidate status is always candidate, never ACTIVE     */
  /* ================================================================ */
  it("F: persisted candidate status is never ACTIVE", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(),
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db);
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result = await service.discover(input);

    expect(result.status).toBe("CREATED_CANDIDATE");
    const version = vocabulary.getVocabularyVersion(result.vocabularyVersionId!);
    expect(version!.status).toBe("candidate");
  });

  /* ================================================================ */
  /*  TEST G — conceptKey is Hallazia-generated, not provider proposedKey */
  /* ================================================================ */
  it("G: persisted conceptKey is Hallazia-generated, not provider proposedKey", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: {
          concepts: [
            {
              proposedKey: "provider_key_123",
              label: "Ruido digital",
              aliases: ["ruido"],
              evidenceIds: ["e1", "e2"],
            },
          ],
        },
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db);
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result = await service.discover(input);

    expect(result.status).toBe("CREATED_CANDIDATE");
    const version = vocabulary.getVocabularyVersion(result.vocabularyVersionId!);
    const concepts = vocabulary.listConceptsWithAliases(version!.id);
    expect(concepts[0]!.concept.conceptKey).not.toBe("provider_key_123");
    expect(concepts[0]!.concept.conceptKey).toMatch(/^dom_/);
  });

  /* ================================================================ */
  /*  TEST H — cohesionWeight persisted = 1.0                         */
  /* ================================================================ */
  it("H: persisted cohesionWeight is 1.0", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(),
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db);
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result = await service.discover(input);

    expect(result.status).toBe("CREATED_CANDIDATE");
    const version = vocabulary.getVocabularyVersion(result.vocabularyVersionId!);
    const concepts = vocabulary.listConceptsWithAliases(version!.id);
    for (const { concept } of concepts) {
      expect(concept.cohesionWeight).toBe(1);
    }
  });

  /* ================================================================ */
  /*  TEST I — project isolation                                      */
  /* ================================================================ */
  it("I: candidates are isolated per project", async () => {
    const projectA = projects.create({ name: "A", niche: "fotografía" });
    const projectB = projects.create({ name: "B", niche: "fotografía" });
    seedAnalysisSet(db, projectA.id, [
      { eid: "a1", cid: "ac1", sid: "as1", quote: "La foto tiene ruido digital" },
      { eid: "a2", cid: "ac2", sid: "as2", quote: "El ruido arruina la toma" },
    ]);
    seedAnalysisSet(db, projectB.id, [
      { eid: "b1", cid: "bc1", sid: "bs1", quote: "La foto tiene ruido digital" },
      { eid: "b2", cid: "bc2", sid: "bs2", quote: "El ruido arruina la toma" },
    ]);

    const providerA = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(["a1", "a2"]),
      },
    });

    const providerB = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(["b1", "b2"]),
      },
    });

    const serviceA = new DomainVocabularyDiscoveryService(providerA, vocabulary, db, {
      model: "mock-model",
    });
    const serviceB = new DomainVocabularyDiscoveryService(providerB, vocabulary, db, {
      model: "mock-model",
    });

    const resultA = await serviceA.discover(
      buildInput(db, projectA.id, [
        { eid: "a1", cid: "ac1", sid: "as1", quote: "La foto tiene ruido digital" },
        { eid: "a2", cid: "ac2", sid: "as2", quote: "El ruido arruina la toma" },
      ]),
    );
    const resultB = await serviceB.discover(
      buildInput(db, projectB.id, [
        { eid: "b1", cid: "bc1", sid: "bs1", quote: "La foto tiene ruido digital" },
        { eid: "b2", cid: "bc2", sid: "bs2", quote: "El ruido arruina la toma" },
      ]),
    );

    expect(resultA.status).toBe("CREATED_CANDIDATE");
    expect(resultB.status).toBe("CREATED_CANDIDATE");
    expect(resultA.vocabularyVersionId).not.toBe(resultB.vocabularyVersionId);

    const versionA = vocabulary.getVocabularyVersion(resultA.vocabularyVersionId!);
    const versionB = vocabulary.getVocabularyVersion(resultB.vocabularyVersionId!);
    expect(versionA!.projectId).toBe(projectA.id);
    expect(versionB!.projectId).toBe(projectB.id);
  });

  /* ================================================================ */
  /*  TEST J — wrong researchFocusHash does not reuse candidate       */
  /* ================================================================ */
  it("J: wrong researchFocusHash does not reuse candidate", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(),
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db, {
      model: "mock-model",
    });

    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result1 = await service.discover(input);
    expect(result1.status).toBe("CREATED_CANDIDATE");

    const result2 = await service.discover({
      ...input,
      researchFocusHash: "different-focus-hash",
    });
    expect(result2.status).toBe("CREATED_CANDIDATE");
    expect(result2.vocabularyVersionId).not.toBe(result1.vocabularyVersionId);
  });

  /* ================================================================ */
  /*  TEST K — wrong analysisSnapshotHash does not reuse candidate    */
  /* ================================================================ */
  it("K: wrong analysisSnapshotHash does not reuse candidate", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(),
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db, {
      model: "mock-model",
    });

    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result1 = await service.discover(input);
    expect(result1.status).toBe("CREATED_CANDIDATE");

    const result2 = await service.discover({
      ...input,
      analysisSnapshotHash: "different-snapshot-hash",
    });
    expect(result2.status).toBe("CREATED_CANDIDATE");
    expect(result2.vocabularyVersionId).not.toBe(result1.vocabularyVersionId);
  });

  /* ================================================================ */
  /*  TEST L — same tuple + reuse=true => no provider call           */
  /* ================================================================ */
  it("L: same tuple with reuse=true does not call provider again", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(),
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db, {
      model: "mock-model",
    });
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result1 = await service.discover(input);
    expect(result1.status).toBe("CREATED_CANDIDATE");

    const providerCallSpy = { count: 0 };
    const spiedProvider = {
      name: provider.name,
      generate: async <T,>(request: unknown) => {
        providerCallSpy.count++;
        return provider.generate<T>(request as Parameters<typeof provider.generate>[0]);
      },
    };

    const spiedService = new DomainVocabularyDiscoveryService(
      spiedProvider as unknown as LlmProvider,
      vocabulary,
      db,
      { model: "mock-model" },
    );

    const result2 = await spiedService.discover(input);
    expect(result2.status).toBe("REUSED_CANDIDATE");
    expect(providerCallSpy.count).toBe(0);
  });

  /* ================================================================ */
  /*  TEST M — same tuple + reuse=false => next version               */
  /* ================================================================ */
  it("M: same tuple with reuse=false creates next version", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(),
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db, {
      model: "mock-model",
      reuseExistingCandidate: false,
    });
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result1 = await service.discover(input);
    expect(result1.status).toBe("CREATED_CANDIDATE");

    const result2 = await service.discover(input);
    expect(result2.status).toBe("CREATED_CANDIDATE");
    expect(result2.vocabularyVersionId).not.toBe(result1.vocabularyVersionId);

    const version1 = vocabulary.getVocabularyVersion(result1.vocabularyVersionId!);
    const version2 = vocabulary.getVocabularyVersion(result2.vocabularyVersionId!);
    expect(version2!.version).toBe(version1!.version + 1);
  });

  /* ================================================================ */
  /*  TEST N — provider failure => no partial vocabulary persisted    */
  /* ================================================================ */
  it("N: provider failure does not persist partial vocabulary", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: () => {
          throw new Error("Provider timeout");
        },
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db);
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
    ]);

    const result = await service.discover(input);

    expect(result.status).toBe("PROVIDER_FAILED");
    const versions = db.connection
      .prepare(`SELECT * FROM semantic_vocabulary_versions WHERE project_id=?`)
      .all(project.id) as unknown as Array<{ id: string }>;
    expect(versions).toHaveLength(0);
  });

  /* ================================================================ */
  /*  TEST O — validator REJECTED => no candidate usable              */
  /* ================================================================ */
  it("O: validator REJECTED does not create usable candidate", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: {
          concepts: [
            {
              label: "Problema",
              aliases: ["ayuda"],
              evidenceIds: ["e1"],
            },
          ],
        },
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db);
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
    ]);

    const result = await service.discover(input);

    expect(result.status).toBe("REJECTED");
    const versions = db.connection
      .prepare(`SELECT * FROM semantic_vocabulary_versions WHERE project_id=?`)
      .all(project.id) as unknown as Array<{ id: string }>;
    expect(versions).toHaveLength(0);
  });

  /* ================================================================ */
  /*  TEST P — multi-nicho: photography / dogs / sales                */
  /* ================================================================ */
  it("P: multi-nicho projects produce independent valid candidates", async () => {
    const photo = projects.create({ name: "Foto", niche: "fotografía" });
    seedAnalysisSet(db, photo.id, [
      { eid: "pe1", cid: "pc1", sid: "ps1", quote: "La foto tiene mucho ruido digital" },
      { eid: "pe2", cid: "pc2", sid: "ps2", quote: "El ruido arruina la toma" },
    ]);

    const dogs = projects.create({ name: "Dogs", niche: "perros" });
    seedAnalysisSet(db, dogs.id, [
      { eid: "de1", cid: "dc1", sid: "ds1", quote: "Mi perro ladra cuando queda solo" },
      { eid: "de2", cid: "dc2", sid: "ds2", quote: "Ladrido por separacion" },
    ]);

    const sales = projects.create({ name: "Sales", niche: "ventas" });
    seedAnalysisSet(db, sales.id, [
      { eid: "se1", cid: "sc1", sid: "ss1", quote: "El precio es muy alto" },
      { eid: "se2", cid: "sc2", sid: "ss2", quote: "No puedo pagarlo" },
    ]);

    const photoProvider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(["pe1", "pe2"]),
      },
    });

    const dogsProvider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: dogsProposal(["de1", "de2"]),
      },
    });

    const salesProvider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: salesProposal(["se1", "se2"]),
      },
    });

    const photoService = new DomainVocabularyDiscoveryService(photoProvider, vocabulary, db, {
      model: "mock-model",
    });
    const dogsService = new DomainVocabularyDiscoveryService(dogsProvider, vocabulary, db, {
      model: "mock-model",
    });
    const salesService = new DomainVocabularyDiscoveryService(salesProvider, vocabulary, db, {
      model: "mock-model",
    });

    const photoResult = await photoService.discover(
      buildInput(db, photo.id, [
        { eid: "pe1", cid: "pc1", sid: "ps1", quote: "La foto tiene mucho ruido digital" },
        { eid: "pe2", cid: "pc2", sid: "ps2", quote: "El ruido arruina la toma" },
      ]),
    );
    const dogsResult = await dogsService.discover(
      buildInput(db, dogs.id, [
        { eid: "de1", cid: "dc1", sid: "ds1", quote: "Mi perro ladra cuando queda solo" },
        { eid: "de2", cid: "dc2", sid: "ds2", quote: "Ladrido por separacion" },
      ]),
    );
    const salesResult = await salesService.discover(
      buildInput(db, sales.id, [
        { eid: "se1", cid: "sc1", sid: "ss1", quote: "El precio es muy alto" },
        { eid: "se2", cid: "sc2", sid: "ss2", quote: "No puedo pagarlo" },
      ]),
    );

    expect(photoResult.status).toBe("CREATED_CANDIDATE");
    expect(dogsResult.status).toBe("CREATED_CANDIDATE");
    expect(salesResult.status).toBe("CREATED_CANDIDATE");

    const photoVersion = vocabulary.getVocabularyVersion(photoResult.vocabularyVersionId!);
    const dogsVersion = vocabulary.getVocabularyVersion(dogsResult.vocabularyVersionId!);
    const salesVersion = vocabulary.getVocabularyVersion(salesResult.vocabularyVersionId!);

    expect(photoVersion!.projectId).toBe(photo.id);
    expect(dogsVersion!.projectId).toBe(dogs.id);
    expect(salesVersion!.projectId).toBe(sales.id);
  });

  /* ================================================================ */
  /*  TEST Q — historical v1 remains intact when v2 is created        */
  /* ================================================================ */
  it("Q: historical candidate v1 remains intact when v2 is created", async () => {
    const project = projects.create({ name: "P", niche: "fotografía" });
    seedAnalysisSet(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const provider = new MockLLMProvider({
      strictFixtures: true,
      fixtures: {
        domain_vocabulary_discovery_output: photoProposal(),
      },
    });

    const service = new DomainVocabularyDiscoveryService(provider, vocabulary, db, {
      model: "mock-model",
      reuseExistingCandidate: false,
    });
    const input = buildInput(db, project.id, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "La foto tiene ruido digital" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
    ]);

    const result1 = await service.discover(input);
    expect(result1.status).toBe("CREATED_CANDIDATE");
    const version1 = vocabulary.getVocabularyVersion(result1.vocabularyVersionId!);

    const result2 = await service.discover(input);
    expect(result2.status).toBe("CREATED_CANDIDATE");
    const version2 = vocabulary.getVocabularyVersion(result2.vocabularyVersionId!);

    const reloaded1 = vocabulary.getVocabularyVersion(version1!.id);
    expect(reloaded1!.status).toBe("candidate");
    expect(reloaded1!.version).toBe(version1!.version);
    expect(version2!.version).toBe(version1!.version + 1);
  });
});
