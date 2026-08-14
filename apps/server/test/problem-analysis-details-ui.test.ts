import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Problem analysis details UI",()=>{
  it("expone métricas reales con etiquetas semánticamente correctas",()=>{
    const source=readFileSync(resolve(import.meta.dirname,"../../web/src/features/modules/ModuleView.tsx"),"utf8");
    expect(source).toContain("<details className=\"analysis-details\">");
    expect(source).toContain("Detalles del análisis");
    expect(source).toContain("analysisMetrics");
    expect(source).toContain("RAW");
    expect(source).toContain("Elegibles");
    expect(source).toContain("Procesados semánticamente");
    expect(source).toContain("Coverage");
    expect(source).toContain("Candidatos semánticos");
    expect(source).toContain("candidateInsights");
    expect(source).toContain("Clusters después del merge");
    expect(source).toContain("candidateClusters");
    expect(source).toContain("Problemas validados");
    expect(source).toContain("validatedProblems");
    expect(source).not.toContain("clustersAfterMerge");
  });

  it("distingue métricas ausentes, versiones históricas y relaciones de evidencia",()=>{
    const source=readFileSync(resolve(import.meta.dirname,"../../web/src/features/modules/ModuleView.tsx"),"utf8");
    expect(source).toContain("Esta versión se generó antes de que se registraran métricas detalladas del pipeline.");
    expect(source).toContain("No disponible");
    expect(source).toContain("Relaciones de evidencia rechazadas por ser solo instrucción");
    expect(source).toContain("Relaciones de evidencia rechazadas por ser solo contexto");
    expect(source).toContain("Relaciones positivas sin problema excluidas");
    expect(source).toContain("Algunas rutas de rechazo todavía no cuentan con una métrica específica.");
  });
});
