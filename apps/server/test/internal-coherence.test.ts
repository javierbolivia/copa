import { describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";
import { qualityProblems } from "../src/services/problem-quality-engine.js";
import type { ClusterAuditRecord } from "../src/services/problem-quality-engine.js";
import type { SemanticVocabularySnapshot } from "../src/services/semantic-vocabulary.js";

/**
 * INTERNAL TOPICAL COHERENCE — regression suite.
 *
 * The claim↔evidence cohesion gate already answers "does each evidence support
 * the claim?". These tests pin the NEW evidence↔evidence gate that answers "do
 * the supported pieces of evidence represent ONE problem?".
 *
 * Fixtures may use concrete topics (video/photo, perros, ventas) but the
 * production algorithm is topic-agnostic: it only looks at shared normalized
 * tokens and shared semantic concepts between pieces of evidence.
 */

type QualityResult = { items: unknown[]; analysisAudit: { postMergeClusters: ClusterAuditRecord[] } };

const makeDb = (evidenceTexts: string[], niche = "reducción y eliminación de ruido en fotografías") => {
  const db = new AppDatabase(":memory:");
  const projects = new ProjectRepository(db);
  const sources = new SourceRepository(db);
  const project = projects.create({ name: "P", niche });
  sources.createManual(project.id, { sourceType: "manual", title: "S", text: evidenceTexts.join("\n\n") });
  const ids = db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{ id: string }>;
  return { db, project, ids };
};

describe("Internal topical coherence gate", () => {
  it("TEST A — composite claim (video noise + photo upscale) is rejected despite legacy cohesion 100", () => {
    const { db, project, ids } = makeDb([
      "¿Alguna herramienta para eliminar ruido de video o granito?",
      "disculpe quisiera saber como puedo ampliar una foto antigua sin perder la calidad",
    ]);
    const input = {
      schemaVersion: 1,
      items: [{
        id: "group-10",
        name: "Búsqueda de herramientas específicas para video y ampliación de fotos",
        summary: "Interés en encontrar soluciones o software para eliminar ruido en material de video y métodos para escalar fotos antiguas sin perder calidad.",
        category: "pain",
        researchRelevanceScore: 85,
        evidenceIds: [ids[0]!.id, ids[1]!.id],
      }],
    };
    const result = qualityProblems(db, project.id, input) as QualityResult;
    const audit = result.analysisAudit.postMergeClusters[0]!;
    // Legacy claim↔evidence cohesion is still maximal (each evidence supports a
    // different part of the broad claim), but the evidence graph is disconnected.
    expect(audit.cohesionScore).toBe(100);
    expect(audit.evidencePrecisionScore).toBe(100);
    expect(audit.supportedEvidenceCount).toBe(2);
    expect(audit.internalConnected).toBe(false);
    expect(audit.internalComponentCount).toBe(2);
    expect(audit.largestInternalComponentSize).toBe(1);
    expect(audit.finalDecision).toBe("REJECTED_LOW_INTERNAL_COHERENCE");
    expect(audit.rejectionReason).toMatch(/coherence/i);
    expect(result.items).toHaveLength(0);
    db.close();
  });

  it("TEST B — valid lexical cluster stays connected and validated", () => {
    const { db, project, ids } = makeDb([
      "El hardware es insuficiente para reducir el ruido",
      "Mi hardware no soporta reducir el ruido",
      "El hardware es lento para reducir ruido",
    ]);
    const input = {
      schemaVersion: 1,
      items: [{ id: "hw", name: "Rendimiento insuficiente del hardware", summary: "El hardware es lento para reducir ruido", category: "pain", researchRelevanceScore: 80, evidenceIds: [ids[0]!.id, ids[1]!.id, ids[2]!.id] }],
    };
    const result = qualityProblems(db, project.id, input) as QualityResult;
    const audit = result.analysisAudit.postMergeClusters[0]!;
    expect(audit.internalConnected).toBe(true);
    expect(audit.internalComponentCount).toBe(1);
    expect(audit.largestInternalComponentSize).toBe(3);
    expect(audit.finalDecision).toBe("VALIDATED");
    expect(result.items).toHaveLength(1);
    db.close();
  });

  it("TEST C — semantic bridge connects evidence with little lexical overlap", () => {
    const snap: SemanticVocabularySnapshot = {
      vocabularyVersionId: "v-sem",
      contentHash: "hash-sem",
      concepts: [{ conceptKey: "domain_freeze", label: "domain_freeze", cohesionWeight: 1, aliases: ["se bloquea", "queda congelado"], exclusions: [] }],
    };
    const { db, project, ids } = makeDb([
      "la aplicación se bloquea",
      "queda congelado",
    ]);
    const input = {
      schemaVersion: 1,
      items: [{ id: "fz", name: "La aplicación se bloquea", summary: "La aplicación queda congelado", category: "pain", researchRelevanceScore: 90, evidenceIds: [ids[0]!.id, ids[1]!.id] }],
    };
    const result = qualityProblems(db, project.id, input, { vocabularySnapshot: snap }) as QualityResult;
    const audit = result.analysisAudit.postMergeClusters[0]!;
    // No shared lexical tokens between the two evidences; connected via the
    // dynamic domain concept, so no false reject.
    expect(audit.internalConnected).toBe(true);
    expect(audit.internalComponentCount).toBe(1);
    expect(audit.finalDecision).toBe("VALIDATED");
    db.close();
  });

  it("TEST D — transitive connectivity: A-B-C chain forms a single component", () => {
    const { db, project, ids } = makeDb([
      "eliminar ruido",
      "eliminar ruido granito",
      "ruido granito imagen",
    ]);
    const input = {
      schemaVersion: 1,
      items: [{ id: "t", name: "Eliminación de ruido y granito", summary: "El ruido y el granito arruinan la imagen", category: "pain", researchRelevanceScore: 90, evidenceIds: [ids[0]!.id, ids[1]!.id, ids[2]!.id] }],
    };
    const result = qualityProblems(db, project.id, input) as QualityResult;
    const audit = result.analysisAudit.postMergeClusters[0]!;
    // A-B and B-C bridged, A-C not directly bridged — still one component.
    expect(audit.internalConnected).toBe(true);
    expect(audit.internalComponentCount).toBe(1);
    expect(audit.largestInternalComponentSize).toBe(3);
    expect(audit.finalDecision).toBe("VALIDATED");
    db.close();
  });

  it("TEST E — two disconnected components are rejected as composite", () => {
    const { db, project, ids } = makeDb([
      "eliminar ruido",
      "eliminar ruido granito",
      "ampliar foto antigua sin perder calidad",
      "¿cómo ampliar una foto sin perder calidad?",
    ]);
    const input = {
      schemaVersion: 1,
      items: [{ id: "c", name: "Eliminar ruido y ampliar fotos", summary: "eliminar ruido granito y ampliar fotos antiguas sin perder calidad", category: "pain", researchRelevanceScore: 85, evidenceIds: [ids[0]!.id, ids[1]!.id, ids[2]!.id, ids[3]!.id] }],
    };
    const result = qualityProblems(db, project.id, input) as QualityResult;
    const audit = result.analysisAudit.postMergeClusters[0]!;
    expect(audit.cohesionScore).toBe(100);
    expect(audit.internalConnected).toBe(false);
    expect(audit.internalComponentCount).toBe(2);
    expect(audit.finalDecision).toBe("REJECTED_LOW_INTERNAL_COHERENCE");
    expect(result.items).toHaveLength(0);
    db.close();
  });

  it("TEST F — single supported evidence is never rejected by this gate", () => {
    const { db, project, ids } = makeDb(["eliminar ruido"]);
    const input = {
      schemaVersion: 1,
      items: [{ id: "s", name: "Eliminar ruido", summary: "herramienta para eliminar el ruido", category: "pain", researchRelevanceScore: 90, evidenceIds: [ids[0]!.id] }],
    };
    const result = qualityProblems(db, project.id, input) as QualityResult;
    const audit = result.analysisAudit.postMergeClusters[0]!;
    expect(audit.supportedEvidenceCount).toBe(1);
    expect(audit.internalConnected).toBe(true);
    expect(audit.internalComponentCount).toBe(1);
    expect(audit.finalDecision).toBe("VALIDATED");
    db.close();
  });

  it("TEST G — lexical connectivity works with no vocabulary snapshot (legacy)", () => {
    const { db, project, ids } = makeDb([
      "El hardware es insuficiente para reducir el ruido",
      "El hardware es lento para reducir ruido",
    ]);
    const input = {
      schemaVersion: 1,
      items: [{ id: "g", name: "Rendimiento insuficiente del hardware", summary: "El hardware es lento para reducir ruido", category: "pain", researchRelevanceScore: 80, evidenceIds: [ids[0]!.id, ids[1]!.id] }],
    };
    const result = qualityProblems(db, project.id, input) as QualityResult;
    const audit = result.analysisAudit.postMergeClusters[0]!;
    expect(audit.internalConnected).toBe(true);
    expect(audit.finalDecision).toBe("VALIDATED");
    db.close();
  });

  it("TEST H — semantic bridge uses EXACTLY the supplied snapshot, not latest/global", () => {
    const v1: SemanticVocabularySnapshot = {
      vocabularyVersionId: "v1",
      contentHash: "hash-v1",
      concepts: [{ conceptKey: "domain_freeze", label: "domain_freeze", cohesionWeight: 1, aliases: ["se bloquea", "queda congelado"], exclusions: [] }],
    };
    const v2: SemanticVocabularySnapshot = { vocabularyVersionId: "v2", contentHash: "hash-v2", concepts: [] };
    const { db, project, ids } = makeDb(["la aplicación se bloquea", "queda congelado"]);
    const input = {
      schemaVersion: 1,
      items: [{ id: "h", name: "La aplicación se bloquea", summary: "La aplicación queda congelado", category: "pain", researchRelevanceScore: 90, evidenceIds: [ids[0]!.id, ids[1]!.id] }],
    };
    const r1 = qualityProblems(db, project.id, input, { vocabularySnapshot: v1 }) as QualityResult;
    const r2 = qualityProblems(db, project.id, input, { vocabularySnapshot: v2 }) as QualityResult;
    expect(r1.analysisAudit.postMergeClusters[0]!.internalConnected).toBe(true);
    expect(r1.analysisAudit.postMergeClusters[0]!.finalDecision).toBe("VALIDATED");
    expect(r2.analysisAudit.postMergeClusters[0]!.internalConnected).toBe(false);
    expect(r2.analysisAudit.postMergeClusters[0]!.finalDecision).toBe("REJECTED_LOW_INTERNAL_COHERENCE");
    db.close();
  });

  it("TEST I — audit.claim is exactly the claim the classifier used (name + summary)", () => {
    const { db, project, ids } = makeDb(["eliminar ruido granito", "ruido granito imagen"]);
    const name = "Eliminación de ruido y granito";
    const summary = "El ruido y el granito arruinan la imagen";
    const input = {
      schemaVersion: 1,
      items: [{ id: "i", name, summary, category: "pain", researchRelevanceScore: 90, evidenceIds: [ids[0]!.id, ids[1]!.id] }],
    };
    const result = qualityProblems(db, project.id, input) as QualityResult;
    const audit = result.analysisAudit.postMergeClusters[0]!;
    expect(audit.claim).toBe(`${name} ${summary}`);
    db.close();
  });

  it("TEST J — hardware/slowness cluster remains coherent (no false reject)", () => {
    const { db, project, ids } = makeDb([
      "La reduccion de ruido tarda 30 minutos con mi PC hardware insuficiente",
      "No puedo aplicar la reduccion de ruido porque mi hardware no lo soporta",
      "El hardware es insuficiente y tarda mucho en reducir el ruido",
    ]);
    const input = {
      schemaVersion: 1,
      items: [{ id: "j", name: "Rendimiento insuficiente del hardware e incompatibilidades técnicas", summary: "El hardware es lento y tarda mucho en reducir el ruido", category: "pain", researchRelevanceScore: 86, evidenceIds: [ids[0]!.id, ids[1]!.id, ids[2]!.id] }],
    };
    const result = qualityProblems(db, project.id, input) as QualityResult;
    const audit = result.analysisAudit.postMergeClusters[0]!;
    expect(audit.internalConnected).toBe(true);
    expect(audit.internalComponentCount).toBe(1);
    expect(audit.finalDecision).toBe("VALIDATED");
    db.close();
  });

  it("TEST K — gate is domain-agnostic across fotografía, perros and ventas", () => {
    const cases: Array<{ niche: string; texts: string[]; name: string; summary: string }> = [
      {
        niche: "fotografía",
        texts: ["eliminar el ruido", "gestionar almacenamiento de archivos"],
        name: "Reducción de ruido y almacenamiento",
        summary: "eliminar ruido y gestionar el almacenamiento de archivos",
      },
      {
        niche: "perros",
        texts: ["adiestramiento de cachorros", "mejor alimento para perros senior"],
        name: "Adiestramiento y alimentación canina",
        summary: "adiestrar cachorros y elegir alimento para perros senior",
      },
      {
        niche: "ventas",
        texts: ["los clientes piden reembolsos", "quejas por precios altos"],
        name: "Devoluciones y precios altos",
        summary: "clientes piden reembolsos y quejas por precios altos",
      },
    ];
    for (const c of cases) {
      const { db, project, ids } = makeDb(c.texts, c.niche);
      const input = {
        schemaVersion: 1,
        items: [{ id: "k", name: c.name, summary: c.summary, category: "pain", researchRelevanceScore: 85, evidenceIds: [ids[0]!.id, ids[1]!.id] }],
      };
      const result = qualityProblems(db, project.id, input) as QualityResult;
      const audit = result.analysisAudit.postMergeClusters[0]!;
      expect(audit.supportedEvidenceCount).toBe(2);
      expect(audit.internalComponentCount).toBe(2);
      expect(audit.internalConnected).toBe(false);
      expect(audit.finalDecision).toBe("REJECTED_LOW_INTERNAL_COHERENCE");
      db.close();
    }
  });
});
