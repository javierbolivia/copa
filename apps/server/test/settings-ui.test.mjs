import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(appSource).toContain('const saved=await api.saveSettings(selected.id,input);if(current())setSettings(saved);');
    expect(appSource).toContain('catch(reason){if(current())setError(messageOf(reason));}finally{if(current())setBusy(false);}');
  });
});
