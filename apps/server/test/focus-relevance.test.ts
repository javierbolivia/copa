import { describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";
import { qualityProblems } from "../src/services/problem-quality-engine.js";
import type { ClusterAuditRecord } from "../src/services/problem-quality-engine.js";
import type { SemanticVocabularySnapshot } from "../src/services/semantic-vocabulary.js";

/**
 * RESEARCH FOCUS RELEVANCE — regression suite.
 *
 * Deterministic relevance must make OUT_OF_SCOPE reachable for claims with zero
 * meaningful focus relationship, while preserving related problems, respecting
 * provider-supplied scores, and never mass-rejecting when no focus is supplied.
 *
 * Fixtures may use concrete niches (photography/dogs/sales) but the production
 * algorithm contains NONE of those terms.
 */

type QualityResult = { items: unknown[]; analysisAudit: { postMergeClusters: ClusterAuditRecord[] } };

const makeDb = (evidenceTexts: string[], niche: string) => {
  const db = new AppDatabase(":memory:");
  const projects = new ProjectRepository(db);
  const sources = new SourceRepository(db);
  const project = projects.create({ name: "P", niche });
  sources.createManual(project.id, { sourceType: "manual", title: "S", text: evidenceTexts.join("\n\n") });
  const ids = db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{ id: string }>;
  return { db, project, ids };
};

const run = (opts: {
  niche: string;
  texts: string[];
  name: string;
  summary: string;
  providerScore?: number;
  vocabularySnapshot?: SemanticVocabularySnapshot | null;
  researchFocus?: string | null;
}) => {
  const { db, project, ids } = makeDb(opts.texts, opts.niche);
  const item: Record<string, unknown> = {
    id: "c1", name: opts.name, summary: opts.summary, category: "pain",
    evidenceIds: ids.map((row) => row.id),
  };
  if (opts.providerScore !== undefined) item.researchRelevanceScore = opts.providerScore;
  const input = { schemaVersion: 1, items: [item] };
  const options: Record<string, unknown> = {};
  if (opts.vocabularySnapshot !== undefined) options.vocabularySnapshot = opts.vocabularySnapshot;
  if (opts.researchFocus !== undefined) options.researchFocus = opts.researchFocus;
  const result = qualityProblems(db, project.id, input, options as never) as QualityResult;
  return { audit: result.analysisAudit.postMergeClusters[0], items: result.items, db, project, ids };
};

const snapshot = (id: string, concepts: Array<{ conceptKey: string; aliases: string[] }>): SemanticVocabularySnapshot => ({
  vocabularyVersionId: id,
  contentHash: `hash-${id}`,
  concepts: concepts.map((c) => ({ conceptKey: c.conceptKey, label: c.conceptKey, cohesionWeight: 1, aliases: c.aliases, exclusions: [] })),
});

describe("Research focus relevance", () => {
  const PHOTO_FOCUS = "reducción y eliminación de ruido en fotografías";

  it("TEST 1 — non-empty focus + zero lexical/semantic overlap => OUT_OF_SCOPE", () => {
    const r = run({
      niche: PHOTO_FOCUS,
      texts: ["¿confusión entre Codex y Claude Code?"],
      name: "confusión entre Codex y Claude Code",
      summary: "los usuarios no distinguen entre agentes",
    });
    expect(r.audit!.researchRelevanceScore).toBeLessThan(40);
    expect(r.audit!.researchRelevanceLevel).toBe("OUT_OF_SCOPE");
    expect(r.audit!.finalDecision).toBe("REJECTED_OUT_OF_SCOPE");
    expect(r.items).toHaveLength(0);
    r.db.close();
  });

  it("TEST 2 — one meaningful focus overlap => not OUT_OF_SCOPE (TANGENTIAL)", () => {
    const r = run({
      niche: PHOTO_FOCUS,
      texts: ["Lightroom tarda demasiado al reducir ruido"],
      name: "Lightroom tarda demasiado al reducir ruido",
      summary: "el proceso es lento",
    });
    expect(r.audit!.researchRelevanceLevel).not.toBe("OUT_OF_SCOPE");
    expect(r.audit!.researchRelevanceScore).toBeGreaterThanOrEqual(40);
    expect(r.audit!.finalDecision).not.toBe("REJECTED_OUT_OF_SCOPE");
    r.db.close();
  });

  it("TEST 3 — two meaningful overlaps => stronger relevance", () => {
    const r = run({
      niche: PHOTO_FOCUS,
      texts: ["eliminación de ruido digital en fotografías"],
      name: "eliminación de ruido digital en fotografías",
      summary: "eliminar ruido de las fotos",
    });
    expect(r.audit!.researchRelevanceScore).toBe(86);
    expect(r.audit!.researchRelevanceLevel).toBe("CORE");
    r.db.close();
  });

  it("TEST 4 — semantic focus relationship with little/no lexical overlap stays in scope (exact snapshot)", () => {
    const snap = snapshot("v-sem", [{ conceptKey: "domain_freeze", aliases: ["se bloquea", "queda congelado"] }]);
    // Claim "queda congelado" has ZERO lexical overlap with focus "la aplicación se
    // bloquea"; only the shared domain concept (via the exact snapshot) keeps it in scope.
    const r = run({
      niche: "la aplicación se bloquea",
      texts: ["queda congelado al abrir"],
      name: "queda congelado",
      summary: "al abrir el programa queda congelado",
      vocabularySnapshot: snap,
    });
    expect(r.audit!.researchRelevanceScore).toBeGreaterThanOrEqual(40);
    expect(r.audit!.researchRelevanceLevel).not.toBe("OUT_OF_SCOPE");
    expect(r.audit!.finalDecision).toBe("VALIDATED");
    r.db.close();
  });

  it("TEST 5 — wrong vocabulary tuple / no vocabulary cannot leak semantic relevance", () => {
    const niche = "la aplicación se bloquea";
    const name = "queda congelado";
    const summary = "al abrir el programa queda congelado";
    const texts = ["queda congelado al abrir"];

    // No snapshot: zero lexical overlap and no semantic concept => OUT_OF_SCOPE.
    const noSnap = run({ niche, texts, name, summary, vocabularySnapshot: null });
    expect(noSnap.audit!.researchRelevanceScore).toBeLessThan(40);
    expect(noSnap.audit!.researchRelevanceLevel).toBe("OUT_OF_SCOPE");
    expect(noSnap.audit!.finalDecision).toBe("REJECTED_OUT_OF_SCOPE");
    noSnap.db.close();

    // Wrong vocabulary tuple: concept matches neither claim nor focus => no leak.
    const wrong = snapshot("v-wrong", [{ conceptKey: "dom_x", aliases: ["zzzzzz"] }]);
    const rWrong = run({ niche, texts, name, summary, vocabularySnapshot: wrong });
    expect(rWrong.audit!.researchRelevanceLevel).toBe("OUT_OF_SCOPE");
    expect(rWrong.audit!.finalDecision).toBe("REJECTED_OUT_OF_SCOPE");
    rWrong.db.close();
  });

  it("TEST 6 — provider proposes 100 but deterministic relationship is zero => still OUT_OF_SCOPE", () => {
    const r = run({
      niche: PHOTO_FOCUS,
      texts: ["¿confusión entre Codex y Claude Code?"],
      name: "confusión entre Codex y Claude Code",
      summary: "los usuarios no distinguen entre agentes",
      providerScore: 100,
    });
    expect(r.audit!.providerRelevanceScore).toBe(100);
    expect(r.audit!.deterministicRelevanceScore).toBeLessThan(40);
    expect(r.audit!.researchRelevanceScore).toBeLessThan(40);
    expect(r.audit!.finalDecision).toBe("REJECTED_OUT_OF_SCOPE");
    expect(r.items).toHaveLength(0);
    r.db.close();
  });

  it("TEST 7 — provider relevance + legitimate deterministic focus signal preserves provider behavior", () => {
    const r = run({
      niche: PHOTO_FOCUS,
      texts: ["eliminación de ruido digital en fotografías"],
      name: "eliminación de ruido digital en fotografías",
      summary: "eliminar ruido de las fotos",
      providerScore: 95,
    });
    // Deterministic = 86 (2 shared tokens); provider 95 supplements (raises).
    expect(r.audit!.deterministicRelevanceScore).toBe(86);
    expect(r.audit!.providerRelevanceScore).toBe(95);
    expect(r.audit!.researchRelevanceScore).toBe(95);
    expect(r.audit!.researchRelevanceLevel).toBe("CORE");
    expect(r.audit!.finalDecision).toBe("VALIDATED");
    r.db.close();
  });

  it("TEST 8 — no meaningful research focus => not mass rejected", () => {
    // Focus "el de la y" tokenizes to zero meaningful tokens => gate disabled.
    const r = run({
      niche: "el de la y",
      texts: ["confusión entre Codex y Claude Code"],
      name: "confusión entre Codex y Claude Code",
      summary: "los usuarios no distinguen entre agentes",
      researchFocus: "el de la y",
    });
    expect(r.audit!.finalDecision).not.toBe("REJECTED_OUT_OF_SCOPE");
    expect(r.audit!.researchRelevanceScore).toBeGreaterThanOrEqual(40);
    r.db.close();
  });

  it("TEST 9 — blank/whitespace focus => same safe no-focus behavior", () => {
    // Blank focus falls back to the (empty-token) niche => gate disabled.
    const r = run({
      niche: "el de la y",
      texts: ["confusión entre Codex y Claude Code"],
      name: "confusión entre Codex y Claude Code",
      summary: "los usuarios no distinguen entre agentes",
      researchFocus: "   ",
    });
    expect(r.audit!.finalDecision).not.toBe("REJECTED_OUT_OF_SCOPE");
    r.db.close();
  });

  it("TEST 10 — multi-niche photography / dogs / sales", () => {
    const cases: Array<{ niche: string; related: { name: string; summary: string; texts: string[] }; unrelated: { name: string; summary: string; texts: string[] } }> = [
      {
        niche: "reducción y eliminación de ruido en fotografías",
        related: { name: "eliminar ruido digital de una fotografía", summary: "eliminar ruido de las fotos", texts: ["eliminar ruido digital de una fotografía"] },
        unrelated: { name: "límites de tokens de un agente de programación", summary: "el agente consume muchos tokens", texts: ["el agente consume muchos tokens"] },
      },
      {
        niche: "entrenamiento de perros que tiran de la correa",
        related: { name: "mi perro tira demasiado durante los paseos", summary: "el perro tira de la correa", texts: ["mi perro tira demasiado durante los paseos"] },
        unrelated: { name: "cómo cerrar una venta por teléfono", summary: "cerrar ventas por teléfono", texts: ["cómo cerrar una venta por teléfono"] },
      },
      {
        niche: "objeciones de precio en ventas",
        related: { name: "clientes dicen que el producto es demasiado caro", summary: "objeciones de precio", texts: ["los clientes dicen que el producto es demasiado caro"] },
        unrelated: { name: "mi perro ladra durante la noche", summary: "el perro ladra de noche", texts: ["mi perro ladra durante la noche"] },
      },
    ];
    for (const c of cases) {
      const rel = run({ niche: c.niche, texts: c.related.texts, name: c.related.name, summary: c.related.summary });
      expect(rel.audit!.finalDecision, `related should not be OUT_OF_SCOPE for ${c.niche}`).not.toBe("REJECTED_OUT_OF_SCOPE");
      expect(rel.audit!.researchRelevanceScore, `related score for ${c.niche}`).toBeGreaterThanOrEqual(40);
      rel.db.close();

      const unr = run({ niche: c.niche, texts: c.unrelated.texts, name: c.unrelated.name, summary: c.unrelated.summary });
      expect(unr.audit!.finalDecision, `unrelated should be OUT_OF_SCOPE for ${c.niche}`).toBe("REJECTED_OUT_OF_SCOPE");
      unr.db.close();
    }
  });
});
