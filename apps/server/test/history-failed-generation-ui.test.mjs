import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyticsHistory, HistoryResultPanel } from "../../web/src/features/refinement/AnalyticsHistory";

const failedGeneration = {
  id: "generation-failed",
  projectId: "project-a",
  projectName: "Proyecto actual",
  moduleName: "Opportunity Scorer",
  provider: "deepseek",
  model: "deepseek-flash",
  status: "FAILED",
  createdAt: "2026-10-03T10:00:00.000Z",
  inputTokens: 0,
  outputTokens: 0,
  estimatedCost: 0,
  durationMs: 287,
  errorCode: "transport_error",
  result: { title: "Opportunity Scorer", summary: "Resultado estructurado guardado.", fields: [{ label: "output", value: "partial" }] },
};

const render = (generation) => renderToStaticMarkup(createElement(HistoryResultPanel, { item: generation, demoMode: false }));

describe("failed generation history", () => {
  it("explains transport failures without presenting a saved or partial result", () => {
    const html = render(failedGeneration);
    expect(html).toContain("EJECUCIÓN FALLIDA");
    expect(html).toContain('role="alert"');
    expect(html).toContain("No se pudo establecer conexión con DeepSeek. No se guardó un resultado.");
    expect(html).toContain("transport_error");
    expect(html).not.toContain("Resultado estructurado guardado.");
    expect(html).not.toContain("partial");
  });

  it("retains structured fields for completed generations", () => {
    const html = render({ ...failedGeneration, status: "COMPLETED", errorCode: null });
    expect(html).toContain("RESULTADO HISTÓRICO");
    expect(html).toContain("partial");
    expect(html).not.toContain("EJECUCIÓN FALLIDA");
  });
});

describe("mixed provider history", () => {
  it("never presents Mock or local estimates as paid costs", () => {
    const generations = [
      { ...failedGeneration, id: "mock", provider: "mock", model: "demo", status: "COMPLETED", estimatedCost: 2 },
      { ...failedGeneration, id: "local", provider: "local", model: "local-sources-v1", status: "COMPLETED", estimatedCost: 4 },
      { ...failedGeneration, id: "gemini", provider: "gemini", status: "COMPLETED", estimatedCost: 0.5 },
    ];
    const html = renderToStaticMarkup(createElement(AnalyticsHistory, { generations, demoMode: false }));
    expect(html).toContain('Coste total</span><strong>$0.50</strong>');
    expect(html).toContain('Coste por proyecto');
    expect(html).not.toContain('$6.50');
    expect(html).not.toContain('$2.00');
    expect(html).not.toContain('$4.00');
  });
});
