// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../web/src/api/client.ts";
import { ModuleView } from "../../web/src/features/modules/ModuleView.tsx";

afterEach(() => vi.restoreAllMocks());

describe("YouTube source selection UI", () => {
  it("locks the displayed query while its search is pending", async () => {
    let finishSearch;
    vi.spyOn(api, "researchFocus").mockResolvedValue({ value: "Tema por defecto", source: "user" });
    vi.spyOn(api, "sources").mockResolvedValue({ sources: [] });
    vi.spyOn(api, "comments").mockResolvedValue({ comments: [], total: 0, eligibleIncluded: 0 });
    vi.spyOn(api, "jobs").mockResolvedValue({ jobs: [] });
    vi.spyOn(api, "youtubeStatus").mockResolvedValue({ configured: true });
    vi.spyOn(api, "marketResearchStatus").mockResolvedValue({
      providers: [],
      analyzers: {
        primary: { analyzer: "deepseek", model: "deepseek-flash", state: "not_configured" },
        fallback: { analyzer: "gemini", model: "gemini-3.5-flash-lite", state: "not_configured" },
      },
    });
    vi.spyOn(api, "latestMarketResearch").mockResolvedValue(null);
    vi.spyOn(api, "marketResearchHistory").mockResolvedValue({ runs: [] });
    vi.spyOn(api, "youtubeSearch").mockImplementation(() => new Promise(resolve => { finishSearch = resolve; }));

    const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ModuleView, {
        projectId: "project-1", moduleKey: "sources", evidenceFocus: null,
        onOpenEvidence: () => {}, onChanged: () => {},
      })));
      const label = [...container.querySelectorAll("label")].find(item => item.textContent.includes("Tema o problema a investigar"));
      const field = label.querySelector("input");
      expect(field.value).toBe("Tema por defecto");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      await act(async () => {
        setter.call(field, "Búsqueda de comportamiento canino");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const search = [...container.querySelectorAll("button")].find(button => button.textContent.includes("Buscar videos"));
      await act(async () => search.click());
      expect(field.disabled).toBe(true);
      await act(async () => finishSearch({ items: [] }));
      expect(field.disabled).toBe(false);
    } finally {
      if (finishSearch) await act(async () => finishSearch({ items: [] }));
      await act(async () => root.unmount());
      container.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });

  it("keeps submitted search results aligned if Research Focus changes during the request", async () => {
    let finishSearch;
    vi.spyOn(api, "researchFocus").mockResolvedValue({ value: "Tema por defecto", source: "user" });
    vi.spyOn(api, "saveResearchFocus").mockResolvedValue({ value: "Nuevo foco guardado", source: "user" });
    vi.spyOn(api, "sources").mockResolvedValue({ sources: [] });
    vi.spyOn(api, "comments").mockResolvedValue({ comments: [], total: 0, eligibleIncluded: 0 });
    vi.spyOn(api, "jobs").mockResolvedValue({ jobs: [] });
    vi.spyOn(api, "youtubeStatus").mockResolvedValue({ configured: true });
    vi.spyOn(api, "marketResearchStatus").mockResolvedValue({
      providers: [],
      analyzers: {
        primary: { analyzer: "deepseek", model: "deepseek-flash", state: "not_configured" },
        fallback: { analyzer: "gemini", model: "gemini-3.5-flash-lite", state: "not_configured" },
      },
    });
    vi.spyOn(api, "latestMarketResearch").mockResolvedValue(null);
    vi.spyOn(api, "marketResearchHistory").mockResolvedValue({ runs: [] });
    vi.spyOn(api, "youtubeSearch").mockImplementation(() => new Promise(resolve => { finishSearch = resolve; }));

    const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ModuleView, {
        projectId: "project-1", moduleKey: "sources", evidenceFocus: null,
        onOpenEvidence: () => {}, onChanged: () => {},
      })));
      const labels = [...container.querySelectorAll("label")];
      const researchQuery = labels.find(item => item.textContent.includes("Tema o problema a investigar")).querySelector("input");
      await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent.includes("Buscar videos")).click());
      const focus = container.querySelector(".research-focus-panel input");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      await act(async () => {
        setter.call(focus, "Nuevo foco guardado");
        focus.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => container.querySelector(".research-focus-panel button").click());
      expect(researchQuery.value).toBe("Tema por defecto");
      await act(async () => finishSearch({ items: [{
        videoId: "abcdefghijk", title: "Resultado", researchScore: 85,
        channelTitle: "Canal", commentCount: 1, scoreExplanation: "relevante", alreadyImported: false,
      }] }));
      expect(researchQuery.value).toBe("Tema por defecto");
    } finally {
      if (finishSearch) await act(async () => finishSearch({ items: [] }));
      await act(async () => root.unmount());
      container.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });
});
