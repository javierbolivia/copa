// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ProductStudio } from "../../web/src/features/product-studio/ProductStudio.tsx";
import { api } from "../../web/src/api/client.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const spies = [];
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
  document.body.replaceChildren();
});

function documentFixture(id, title) {
  const chapterId = `chapter-${id}`;
  const versionId = `version-${id}`;
  return {
    id,
    projectId: "project-a",
    productArtifactVersionId: "product-parent",
    opportunityArtifactVersionId: null,
    mechanismArtifactVersionId: null,
    artifactVersionId: `artifact-${id}`,
    documentType: "ebook",
    title,
    subtitle: null,
    language: "es",
    length: "short",
    level: "beginner",
    status: "IN_PROGRESS",
    freshness: "fresh",
    staleReason: null,
    activeVersionId: versionId,
    version: {
      id: versionId,
      documentId: id,
      versionNumber: 1,
      blocks: [],
      outline: [{ id: chapterId, title: `Capítulo ${title}`, objective: "", order: 0, targetWords: 500, status: "PENDING" }],
      theme: { template: "minimal", accentColor: "#336699", typographyScale: 1, spacing: 1, pageSize: "A4", margins: 20 },
      metadata: {},
      revisionKind: "WIZARD",
      createdAt: "2026-10-06T00:00:00.000Z",
    },
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  };
}

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  return { host, root };
}

function selectDocument(host, id) {
  const select = host.querySelector('select[aria-label="Documento activo"]');
  select.value = id;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

const estimate = {
  provider: "openai",
  model: "gpt-test",
  chapters: 2,
  inputTokens: 1000,
  outputTokens: 500,
  estimatedCost: 0.42,
  currency: "USD",
  maxBudget: 2,
  remainingBudget: 1.58,
};

it("clears a shown generation estimate when the selected document changes", async () => {
  const docs = [documentFixture("doc-a", "A"), documentFixture("doc-b", "B")];
  spies.push(vi.spyOn(api, "productDocuments").mockResolvedValue({ documents: docs }));
  spies.push(vi.spyOn(api, "productGenerationEstimate").mockResolvedValue(estimate));
  const { host, root } = mount();

  await act(async () => root.render(React.createElement(ProductStudio, { projectId: "project-a" })));
  const generate = [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Generar pendientes");
  await act(async () => generate.click());
  expect(host.textContent).toContain("Estimación antes del lote");

  await act(async () => {
    selectDocument(host, "doc-b");
    await Promise.resolve();
  });

  expect(host.textContent).toContain("Capítulo B");
  expect(host.textContent).not.toContain("Estimación antes del lote");
  expect(host.textContent).not.toContain("Confirmar generación");
  await act(async () => root.unmount());
});

it("ignores an estimate response that arrives after switching documents", async () => {
  const docs = [documentFixture("doc-a", "A"), documentFixture("doc-b", "B")];
  let resolveEstimate;
  const estimateRequest = new Promise(resolve => { resolveEstimate = resolve; });
  spies.push(vi.spyOn(api, "productDocuments").mockResolvedValue({ documents: docs }));
  spies.push(vi.spyOn(api, "productGenerationEstimate").mockReturnValue(estimateRequest));
  const { host, root } = mount();

  await act(async () => root.render(React.createElement(ProductStudio, { projectId: "project-a" })));
  const generate = [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Generar pendientes");
  await act(async () => generate.click());
  await act(async () => {
    selectDocument(host, "doc-b");
    await Promise.resolve();
  });
  await act(async () => resolveEstimate(estimate));

  expect(host.textContent).toContain("Capítulo B");
  expect(host.textContent).not.toContain("Estimación antes del lote");
  expect(host.textContent).not.toContain("Confirmar generación");
  await act(async () => root.unmount());
});
