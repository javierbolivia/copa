import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryResultPanel } from "../../web/src/features/refinement/AnalyticsHistory";

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
