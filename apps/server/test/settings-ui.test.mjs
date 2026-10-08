import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hasUnsavedProjectSettings } from "../../web/src/features/settings/settings-dirty.ts";

const source = readFileSync(
  resolve(import.meta.dirname, "../../web/src/features/settings/SettingsView.tsx"),
  "utf8",
);
const appSource = readFileSync(resolve(import.meta.dirname, "../../web/src/App.tsx"), "utf8");

describe("Settings provider disclosure", () => {
  it("keeps provider status explicitly unknown until the project-scoped check resolves", () => {
    expect(source).toContain('const providerChecking=providerStatus===null;');
    expect(source).toContain('Verificando proveedores configurados');
    expect(source).not.toContain('providerStatus?.openai.configured?"OpenAI configurado":"OpenAI no configurado"');
  });

  it("shows every selectable provider and does not present OpenAI model controls for other providers", () => {
    expect(source).toContain('name:"Gemini"');
    expect(source).toContain('name:"DeepSeek"');
    expect(source).toContain('const customModelsApply=selectedProvider==="openai";');
    expect(source).toContain('Modelos personalizados (solo OpenAI)');
  });

  it("does not apply a late settings save to a newly selected project", () => {
    expect(appSource).toContain('const current=systemRequests.capture();setBusy(true);');
    expect(appSource).toContain('const saved=await api.saveSettings(selected.id,input);if(current()){setSettings(saved);setSavedSettings(saved);}');
    expect(appSource).toContain('catch(reason){if(current())setError(messageOf(reason));}finally{if(current())setBusy(false);}');
  });

  it("does not expose a save action when settings match the persisted snapshot", () => {
    expect(source).toContain('disabled={!hasChanges||saving}');
    expect(appSource).toContain('!hasUnsavedProjectSettings(settings,savedSettings)');
  });
});

describe("settings change detection", () => {
  const saved = {
    projectId: "project-a",
    language: "es",
    targetMarket: null,
    currency: "USD",
    generalNotes: null,
    preferredLlmProvider: "mock",
    economyModel: null,
    powerfulModel: null,
    maxBudget: null,
    contentLanguage: "es",
    knowledgeEnabled: true,
    updatedAt: "2026-10-08T00:00:00.000Z",
  };

  it("ignores snapshot metadata and unchanged field values", () => {
    expect(hasUnsavedProjectSettings({ ...saved, updatedAt: "2026-10-08T01:00:00.000Z" }, saved)).toBe(false);
  });

  it.each([
    ["language", "en"],
    ["targetMarket", "Bolivia"],
    ["currency", "BOB"],
    ["generalNotes", "nota"],
    ["preferredLlmProvider", "gemini"],
    ["economyModel", "custom-model"],
    ["powerfulModel", "custom-model"],
    ["maxBudget", 10],
    ["contentLanguage", "en"],
    ["knowledgeEnabled", false],
  ])("detects a change to %s", (field, value) => {
    expect(hasUnsavedProjectSettings({ ...saved, [field]: value }, saved)).toBe(true);
  });

  it("does not compare settings across different projects", () => {
    expect(hasUnsavedProjectSettings({ ...saved, projectId: "project-b", language: "en" }, saved)).toBe(false);
  });
});
