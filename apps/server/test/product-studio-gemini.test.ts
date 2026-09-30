import type { ProductDocument, Project } from "@our-platform/shared";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { GEMINI_ANALYSIS_MODEL } from "../src/integrations/gemini-provider.js";

describe("Product Studio permite elegir Gemini explícitamente", () => {
  it("genera outline y capítulo con Gemini sin fallback", async () => {
    const fetchGemini = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        contents: Array<{ parts: Array<{ text: string }> }>;
      };
      const prompt = body.contents[0]?.parts[0]?.text ?? "";
      const isChapter = prompt.includes('"chapter"');
      const output = isChapter
        ? { blocks: [
            { type: "paragraph", content: "Prepara una alternativa segura antes del paseo y revísala con prudencia." },
            { type: "keyTakeaway", content: "No hay resultados garantizados ni sustituto para la evaluación profesional." },
          ] }
        : { chapters: [
            { title: "Preparación", objective: "Identificar opciones seguras.", targetWords: 300 },
            { title: "Revisión", objective: "Anotar hechos observables.", targetWords: 300 },
          ] };
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      gemini: { apiKey: "test-key", model: GEMINI_ANALYSIS_MODEL, fetch: fetchGemini as typeof fetch },
    });

    try {
      const project = (await app.inject({ method: "POST", url: "/api/demo/projects" }))
        .json<{ project: Project }>().project;
      const settings = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/settings` }))
        .json<Record<string, unknown>>();
      const settingUpdate = await app.inject({
        method: "PUT",
        url: `/api/projects/${project.id}/settings`,
        payload: {
          language: settings.language,
          targetMarket: settings.targetMarket,
          currency: settings.currency,
          generalNotes: settings.generalNotes,
          preferredLlmProvider: "gemini",
          economyModel: settings.economyModel,
          powerfulModel: settings.powerfulModel,
          maxBudget: 5,
          contentLanguage: settings.contentLanguage,
          knowledgeEnabled: true,
        },
      });
      expect(settingUpdate.statusCode, settingUpdate.body).toBe(200);

      const documentResponse = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents`,
        payload: { documentType: "ebook", language: "es", length: "short", level: "beginner" },
      });
      expect(documentResponse.statusCode, documentResponse.body).toBe(201);
      let document = documentResponse.json<ProductDocument>();

      const estimate = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/product-documents/${document.id}/generation-estimate`,
      });
      expect(estimate.json()).toMatchObject({ provider: "gemini", model: GEMINI_ANALYSIS_MODEL });

      const outlineResponse = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
        payload: {},
      });
      expect(outlineResponse.statusCode, outlineResponse.body).toBe(200);
      document = outlineResponse.json<ProductDocument>();
      const approval = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/approve`,
        payload: {},
      });
      expect(approval.statusCode, approval.body).toBe(200);
      document = approval.json<ProductDocument>();

      const chapter = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/${document.version.outline[0]!.id}/generate`,
        payload: {},
      });
      expect(chapter.statusCode, chapter.body).toBe(200);
      expect(fetchGemini).toHaveBeenCalledTimes(2);
      const requests = fetchGemini.mock.calls.map(([, init]) => {
        const request = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
        expect(request).toHaveProperty("systemInstruction");
        expect(request).toHaveProperty("generationConfig");
        return request;
      });
      expect(requests.every((request) => !("messages" in request))).toBe(true);

      const generations = (await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/generations`,
      })).json<{ generations: Array<{ agentKey: string; provider: string; model: string; status: string }> }>().generations;
      const productRuns = generations.filter((run) => ["product_outline", "product_chapter"].includes(run.agentKey));
      expect(productRuns).toHaveLength(2);
      expect(productRuns.every((run) => run.provider === "gemini" && run.model === GEMINI_ANALYSIS_MODEL && run.status === "COMPLETED")).toBe(true);
    } finally {
      await app.close();
    }
  });
});
