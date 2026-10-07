// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../web/src/api/client.ts";
import { ModuleView } from "../../web/src/features/modules/ModuleView.tsx";

const providerStatus = (name, configuredProvider = name) => ({
  generationBlock: null,
  openai: { configured: false, economyModel: "", powerfulModel: "" },
  gemini: { configured: false, economyModel: "", powerfulModel: "" },
  deepseek: { configured: false, model: "" },
  groq: { configured: configuredProvider === "groq", model: "qwen/qwen3.8-27b" },
  openrouter: { configured: configuredProvider === "openrouter", model: "openrouter/free" },
  defaultProvider: name,
});

afterEach(() => vi.restoreAllMocks());

describe("generated module provider selection", () => {
  it.each(["groq", "openrouter"])("shows and sends the configured %s default", async (provider) => {
    const generation = {
      versionId: "version-1", versionNumber: 1, status: "draft", freshness: "fresh",
      createdAt: "2026-10-06T00:00:00.000Z", outputData: { summary: "Test" },
    };
    vi.spyOn(api, "moduleResults").mockResolvedValue({ results: [] });
    vi.spyOn(api, "files").mockResolvedValue({ files: [] });
    vi.spyOn(api, "providerStatus").mockResolvedValue(providerStatus(provider));
    vi.spyOn(api, "generationVersionMetadata").mockResolvedValue({ generations: [] });
    const runModule = vi.spyOn(api, "runModule").mockResolvedValue(generation);
    const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ModuleView, {
        projectId: "project-1", moduleKey: "research", evidenceFocus: null,
        onOpenEvidence: () => {}, onChanged: () => {},
      })));
      const select = container.querySelector("select");
      expect(select.value).toBe(provider);
      expect([...select.options].some((option) => option.value === provider && !option.disabled)).toBe(true);
      const generate = [...container.querySelectorAll("button")].find((button) => button.textContent.includes(`Generar con ${provider === "groq" ? "Groq" : "OpenRouter"}`));
      expect(generate).toBeTruthy();
      await act(async () => generate.click());
      expect(runModule).toHaveBeenCalledWith("project-1", "research", { provider });
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });

  it("labels an unconfigured default honestly and disables every generation entry point", async () => {
    vi.spyOn(api, "moduleResults").mockResolvedValue({ results: [] });
    vi.spyOn(api, "files").mockResolvedValue({ files: [] });
    vi.spyOn(api, "providerStatus").mockResolvedValue(providerStatus("groq", null));
    vi.spyOn(api, "generationVersionMetadata").mockResolvedValue({ generations: [] });
    const runModule = vi.spyOn(api, "runModule");
    const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(ModuleView, {
        projectId: "project-1", moduleKey: "product", evidenceFocus: null,
        onOpenEvidence: () => {}, onChanged: () => {},
      })));
      const groqOption = [...container.querySelectorAll("option")].find((option) => option.value === "groq");
      expect(groqOption.disabled).toBe(true);
      expect(groqOption.textContent).toContain("no configurado");
      const groqButtons = [...container.querySelectorAll("button")].filter((button) => button.textContent.includes("Groq"));
      expect(groqButtons.length).toBeGreaterThan(0);
      expect(groqButtons.every((button) => button.disabled)).toBe(true);
      expect(runModule).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });
});
