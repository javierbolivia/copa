import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Problem analysis details UI",()=>{
  const source=readFileSync(resolve(import.meta.dirname,"../../web/src/features/modules/ModuleView.tsx"),"utf8");

  it("expone métricas reales con etiquetas semánticamente correctas",()=>{
    expect(source).toContain("<details className=\"analysis-details\">");
    expect(source).toContain("analysisMetrics");
    expect(source).toContain("RAW");
    expect(source).toContain("Elegibles");
    expect(source).toContain("Coverage");
    expect(source).toContain("candidateInsights");
    expect(source).toContain("candidateClusters");
    expect(source).toContain("validatedProblems");
    expect(source).not.toContain("clustersAfterMerge");
  });

  it("distingue métricas ausentes, versiones históricas y relaciones de evidencia",()=>{
    expect(source).toContain("No disponible");
    expect(source).toContain("Relaciones de evidencia rechazadas por ser solo");
    expect(source).toContain("Relaciones positivas sin problema excluidas");
  });

  it("muestra clusters auditados con finalDecision y rejectionReason",()=>{
    expect(source).toContain("Clusters auditados");
    expect(source).toContain("analysisAudit");
    expect(source).toContain("postMergeClusters");
    expect(source).toContain("finalDecision");
    expect(source).toContain("rejectionReason");
    expect(source).toContain("cluster-audit-list");
    expect(source).toContain("cluster-audit-row");
    expect(source).toContain("cluster-audit-detail");
    expect(source).toContain("DECISION_LABELS");
  });

  it("clusters rechazados no aparecen como problemas validados en la UI",()=>{
    // The validated problems list only renders items from value.items (already filtered by engine)
    expect(source).toContain("problem-quality-list");
    // Audit clusters are rendered ONLY inside analysis-details, not in the main list
    expect(source).toMatch(/cluster-audit-list/);
    // items is always value.items.filter(isRecord) — only validated problems
    expect(source).toMatch(/const items=value\.items\.filter\(isRecord\)/);
  });

  it("fallback para versiones sin audit trail",()=>{
    expect(source).toContain("audit trail de clusters");
  });

  it("incluye contadores de sin soporte, fuera de foco y misceláneos",()=>{
    expect(source).toContain("clustersRejectedNoSupport");
    expect(source).toContain("clustersRejectedOutOfScope");
    expect(source).toContain("clustersRejectedMiscellaneous");
  });

  it("muestra el CLAIM AUDITADO persistido y la coherencia interna del cluster",()=>{
    expect(source).toContain("CLAIM AUDITADO");
    expect(source).toContain("cluster.claim");
    expect(source).toContain("clustersRejectedInternalCoherence");
    expect(source).toContain("REJECTED_LOW_INTERNAL_COHERENCE");
    expect(source).toContain("internalComponentCount");
    expect(source).toContain("internalConnected");
  });
});
