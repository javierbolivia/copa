import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import type { SemanticVocabularySnapshot } from "../src/services/semantic-vocabulary.js";
import {
  type AnalysisSetSnapshot,
  analysisSetSnapshot,
} from "../src/services/problem-quality-engine.js";
import * as pqe from "../src/services/problem-quality-engine.js";
import {
  type DomainVocabularyDryRunResult,
  runDomainVocabularyDryRun,
} from "../src/services/domain-vocabulary-dry-run.js";

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

function snapshot(versionId: string, concepts: SemanticVocabularySnapshot["concepts"]): SemanticVocabularySnapshot {
  return { vocabularyVersionId: versionId, contentHash: `hash-${versionId}`, concepts };
}

function problemsOutput(items: unknown): unknown {
  return { schemaVersion: 1, items };
}

/* ------------------------------------------------------------------ */
/*  Suite                                                             */
/* ------------------------------------------------------------------ */

describe("PHASE 4C — deterministic domain vocabulary dry-run", () => {
  let db: AppDatabase;
  let projects: ProjectRepository;
  let projectId: string;

  beforeEach(() => {
    db = new AppDatabase(":memory:");
    projects = new ProjectRepository(db);
    projectId = projects.create({ name: "P", niche: "fotografía" }).id;
  });

  afterEach(() => db.close());

  const corpus = (): SeedRow[] => [
    { eid: "e1", cid: "c1", sid: "s1", quote: "Las fotos tienen mucho ruido digital molesto" },
    { eid: "e2", cid: "c2", sid: "s2", quote: "El ruido arruina la toma de la camara" },
    { eid: "e3", cid: "c3", sid: "s3", quote: "La tarjeta de memoria esta llena" },
    { eid: "e4", cid: "c4", sid: "s4", quote: "Los colores se ven apagados al exportar" },
    { eid: "e5", cid: "c5", sid: "s5", quote: "El software tarda al procesar archivos raw" },
    { eid: "e6", cid: "c6", sid: "s6", quote: "El programa se cierra al abrir muchas fotos" },
  ];

  const ruidoSnapshot = (versionId = "v1"): SemanticVocabularySnapshot =>
    snapshot(versionId, [
      { conceptKey: "dom_ruido", label: "Ruido digital", cohesionWeight: 1, aliases: ["ruido"], exclusions: [] },
    ]);

  /* ================================================================ */
  /*  TEST C — dynamicMatchCount = 0 => BLOCK                         */
  /* ================================================================ */
  it("C: candidate with zero dynamic matches is blocked", () => {
    seedAnalysisSet(db, projectId, corpus());
    const candidate = snapshot("v-c", [
      { conceptKey: "dom_zebra", label: "Zebra", cohesionWeight: 1, aliases: ["zebra"], exclusions: [] },
    ]);
    const result = runDomainVocabularyDryRun({
      database: db,
      projectId,
      analysisSetSnapshot: analysisSetSnapshot(db, projectId),
      rawProblems: problemsOutput([{ id: "p1", name: "Zebra", summary: "a", category: "pain", evidenceIds: ["e1"] }]),
      candidateSnapshot: candidate,
    });
    expect(result.status).toBe("BLOCK");
    expect(result.dynamicMatchCount).toBe(0);
    expect(result.issues.some((i) => i.includes("dynamicMatchCount is 0"))).toBe(true);
  });

  /* ================================================================ */
  /*  TEST D — a concept with no real match => BLOCK                  */
  /* ================================================================ */
  it("D: a concept with no real match in the set is blocked", () => {
    seedAnalysisSet(db, projectId, corpus());
    const candidate = snapshot("v-d", [
      { conceptKey: "dom_ruido", label: "Ruido digital", cohesionWeight: 1, aliases: ["ruido"], exclusions: [] },
      { conceptKey: "dom_zebra", label: "Zebra", cohesionWeight: 1, aliases: ["zebra"], exclusions: [] },
    ]);
    const result = runDomainVocabularyDryRun({
      database: db,
      projectId,
      analysisSetSnapshot: analysisSetSnapshot(db, projectId),
      rawProblems: problemsOutput([{ id: "p1", name: "Zebra", summary: "a", category: "pain", evidenceIds: ["e1"] }]),
      candidateSnapshot: candidate,
    });
    expect(result.status).toBe("BLOCK");
    expect(result.conceptMetrics.find((c) => c.conceptKey === "dom_zebra")!.noMatchBlocked).toBe(true);
  });

  /* ================================================================ */
  /*  TEST E — concept dominance >= 50% => BLOCK                      */
  /* ================================================================ */
  it("E: a concept matching >=50% of the corpus is blocked", () => {
    seedAnalysisSet(db, projectId, corpus().slice(0, 2));
    const candidate = ruidoSnapshot("v-e");
    // Both rows contain "ruido" => concept matches 100% of a 2-row corpus.
    const result = runDomainVocabularyDryRun({
      database: db,
      projectId,
      analysisSetSnapshot: analysisSetSnapshot(db, projectId),
      rawProblems: problemsOutput([{ id: "p1", name: "Ruido", summary: "a", category: "pain", evidenceIds: ["e1"] }]),
      candidateSnapshot: candidate,
    });
    expect(result.status).toBe("BLOCK");
    expect(result.conceptMetrics[0]!.dominanceBlocked).toBe(true);
  });

  /* ================================================================ */
  /*  TEST F — alias dominance >= 40% => BLOCK                        */
  /* ================================================================ */
  it("F: an individual alias matching >=40% of the corpus is blocked", () => {
    // 5-row corpus where "ruido" appears in exactly 2 rows => 0.40 (blocked).
    seedAnalysisSet(db, projectId, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "ruido de sensor en la foto" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "mucho ruido en la toma" },
      { eid: "e3", cid: "c3", sid: "s3", quote: "los colores se ven apagados" },
      { eid: "e4", cid: "c4", sid: "s4", quote: "la tarjeta esta llena" },
      { eid: "e5", cid: "c5", sid: "s5", quote: "el programa se cierra solo" },
    ]);
    const candidate = ruidoSnapshot("v-f");
    const result = runDomainVocabularyDryRun({
      database: db,
      projectId,
      analysisSetSnapshot: analysisSetSnapshot(db, projectId),
      rawProblems: problemsOutput([{ id: "p1", name: "Ruido", summary: "a", category: "pain", evidenceIds: ["e1"] }]),
      candidateSnapshot: candidate,
    });
    expect(result.status).toBe("BLOCK");
    expect(result.aliasMetrics[0]!.dominanceBlocked).toBe(true);
  });

  /* ================================================================ */
  /*  TEST G — corruption (empty concepts) => BLOCK                   */
  /* ================================================================ */
  it("G: a candidate with zero concepts is treated as corruption", () => {
    seedAnalysisSet(db, projectId, corpus());
    const candidate = snapshot("v-g", []);
    const result = runDomainVocabularyDryRun({
      database: db,
      projectId,
      analysisSetSnapshot: analysisSetSnapshot(db, projectId),
      rawProblems: problemsOutput([]),
      candidateSnapshot: candidate,
    });
    expect(result.status).toBe("BLOCK");
    expect(result.issues.some((i) => i.startsWith("corruption:"))).toBe(true);
  });

  /* ================================================================ */
  /*  TEST H — candidate qualityProblems run throws => BLOCK          */
  /* ================================================================ */
  it("H: a throwing candidate qualityProblems run blocks activation", () => {
    seedAnalysisSet(db, projectId, corpus());
    const candidate = ruidoSnapshot("v-h");
    const original = pqe.qualityProblems;
    let calls = 0;
    const spy = vi.spyOn(pqe, "qualityProblems").mockImplementation(((
      database: AppDatabase,
      pid: string,
      raw: unknown,
      options?: Parameters<typeof pqe.qualityProblems>[3],
    ) => {
      calls += 1;
      if (calls === 2) throw new Error("candidate run exploded");
      return original(database, pid, raw, options);
    }) as never);
    try {
      const result = runDomainVocabularyDryRun({
        database: db,
        projectId,
        analysisSetSnapshot: analysisSetSnapshot(db, projectId),
        rawProblems: problemsOutput([{ id: "p1", name: "Ruido", summary: "a", category: "pain", evidenceIds: ["e1"] }]),
        candidateSnapshot: candidate,
      });
      expect(result.status).toBe("BLOCK");
      expect(result.issues.some((i) => i.includes("candidate qualityProblems run threw"))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  /* ================================================================ */
  /*  TEST N — baseline and candidate use the same AnalysisSetSnapshot */
  /* ================================================================ */
  it("N: baseline and candidate runs receive the exact same materialized snapshot", () => {
    seedAnalysisSet(db, projectId, corpus());
    const analysisSet = analysisSetSnapshot(db, projectId);
    const candidate = ruidoSnapshot("v-n");
    const spy = vi.spyOn(pqe, "qualityProblems");
    try {
      runDomainVocabularyDryRun({
        database: db,
        projectId,
        analysisSetSnapshot: analysisSet,
        rawProblems: problemsOutput([{ id: "p1", name: "Ruido", summary: "a", category: "pain", evidenceIds: ["e1"] }]),
        candidateSnapshot: candidate,
      });
      expect(spy).toHaveBeenCalledTimes(2);
      const baselineSnapshot = spy.mock.calls[0]![3]!.analysisSetSnapshot;
      const candidateSnapshotArg = spy.mock.calls[1]![3]!.analysisSetSnapshot;
      expect(baselineSnapshot).toBe(analysisSet);
      expect(candidateSnapshotArg).toBe(analysisSet);
    } finally {
      spy.mockRestore();
    }
  });

  /* ================================================================ */
  /*  TEST O — DB mutation after materialization still uses snapshot A */
  /* ================================================================ */
  it("O: a DB mutation after materialization does not change the snapshot used", () => {
    seedAnalysisSet(db, projectId, corpus());
    const analysisSetA = analysisSetSnapshot(db, projectId);
    // Mutate the DB to create a different Analysis Set B.
    seedAnalysisSet(db, projectId, [
      { eid: "e-new", cid: "c-new", sid: "s-new", quote: "evidencia nueva que no estaba en A" },
    ]);
    const analysisSetB = analysisSetSnapshot(db, projectId);
    expect(analysisSetB.rows.length).toBeGreaterThan(analysisSetA.rows.length);

    const candidate = ruidoSnapshot("v-o");
    const spy = vi.spyOn(pqe, "qualityProblems");
    try {
      runDomainVocabularyDryRun({
        database: db,
        projectId,
        analysisSetSnapshot: analysisSetA,
        rawProblems: problemsOutput([{ id: "p1", name: "Ruido", summary: "a", category: "pain", evidenceIds: ["e1"] }]),
        candidateSnapshot: candidate,
      });
      // Both runs consumed the original A snapshot object, never a re-query of B.
      expect(spy.mock.calls[0]![3]!.analysisSetSnapshot).toBe(analysisSetA);
      expect(spy.mock.calls[1]![3]!.analysisSetSnapshot).toBe(analysisSetA);
    } finally {
      spy.mockRestore();
    }
  });

  /* ================================================================ */
  /*  TEST P — dry-run does NOT re-run MAP/REDUCE or provider         */
  /* ================================================================ */
  it("P: dry-run only runs qualityProblems twice and never a provider", async () => {
    seedAnalysisSet(db, projectId, corpus());
    const candidate = ruidoSnapshot("v-p");
    const spy = vi.spyOn(pqe, "qualityProblems");
    try {
      const raw = problemsOutput([{ id: "p1", name: "Ruido", summary: "a", category: "pain", evidenceIds: ["e1"] }]);
      runDomainVocabularyDryRun({
        database: db,
        projectId,
        analysisSetSnapshot: analysisSetSnapshot(db, projectId),
        rawProblems: raw,
        candidateSnapshot: candidate,
      });
      // Exactly two qualityProblems invocations: baseline + candidate. No reduce re-run.
      expect(spy).toHaveBeenCalledTimes(2);
      // Same rawProblems (the already-produced pipeline output) is passed to both.
      expect(spy.mock.calls[0]![2]).toBe(raw);
      expect(spy.mock.calls[1]![2]).toBe(raw);
    } finally {
      spy.mockRestore();
    }
  });

  /* ================================================================ */
  /*  TEST Q — decision flips are audited but never a hard-block       */
  /* ================================================================ */
  it("Q: decision changes are audited and do not block by arbitrary threshold", () => {
    seedAnalysisSet(db, projectId, [
      { eid: "e1", cid: "c1", sid: "s1", quote: "El grano es un problema para editar" },
      { eid: "e2", cid: "c2", sid: "s2", quote: "El grano me da un problema serio" },
      { eid: "e3", cid: "c3", sid: "s3", quote: "La tarjeta de memoria esta llena" },
      { eid: "e4", cid: "c4", sid: "s4", quote: "Los colores se ven apagados al exportar" },
      { eid: "e5", cid: "c5", sid: "s5", quote: "El software tarda al procesar archivos raw" },
      { eid: "e6", cid: "c6", sid: "s6", quote: "El programa se cierra al abrir muchas fotos" },
    ]);
    const candidate = snapshot("v-q", [
      { conceptKey: "dom_grano", label: "Grano digital", cohesionWeight: 1, aliases: ["grano"], exclusions: [] },
    ]);
    const raw = problemsOutput([
      { id: "p1", name: "Grano en fotografias", summary: "el grano arruina las fotos", category: "pain", evidenceIds: ["e1", "e2"] },
    ]);
    const result: DomainVocabularyDryRunResult = runDomainVocabularyDryRun({
      database: db,
      projectId,
      analysisSetSnapshot: analysisSetSnapshot(db, projectId),
      rawProblems: raw,
      candidateSnapshot: candidate,
    });

    // The domain concept flips the cluster from REJECTED_LOW_COHESION to VALIDATED.
    expect(result.decisionChanges.length).toBeGreaterThan(0);
    const flip = result.decisionChanges.find((c) => c.clusterId === "p1");
    expect(flip).toBeDefined();
    expect(flip!.baselineDecision).toBe("REJECTED_LOW_COHESION");
    expect(flip!.candidateDecision).toBe("VALIDATED");
    // Decision flips are measured and audited, never a hard block.
    expect(result.status).toBe("PASS");
  });

  /* ================================================================ */
  /*  Sanity — a valid, non-dominant candidate passes the dry-run      */
  /* ================================================================ */
  it("passes a valid non-dominant candidate", () => {
    seedAnalysisSet(db, projectId, corpus());
    const candidate = ruidoSnapshot("v-ok");
    const result = runDomainVocabularyDryRun({
      database: db,
      projectId,
      analysisSetSnapshot: analysisSetSnapshot(db, projectId),
      rawProblems: problemsOutput([{ id: "p1", name: "Ruido", summary: "a", category: "pain", evidenceIds: ["e1", "e2"] }]),
      candidateSnapshot: candidate,
    });
    expect(result.status).toBe("PASS");
    expect(result.dynamicMatchCount).toBeGreaterThan(0);
  });
});
