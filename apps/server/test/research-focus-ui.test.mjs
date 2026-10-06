// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../web/src/api/client.ts";
import { ModuleView } from "../../web/src/features/modules/ModuleView.tsx";

afterEach(() => vi.restoreAllMocks());

describe("Research Focus editing", () => {
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
});
