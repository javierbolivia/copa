import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrations, LATEST_SCHEMA_VERSION } from "../src/database/migrations.js";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { JobRepository } from "../src/repositories/job-repository.js";
import { SemanticVocabularyRepository } from "../src/repositories/semantic-vocabulary-repository.js";
import {
  type ConceptInput,
  type SemanticVocabularySnapshot,
  analysisSnapshotHash,
  canonicalContentHash,
  normalizeAlias,
  researchFocusHash,
} from "../src/services/semantic-vocabulary.js";
import {
  domainConceptsOf,
  matchDomainConcepts,
} from "../src/services/semantic-vocabulary-matcher.js";

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

const FOCUS = " ruido  en  FOTOGRAFÍA  de  perros ";

describe("Domain Semantic Vocabulary (PHASE 1)", () => {
  let database: AppDatabase;
  let projects: ProjectRepository;
  let repository: SemanticVocabularyRepository;
  let jobs: JobRepository;

  beforeEach(() => {
    database = new AppDatabase(":memory:");
    projects = new ProjectRepository(database);
    repository = new SemanticVocabularyRepository(database);
    jobs = new JobRepository(database);
  });

  afterEach(() => database.close());

  const focusHash = researchFocusHash(FOCUS);
  const sampleAnalysis = (projectId: string): SeedRow[] => [
    { eid: "e1", cid: "c1", sid: "s1", quote: "Las fotos tienen mucho ruido digital" },
    { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma" },
  ];

  // TEST 1: same project + focus + Analysis Set => same focus hash / snapshot hash.
  it("produce hashes deterministas para mismo proyecto, focus y Analysis Set", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));

    expect(researchFocusHash(FOCUS)).toBe(researchFocusHash("  ruido en fotografía de perros "));
    expect(researchFocusHash(FOCUS)).toBe(researchFocusHash("RUÍDO EN FOTOGRAFÍA DE PERROS"));
    expect(researchFocusHash(null)).toBe(researchFocusHash(""));
    expect(analysisSnapshotHash(database, project.id)).toBe(analysisSnapshotHash(database, project.id));
  });

  // TEST 2: change in Analysis Set => different analysisSnapshotHash.
  it("cambia analysisSnapshotHash cuando cambia el Analysis Set", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const before = analysisSnapshotHash(database, project.id);

    seedAnalysisSet(database, project.id, [
      { eid: "e3", cid: "c3", sid: "s3", quote: "Otro comentario sobre ruido" },
    ]);
    const after = analysisSnapshotHash(database, project.id);

    expect(after).not.toBe(before);
  });

  // TEST 3: create vocabulary version with concepts and aliases => recover exactly.
  it("crea y recupera exactamente una version con conceptos y aliases", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const snapshotHash = analysisSnapshotHash(database, project.id);
    const contentHash = canonicalContentHash([
      {
        conceptKey: "ruido_digital",
        label: "Ruido digital",
        definition: "Ruido de sensor en la imagen",
        cohesionWeight: 1.2,
        aliases: [
          { alias: "Ruido digital", language: "es" },
          { alias: "digital noise", language: "en" },
        ],
      },
    ]);

    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: snapshotHash,
      contentHash,
      concepts: [
        {
          conceptKey: "ruido_digital",
          label: "Ruido digital",
          definition: "Ruido de sensor en la imagen",
          cohesionWeight: 1.2,
          aliases: [
            { alias: "Ruido digital", language: "es" },
            { alias: "digital noise", language: "en" },
          ],
        },
      ],
    });

    const recovered = repository.getVocabularyVersion(version.id)!;
    expect(recovered.projectId).toBe(project.id);
    expect(recovered.researchFocus).toBe(FOCUS);
    expect(recovered.researchFocusHash).toBe(focusHash);
    expect(recovered.analysisSnapshotHash).toBe(snapshotHash);
    expect(recovered.contentHash).toBe(contentHash);
    expect(recovered.status).toBe("candidate");

    const [entry] = repository.listConceptsWithAliases(version.id);
    expect(entry?.concept.conceptKey).toBe("ruido_digital");
    expect(entry?.concept.label).toBe("Ruido digital");
    expect(entry?.concept.cohesionWeight).toBe(1.2);
    expect(entry?.concept.definition).toBe("Ruido de sensor en la imagen");
    expect(entry?.aliases.map((a) => a.alias).sort()).toEqual(["Ruido digital", "digital noise"]);
  });

  // TEST 4: concept_key can repeat across versions but not within the same version.
  it("permite concept_key repetido entre versiones pero no dentro de una", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const snapshotHash = analysisSnapshotHash(database, project.id);

    const v1 = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: snapshotHash,
      contentHash: canonicalContentHash([{ conceptKey: "ruido_digital", label: "Ruido" }]),
      concepts: [{ conceptKey: "ruido_digital", label: "Ruido" }],
    });
    const v2 = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: snapshotHash,
      contentHash: canonicalContentHash([{ conceptKey: "ruido_digital", label: "Noise" }]),
      concepts: [{ conceptKey: "ruido_digital", label: "Noise" }],
    });

    expect(v1.version).toBeLessThan(v2.version);
    expect(repository.getVocabularyVersion(v1.id)!.version).not.toBe(
      repository.getVocabularyVersion(v2.id)!.version,
    );

    // Duplicate concept_key within the same version must fail.
    expect(() =>
      repository.addConcept({
        vocabularyVersionId: v1.id,
        concept: { conceptKey: "ruido_digital", label: "Repetido" },
      }),
    ).toThrow();
  });

  // TEST 5: normalized_alias persists deterministically.
  it("persiste normalized_alias de forma determinista", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: analysisSnapshotHash(database, project.id),
      contentHash: canonicalContentHash([{ conceptKey: "ruido_digital", label: "Ruido" }]),
      concepts: [{ conceptKey: "ruido_digital", label: "Ruido" }],
    });
    const [entry] = repository.listConceptsWithAliases(version.id);
    const alias = repository.addAlias({
      conceptId: entry!.concept.id,
      alias: "  Ruido  DIGITAL!  ",
      language: "es",
    });
    expect(alias.normalizedAlias).toBe(normalizeAlias("  Ruido  DIGITAL!  "));
    expect(alias.normalizedAlias).toBe("ruido digital!");
  });

  // TEST 6: ACTIVE version cannot be modified.
  it("no permite modificar una version ACTIVE", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: analysisSnapshotHash(database, project.id),
      contentHash: canonicalContentHash([
        {
          conceptKey: "ruido_digital",
          label: "Ruido",
          aliases: [{ alias: "Ruido digital" }],
        },
      ]),
      concepts: [
        { conceptKey: "ruido_digital", label: "Ruido", aliases: [{ alias: "Ruido digital" }] },
      ],
    });
    const active = repository.activateVocabularyVersion(version.id)!;
    expect(active.status).toBe("active");
    const [entry] = repository.listConceptsWithAliases(version.id);

    // Cannot add an alias to a concept of an active version.
    expect(() =>
      repository.addAlias({ conceptId: entry!.concept.id, alias: "nuevo alias" }),
    ).toThrow(/semantic_vocabulary_version_active_immutable/);

    // Cannot UPDATE the version row directly.
    expect(() =>
      database.connection
        .prepare(`UPDATE semantic_vocabulary_versions SET research_focus='x' WHERE id=?`)
        .run(version.id),
    ).toThrow(/semantic_vocabulary_version_active_immutable/);

    // Cannot UPDATE a concept directly.
    expect(() =>
      database.connection
        .prepare(`UPDATE semantic_concepts SET label='cambiado' WHERE id=?`)
        .run(entry!.concept.id),
    ).toThrow(/semantic_vocabulary_version_active_immutable/);

    // Cannot DELETE the active version.
    expect(() =>
      database.connection
        .prepare(`DELETE FROM semantic_vocabulary_versions WHERE id=?`)
        .run(version.id),
    ).toThrow(/semantic_vocabulary_version_active_immutable/);
  });

  // TEST 7: new version can be created without altering the historical ACTIVE one.
  it("crea una nueva version sin alterar la ACTIVE historica", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const snapshotHash = analysisSnapshotHash(database, project.id);

    const v1 = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: snapshotHash,
      contentHash: canonicalContentHash([{ conceptKey: "foo", label: "Foo" }]),
      concepts: [{ conceptKey: "foo", label: "Foo" }],
    });
    repository.activateVocabularyVersion(v1.id);

    const v2 = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: snapshotHash,
      contentHash: canonicalContentHash([{ conceptKey: "bar", label: "Bar" }]),
      concepts: [{ conceptKey: "bar", label: "Bar" }],
    });

    const active = repository.getActiveVocabulary(project.id, focusHash, snapshotHash)!;
    expect(active.id).toBe(v1.id);
    const [historical] = repository.listConceptsWithAliases(v1.id);
    expect(historical?.concept.conceptKey).toBe("foo");
    expect(repository.getVocabularyVersion(v2.id)!.status).toBe("candidate");
  });

  // TEST 8: historical generation with vocabulary_version_id NULL still works.
  it("una generacion historica con vocabulary_version_id NULL sigue funcionando", () => {
    const project = projects.create({ name: "P", niche: "N" });
    const generationId = "gen-legacy";
    database.connection
      .prepare(
        `INSERT INTO generations(id,project_id,agent_key,provider,model,status,created_at)
         VALUES(?,?,?,?,?,?,?)`,
      )
      .run(generationId, project.id, "module_problems", "gemini", "model", "COMPLETED", NOW);

    const listed = jobs.listGenerations(project.id);
    expect(listed.map((g) => g.id)).toContain(generationId);
    // No vocabulary link is required.
    expect(repository.getActiveVocabulary(project.id, focusHash, "any")).toBeUndefined();
  });

  // TEST 9: a new generation can reference a vocabulary version.
  it("una generacion nueva puede referenciar una version de vocabulario", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: analysisSnapshotHash(database, project.id),
      contentHash: canonicalContentHash([{ conceptKey: "ruido_digital", label: "Ruido" }]),
    });
    const generationId = "gen-linked";
    database.connection
      .prepare(
        `INSERT INTO generations(id,project_id,agent_key,provider,model,status,created_at,vocabulary_version_id)
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(generationId, project.id, "module_problems", "gemini", "model", "COMPLETED", NOW, version.id);

    const row = database.connection
      .prepare(`SELECT vocabulary_version_id FROM generations WHERE id=?`)
      .get(generationId) as { vocabulary_version_id: string | null };
    expect(row.vocabulary_version_id).toBe(version.id);

    // FK guard: a generation cannot reference a vocabulary version from another project.
    const other = projects.create({ name: "Otro", niche: "N2" });
    const otherVersion = repository.createVocabularyVersion({
      projectId: other.id,
      researchFocus: null,
      researchFocusHash: researchFocusHash(null),
      analysisSnapshotHash: "snap-other",
      contentHash: "ch-other",
    });
    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO generations(id,project_id,agent_key,provider,model,status,created_at,vocabulary_version_id)
           VALUES(?,?,?,?,?,?,?,?)`,
        )
        .run("gen-bad", project.id, "a", "p", "m", "COMPLETED", NOW, otherVersion.id),
    ).toThrow(/generation_vocabulary_project_mismatch/);
  });

  // TEST 10: multi-niche fixtures persist as DATA without any core code change.
  it("persiste fixtures de multiples nichos (fotografia, perros, ventas) como datos", () => {
    const cases: Array<{ name: string; niche: string; concept: string; label: string; alias: string }> = [
      { name: "Fotografia", niche: "Fotografia", concept: "ruido_digital", label: "Ruido digital", alias: "ruido digital" },
      { name: "Perros", niche: "Perros", concept: "ladrido_separacion", label: "Ladrido por separación", alias: "ladrido separacion" },
      { name: "Ventas", niche: "Ventas", concept: "objecion_precio", label: "Objeción de precio", alias: "objecion de precio" },
    ];

    for (const fixture of cases) {
      const project = projects.create({ name: fixture.name, niche: fixture.niche });
      const version = repository.createVocabularyVersion({
        projectId: project.id,
        researchFocus: null,
        researchFocusHash: researchFocusHash(null),
        analysisSnapshotHash: "snapshot-fixture",
        contentHash: canonicalContentHash([{ conceptKey: fixture.concept, label: fixture.label }]),
        concepts: [
          {
            conceptKey: fixture.concept,
            label: fixture.label,
            aliases: [{ alias: fixture.alias }],
          },
        ],
      });
      const [entry] = repository.listConceptsWithAliases(version.id);
      expect(entry?.concept.conceptKey).toBe(fixture.concept);
      expect(entry?.aliases[0]?.alias).toBe(fixture.alias);
    }
  });

  // AUDIT 1: activate must recompute content_hash from the REAL persisted content.
  it("reactiva recalculando el content_hash desde el contenido REAL persistido (AUDIT 1)", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const snapshotHash = analysisSnapshotHash(database, project.id);
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: FOCUS,
      researchFocusHash: focusHash,
      analysisSnapshotHash: snapshotHash,
      contentHash: "STALE-HASH-QUE-DEBE-SER-REEMPLAZADO",
      concepts: [{ conceptKey: "base", label: "Base" }],
    });
    // Append another concept while still candidate: a precomputed hash would be stale.
    repository.addConcept({
      vocabularyVersionId: version.id,
      concept: { conceptKey: "extra", label: "Extra", aliases: [{ alias: "extra alias", isExclusion: true }] },
    });
    const active = repository.activateVocabularyVersion(version.id)!;
    const expected = canonicalContentHash([
      { conceptKey: "base", label: "Base" },
      { conceptKey: "extra", label: "Extra", aliases: [{ alias: "extra alias", isExclusion: true }] },
    ]);
    expect(active.contentHash).toBe(expected);
    expect(active.contentHash).not.toBe("STALE-HASH-QUE-DEBE-SER-REEMPLAZADO");
  });

  // AUDIT 2: multiple ACTIVE versions resolve deterministically to the highest version.
  it("resuelve deterministicamente multiples versiones ACTIVE devolviendo la mayor version (AUDIT 2)", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const snapshotHash = analysisSnapshotHash(database, project.id);
    const create = (key: string) =>
      repository.createVocabularyVersion({
        projectId: project.id,
        researchFocus: FOCUS,
        researchFocusHash: focusHash,
        analysisSnapshotHash: snapshotHash,
        contentHash: canonicalContentHash([{ conceptKey: key, label: key }]),
        concepts: [{ conceptKey: key, label: key }],
      });
    const v1 = create("v1");
    const v2 = create("v2");
    repository.activateVocabularyVersion(v1.id);
    repository.activateVocabularyVersion(v2.id);
    // Historical v1 reference remains valid and still ACTIVE.
    expect(repository.getVocabularyVersion(v1.id)!.status).toBe("active");
    const active = repository.getActiveVocabulary(project.id, focusHash, snapshotHash)!;
    expect(active.id).toBe(v2.id);
    expect(active.version).toBeGreaterThan(v1.version);
  });

  // AUDIT 4: analysisSnapshotHash must be independent of the physical insertion order.
  it("analysisSnapshotHash es independiente del orden de insercion (AUDIT 4)", () => {
    const makeSnapshot = (insertionOrder: "ab" | "ba"): string => {
      const db = new AppDatabase(":memory:");
      const repo = new ProjectRepository(db);
      const project = repo.create({ name: "P", niche: "N" });
      const rows = [
        { eid: "e1", cid: "c1", sid: "s1", quote: "Ruido digital molesto" },
        { eid: "e2", cid: "c2", sid: "s2", quote: "Ruido analogo" },
      ];
      seedAnalysisSet(db, project.id, insertionOrder === "ab" ? rows : [rows[1]!, rows[0]!]);
      const hash = analysisSnapshotHash(db, project.id);
      db.close();
      return hash;
    };
    expect(makeSnapshot("ab")).toBe(makeSnapshot("ba"));
  });

  // AUDIT 4: a relevant quote change must change the snapshot hash.
  it("analysisSnapshotHash cambia si un quote relevante se modifica (AUDIT 4)", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const before = analysisSnapshotHash(database, project.id);
    database.connection
      .prepare(`UPDATE evidence_snippets SET quote_text='Ruido digital CAMBIADO' WHERE project_id=?`)
      .run(project.id);
    expect(analysisSnapshotHash(database, project.id)).not.toBe(before);
  });

  // AUDIT 4: volatile fields (likes, timestamps) must not affect analysisSnapshotHash.
  it("analysisSnapshotHash ignora likes y timestamps irrelevantes (AUDIT 4)", () => {
    const project = projects.create({ name: "P", niche: "N" });
    seedAnalysisSet(database, project.id, sampleAnalysis(project.id));
    const before = analysisSnapshotHash(database, project.id);
    database.connection
      .prepare(`UPDATE comments SET likes=999, updated_at='2099-01-01T00:00:00.000Z' WHERE project_id=?`)
      .run(project.id);
    database.connection
      .prepare(`UPDATE evidence_snippets SET created_at='2099-01-01T00:00:00.000Z' WHERE project_id=?`)
      .run(project.id);
    expect(analysisSnapshotHash(database, project.id)).toBe(before);
  });

  // AUDIT 5: a generation cannot reference a vocabulary version from another project (INSERT + UPDATE).
  it("project isolation: generation no referencia vocabulary de otro proyecto (INSERT y UPDATE) (AUDIT 5)", () => {
    const a = projects.create({ name: "A", niche: "N" });
    const b = projects.create({ name: "B", niche: "N" });
    const vb = repository.createVocabularyVersion({
      projectId: b.id,
      researchFocus: null,
      researchFocusHash: researchFocusHash(null),
      analysisSnapshotHash: "snap-b",
      contentHash: canonicalContentHash([{ conceptKey: "x", label: "X" }]),
    });
    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO generations(id,project_id,agent_key,provider,model,status,created_at,vocabulary_version_id) VALUES(?,?,?,?,?,?,?,?)`,
        )
        .run("gen-cross", a.id, "agent", "p", "m", "COMPLETED", NOW, vb.id),
    ).toThrow(/generation_vocabulary_project_mismatch/);

    database.connection
      .prepare(
        `INSERT INTO generations(id,project_id,agent_key,provider,model,status,created_at) VALUES(?,?,?,?,?,?,?)`,
      )
      .run("gen-a", a.id, "agent", "p", "m", "COMPLETED", NOW);
    expect(() =>
      database.connection.prepare(`UPDATE generations SET vocabulary_version_id=? WHERE id=?`).run(vb.id, "gen-a"),
    ).toThrow(/generation_vocabulary_project_mismatch/);
  });
});

describe("Domain Semantic Vocabulary - real migration v9 -> latest (AUDIT 3)", () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("aplica las migraciones posteriores conservando datos historicos (project + generation NULL)", () => {
    const directory = mkdtempSync(join(tmpdir(), "semantic-migration-"));
    directories.push(directory);
    const path = join(directory, "app.db");
    const now = "2026-01-01T00:00:00.000Z";
    const legacy = new DatabaseSync(path);
    legacy.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,applied_at TEXT NOT NULL) STRICT;",
    );
    for (const migration of migrations.filter((item) => item.version <= 9)) {
      legacy.exec(migration.sql);
      legacy.prepare("INSERT INTO schema_migrations VALUES(?,?,?)").run(migration.version, migration.name, now);
    }
    legacy
      .prepare(
        `INSERT INTO projects(id,name,niche,status,language,currency,created_at,updated_at) VALUES(?,?,?,'active','es','USD',?,?)`,
      )
      .run("proj-legacy", "Legado", "Nicho", now, now);
    legacy
      .prepare(
        `INSERT INTO generations(id,project_id,agent_key,provider,model,status,created_at) VALUES(?,?,?,?,?,?,?)`,
      )
      .run("gen-legacy", "proj-legacy", "module_problems", "g", "m", "COMPLETED", now);
    legacy.close();

    const db = new AppDatabase(path);
    expect(db.getSchemaVersion()).toBe(LATEST_SCHEMA_VERSION);
    expect(db.connection.prepare("SELECT name FROM projects WHERE id='proj-legacy'").get()).toMatchObject({
      name: "Legado",
    });
    const gen = db.connection
      .prepare("SELECT id,project_id,vocabulary_version_id FROM generations WHERE id='gen-legacy'")
      .get() as { id: string; project_id: string; vocabulary_version_id: string | null };
    expect(gen.project_id).toBe("proj-legacy");
    expect(gen.vocabulary_version_id).toBeNull();
    expect(
      db.connection
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='semantic_vocabulary_versions'")
        .get(),
    ).toBeTruthy();
    expect(
      db.connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='semantic_concepts'").get(),
    ).toBeTruthy();
    expect(
      db.connection
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='semantic_concept_aliases'")
        .get(),
    ).toBeTruthy();

    const repo = new SemanticVocabularyRepository(db);
    const created = repo.createVocabularyVersion({
      projectId: "proj-legacy",
      researchFocus: null,
      researchFocusHash: researchFocusHash(null),
      analysisSnapshotHash: "snap-legacy",
      contentHash: canonicalContentHash([{ conceptKey: "c", label: "C" }]),
      concepts: [{ conceptKey: "c", label: "C" }],
    });
    expect(repo.getVocabularyVersion(created.id)).toBeTruthy();
    expect(db.connection.prepare("SELECT id FROM generations WHERE id='gen-legacy'").get()).toBeTruthy();
    db.close();
  });
});

describe("PHASE 2 — Dynamic semantic vocabulary matcher (deterministic aliases)", () => {
  const snapshot = (id: string, concepts: Array<{
    conceptKey: string;
    label?: string;
    cohesionWeight?: number;
    aliases: string[];
    exclusions?: string[];
  }>): SemanticVocabularySnapshot => ({
    vocabularyVersionId: id,
    contentHash: `hash-${id}`,
    concepts: concepts.map((concept) => ({
      conceptKey: concept.conceptKey,
      label: concept.label ?? concept.conceptKey,
      cohesionWeight: concept.cohesionWeight ?? 1,
      aliases: concept.aliases,
      exclusions: concept.exclusions ?? [],
    })),
  });

  // DOMAIN A — photography
  const photo = snapshot("v-photo", [{
    conceptKey: "ruido_digital",
    aliases: ["ruido", "grano"],
    exclusions: ["audio", "microfono"],
    cohesionWeight: 1,
  }]);
  // DOMAIN B — dogs
  const dogs = snapshot("v-dogs", [{
    conceptKey: "ladrido_separacion",
    aliases: ["ladra cuando queda solo", "ladrido al quedarse solo"],
    exclusions: ["ladra cuando juega"],
    cohesionWeight: 1,
  }]);
  // DOMAIN C — sales
  const sales = snapshot("v-sales", [{
    conceptKey: "objecion_precio",
    aliases: ["demasiado caro", "precio muy alto", "no puedo pagarlo"],
    cohesionWeight: 1,
  }]);

  it("DOMINIO A: reconoce ruido pero lo excluye con audio/microfono", () => {
    expect(domainConceptsOf(photo, "la foto tiene mucho ruido")).toContain("ruido_digital");
    expect(domainConceptsOf(photo, "hay ruido en el audio")).not.toContain("ruido_digital");
    const blocked = matchDomainConcepts(photo, "hay ruido en el audio").find((m) => m.conceptKey === "ruido_digital");
    expect(blocked?.blockedByExclusion).toBe("audio");
    expect(blocked?.matchedAlias).toBeNull();
  });

  it("DOMINIO B: reconoce ladrido por separacion y lo excluye al jugar", () => {
    expect(domainConceptsOf(dogs, "mi perro ladra cuando queda solo")).toContain("ladrido_separacion");
    expect(domainConceptsOf(dogs, "mi perro ladra cuando juega")).not.toContain("ladrido_separacion");
    const blocked = matchDomainConcepts(dogs, "mi perro ladra cuando juega").find((m) => m.conceptKey === "ladrido_separacion");
    expect(blocked?.blockedByExclusion).toBe("ladra cuando juega");
  });

  it("DOMINIO C: reconoce objecion de precio y no confunde catalogo", () => {
    expect(domainConceptsOf(sales, "me interesa pero el precio es muy alto")).toContain("objecion_precio");
    expect(domainConceptsOf(sales, "el precio aparece en el catálogo")).not.toContain("objecion_precio");
  });

  it("BOUNDARIES: alias de una palabra no coincide como substring accidental", () => {
    const priceOnly = snapshot("v-price", [{ conceptKey: "objecion_precio", aliases: ["precio"], cohesionWeight: 1 }]);
    expect(domainConceptsOf(priceOnly, "el precio subió")).toContain("objecion_precio");
    expect(domainConceptsOf(priceOnly, "lo desprecio")).not.toContain("objecion_precio");
  });

  // ISSUE 1 — conectores gramaticales ignorables, gaps acotados y deterministas.
  const pricePhrase = snapshot("v-precio", [{ conceptKey: "objecion_precio", aliases: ["precio muy alto"], cohesionWeight: 1 }]);

  it("A: alias multi-palabra tolera conector gramatical entre tokens (precio es muy alto)", () => {
    expect(domainConceptsOf(pricePhrase, "el precio es muy alto")).toContain("objecion_precio");
    expect(domainConceptsOf(pricePhrase, "el precio muy alto")).toContain("objecion_precio");
    expect(domainConceptsOf(pricePhrase, "me interesa pero el precio es muy alto")).toContain("objecion_precio");
  });

  it("B: NO permite gaps con palabras de contenido semantico entre tokens", () => {
    expect(domainConceptsOf(pricePhrase, "el precio revisó toda la configuración muy alto")).not.toContain("objecion_precio");
    expect(domainConceptsOf(pricePhrase, "el precio después de revisar todo terminó muy alto")).not.toContain("objecion_precio");
  });

  it("C: alias de una palabra no coincide como substring (desprecio)", () => {
    const priceOnly = snapshot("v-price", [{ conceptKey: "objecion_precio", aliases: ["precio"], cohesionWeight: 1 }]);
    expect(domainConceptsOf(priceOnly, "lo desprecio")).not.toContain("objecion_precio");
  });

  it("D: exclusions siguen funcionando con conectores gramaticales", () => {
    const withExclusion = snapshot("v-excl", [{ conceptKey: "ruido_digital", aliases: ["ruido"], exclusions: ["audio"], cohesionWeight: 1 }]);
    expect(domainConceptsOf(withExclusion, "hay ruido en el audio")).not.toContain("ruido_digital");
    expect(domainConceptsOf(withExclusion, "el ruido es fuerte")).toContain("ruido_digital");
  });

  it("ISOLATION: un snapshot de un nicho no reconoce conceptos de otros", () => {
    expect(domainConceptsOf(photo, "mi perro ladra cuando queda solo")).not.toContain("ruido_digital");
    expect(domainConceptsOf(photo, "el precio es muy alto")).not.toContain("ruido_digital");
    expect(domainConceptsOf(dogs, "la foto tiene mucho ruido")).not.toContain("ladrido_separacion");
    expect(domainConceptsOf(sales, "la foto tiene mucho ruido")).not.toContain("objecion_precio");
  });

  it("VERSIONING: el resultado depende EXCLUSIVAMENTE del snapshot suministrado", () => {
    const v1 = snapshot("v1", [{ conceptKey: "x", aliases: ["alpha"], cohesionWeight: 1 }]);
    const v2 = snapshot("v2", [{ conceptKey: "x", aliases: ["beta"], cohesionWeight: 1 }]);
    expect(domainConceptsOf(v1, "alpha")).toEqual(["x"]);
    expect(domainConceptsOf(v2, "alpha")).toEqual([]);
    expect(domainConceptsOf(v2, "beta")).toEqual(["x"]);
    expect(domainConceptsOf(v1, "beta")).toEqual([]);
  });

  it("provenance: matchedAlias y vocabularyVersionId se conservan", () => {
    const match = matchDomainConcepts(photo, "hay grano en la imagen").find((m) => m.conceptKey === "ruido_digital");
    expect(match?.matchedAlias).toBe("grano");
    expect(match?.vocabularyVersionId).toBe("v-photo");
    expect(match?.blockedByExclusion).toBeNull();
  });
});

describe("PHASE 2 — loadActiveVocabularySnapshot (repository bridge)", () => {
  let database: AppDatabase;
  let projects: ProjectRepository;
  let repository: SemanticVocabularyRepository;

  beforeEach(() => {
    database = new AppDatabase(":memory:");
    projects = new ProjectRepository(database);
    repository = new SemanticVocabularyRepository(database);
  });
  afterEach(() => database.close());

  const focusHash = researchFocusHash("fotografia");

  it("devuelve null cuando no hay version ACTIVE", () => {
    const project = projects.create({ name: "P", niche: "N" });
    const result = repository.loadActiveVocabularySnapshot(project.id, focusHash, "snap");
    expect(result).toBeNull();
  });

  it("transforma la version ACTIVE en un snapshot inmutable sin filas DB", () => {
    const project = projects.create({ name: "P", niche: "N" });
    const version = repository.createVocabularyVersion({
      projectId: project.id,
      researchFocus: "fotografia",
      researchFocusHash: focusHash,
      analysisSnapshotHash: "snap",
      contentHash: canonicalContentHash([{
        conceptKey: "ruido_digital",
        label: "Ruido digital",
        cohesionWeight: 0.5,
        aliases: [
          { alias: "ruido", isExclusion: false },
          { alias: "grano", isExclusion: false },
          { alias: "audio", isExclusion: true },
        ],
      }]),
      concepts: [{
        conceptKey: "ruido_digital",
        label: "Ruido digital",
        cohesionWeight: 0.5,
        aliases: [
          { alias: "ruido", isExclusion: false },
          { alias: "grano", isExclusion: false },
          { alias: "audio", isExclusion: true },
        ],
      }],
    });
    repository.activateVocabularyVersion(version.id);

    const snapshot = repository.loadActiveVocabularySnapshot(project.id, focusHash, "snap")!;
    expect(snapshot).not.toBeNull();
    expect(snapshot.vocabularyVersionId).toBe(version.id);
    expect(snapshot.concepts).toHaveLength(1);
    const concept = snapshot.concepts[0]!;
    expect(concept.conceptKey).toBe("ruido_digital");
    expect(concept.cohesionWeight).toBe(0.5);
    expect(concept.aliases).toEqual(expect.arrayContaining(["ruido", "grano"]));
    expect(concept.exclusions).toEqual(["audio"]);
    // The runtime snapshot is immediately usable by the matcher.
    expect(domainConceptsOf(snapshot, "la foto tiene mucho ruido")).toContain("ruido_digital");
    expect(domainConceptsOf(snapshot, "hay ruido en el audio")).not.toContain("ruido_digital");
  });
});

