// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../web/src/api/client.ts";
import { ModuleView } from "../../web/src/features/modules/ModuleView.tsx";

afterEach(() => vi.restoreAllMocks());

describe("Research Focus editing", () => {
  it("disables a no-op save but preserves explicit manual save of a YouTube-derived focus", async () => {
    vi.spyOn(api, "researchFocus").mockResolvedValue({ value: "Foco anterior", source: "user" });
    vi.spyOn(api, "sources").mockResolvedValue({ sources: [] });
    vi.spyOn(api, "comments").mockResolvedValue({ comments: [], total: 0, eligibleIncluded: 0 });
    vi.spyOn(api, "jobs").mockResolvedValue({ jobs: [] });
    vi.spyOn(api, "youtubeStatus").mockResolvedValue({ configured: false });
    vi.spyOn(api, "marketResearchStatus").mockResolvedValue({
      providers: [],
      analyzers: {
        primary: { analyzer: "deepseek", model: "deepseek-flash", state: "not_configured" },
        fallback: { analyzer: "gemini", model: "gemini-3.5-flash-lite", state: "not_configured" },
      },
    });
    vi.spyOn(api, "latestMarketResearch").mockResolvedValue(null);
    vi.spyOn(api, "marketResearchHistory").mockResolvedValue({ runs: [] });

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
      const field = container.querySelector(".research-focus-panel input");
      const save = container.querySelector(".research-focus-panel button");
      expect(field.value).toBe("Foco anterior");
      expect(save.disabled).toBe(true);

      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      await act(async () => {
        setter.call(field, "  Foco   anterior  ");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(save.disabled).toBe(true);

      await act(async () => {
        setter.call(field, "Nuevo foco");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(save.disabled).toBe(false);

      api.researchFocus.mockResolvedValue({ value: "Foco anterior", source: "youtube_query" });
      await act(async () => root.render(createElement(ModuleView, {
        projectId: "project-2", moduleKey: "sources", evidenceFocus: null,
        onOpenEvidence: () => {}, onChanged: () => {},
      })));
      expect(container.querySelector(".research-focus-panel input").value).toBe("Foco anterior");
      const youtubeFocusSave = container.querySelector(".research-focus-panel button");
      expect(youtubeFocusSave.textContent).toBe("Guardar como foco manual");
      expect(youtubeFocusSave.disabled).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });

  it("prevents edits while a save is in flight so a response cannot erase a newer draft", async () => {
    vi.spyOn(api, "researchFocus").mockResolvedValue({ value: "Foco anterior", source: "user" });
    vi.spyOn(api, "saveResearchFocus").mockImplementation(() => new Promise(() => {}));
    vi.spyOn(api, "sources").mockResolvedValue({ sources: [] });
    vi.spyOn(api, "comments").mockResolvedValue({ comments: [], total: 0, eligibleIncluded: 0 });
    vi.spyOn(api, "jobs").mockResolvedValue({ jobs: [] });
    vi.spyOn(api, "youtubeStatus").mockResolvedValue({ configured: false });
    vi.spyOn(api, "marketResearchStatus").mockResolvedValue({
      providers: [],
      analyzers: {
        primary: { analyzer: "deepseek", model: "deepseek-flash", state: "not_configured" },
        fallback: { analyzer: "gemini", model: "gemini-3.5-flash-lite", state: "not_configured" },
      },
    });
    vi.spyOn(api, "latestMarketResearch").mockResolvedValue(null);
    vi.spyOn(api, "marketResearchHistory").mockResolvedValue({ runs: [] });

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
      const field = container.querySelector(".research-focus-panel input");
      expect(field.value).toBe("Foco anterior");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      await act(async () => {
        setter.call(field, "Nuevo foco que aún no se guardó");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => container.querySelector(".research-focus-panel button").click());
      expect(field.disabled).toBe(true);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });

  it("retries a failed save with the unsaved Focus instead of reloading and discarding it", async () => {
    vi.spyOn(api, "researchFocus").mockResolvedValue({ value: "Foco anterior", source: "user" });
    const saveResearchFocus = vi.spyOn(api, "saveResearchFocus")
      .mockRejectedValueOnce(new Error("conexión interrumpida"))
      .mockResolvedValueOnce({ value: "Nuevo foco persistido", source: "user" });
    vi.spyOn(api, "sources").mockResolvedValue({ sources: [] });
    vi.spyOn(api, "comments").mockResolvedValue({ comments: [], total: 0, eligibleIncluded: 0 });
    vi.spyOn(api, "jobs").mockResolvedValue({ jobs: [] });
    vi.spyOn(api, "youtubeStatus").mockResolvedValue({ configured: false });
    vi.spyOn(api, "marketResearchStatus").mockResolvedValue({
      providers: [],
      analyzers: {
        primary: { analyzer: "deepseek", model: "deepseek-flash", state: "not_configured" },
        fallback: { analyzer: "gemini", model: "gemini-3.5-flash-lite", state: "not_configured" },
      },
    });
    vi.spyOn(api, "latestMarketResearch").mockResolvedValue(null);
    vi.spyOn(api, "marketResearchHistory").mockResolvedValue({ runs: [] });

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
      const field = container.querySelector(".research-focus-panel input");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      await act(async () => {
        setter.call(field, "Nuevo foco persistido");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => container.querySelector(".research-focus-panel button").click());
      expect(container.querySelector('[role="alert"]').textContent).toContain("conexión interrumpida");
      const focusReadsBeforeRetry = api.researchFocus.mock.calls.length;
      await act(async () => container.querySelector('[role="alert"] button').click());
      expect(saveResearchFocus).toHaveBeenNthCalledWith(1, "project-1", "Nuevo foco persistido");
      expect(saveResearchFocus).toHaveBeenNthCalledWith(2, "project-1", "Nuevo foco persistido");
      expect(api.researchFocus).toHaveBeenCalledTimes(focusReadsBeforeRetry);
      expect(field.value).toBe("Nuevo foco persistido");
      expect(container.querySelector('[role="alert"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });
});
