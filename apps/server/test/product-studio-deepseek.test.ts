import type { ProductDocument, Project } from "@our-platform/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { DEEPSEEK_DEFAULT_MODEL } from "../src/integrations/deepseek-provider.js";

describe("Product Studio usa DeepSeek sin fallback a mock", () => {
  it("genera outline y un capítulo con dos llamadas explícitas al proveedor configurado", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const prompt = body.messages.at(-1)?.content ?? "";
      const isChapter = prompt.includes('"chapter"');
      const output = isChapter
        ? { blocks: [
            { type: "paragraph", content: "Observa el entorno desde una distancia segura.", evidenceIds: ["not-a-real-evidence-id"] },
            { type: "keyTakeaway", content: "Prioriza la seguridad y avanza gradualmente." },
          ] }
        : { chapters: [
            { title: "Preparación", objective: "Identificar señales y condiciones del entorno.", targetWords: 300 },
            { title: "Práctica segura", objective: "Aplicar pasos graduales y revisar resultados.", targetWords: 300 },
          ] };
      return new Response(JSON.stringify({
        model: DEEPSEEK_DEFAULT_MODEL,
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
        usage: { prompt_tokens: 100, completion_tokens: 80 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      deepSeek: { apiKey: "test-key", fetch: fetchMock as typeof fetch },
    });

    try {
      const project = (await app.inject({ method: "POST", url: "/api/demo/projects" }))
        .json<{ project: Project }>().project;
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
      expect(estimate.json()).toMatchObject({ provider: "deepseek", model: DEEPSEEK_DEFAULT_MODEL });

      const outlineResponse = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
        payload: {},
      });
      expect(outlineResponse.statusCode, outlineResponse.body).toBe(200);
      document = outlineResponse.json<ProductDocument>();
      const approved = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/approve`,
        payload: {},
      });
      expect(approved.statusCode, approved.body).toBe(200);
      document = approved.json<ProductDocument>();
      const chapter = document.version.outline[0]!;
      const chapterResponse = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/${chapter.id}/generate`,
        payload: {},
      });
      expect(chapterResponse.statusCode, chapterResponse.body).toBe(200);
      const generatedDocument = chapterResponse.json<ProductDocument>();
      expect(generatedDocument.version.blocks.some((block) =>
        block.metadata.chapterId === chapter.id && String(block.content).includes("distancia segura"),
      )).toBe(true);
      expect(generatedDocument.version.blocks.some((block) =>
        Array.isArray(block.metadata.evidenceIds) && block.metadata.evidenceIds.includes("not-a-real-evidence-id"),
      )).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const outputLimits = fetchMock.mock.calls.map(([, init]) =>
        (JSON.parse(String((init as RequestInit).body)) as { max_tokens: number }).max_tokens,
      );
      expect(outputLimits).toEqual([4000, 5000]);
      const chapterRequest = JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body));
      expect(chapterRequest.messages[0].content).toContain("UUID exacto");
      expect(chapterRequest.messages[0].content).toContain("no uses alias como item-1 o E1");
      for (const [, init] of fetchMock.mock.calls) {
        const request = JSON.parse(String((init as RequestInit).body));
        expect(request).toMatchObject({
          model: DEEPSEEK_DEFAULT_MODEL,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
        });
      }
    } finally {
      await app.close();
    }
  });
});
