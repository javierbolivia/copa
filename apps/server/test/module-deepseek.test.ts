import type { Project } from "@our-platform/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { DEEPSEEK_DEFAULT_MODEL } from "../src/integrations/deepseek-provider.js";

function deepSeekResponse(output: unknown) {
  return new Response(JSON.stringify({
    model: DEEPSEEK_DEFAULT_MODEL,
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
    usage: { prompt_tokens: 13, completion_tokens: 9 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("ruta Research con DeepSeek", () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("acepta DeepSeek sólo para Research y expone su estado y modelo", async () => {
    const fetchMock = vi.fn(async () => deepSeekResponse({
      schemaVersion: 1,
      summary: "Resultado Research",
      subniches: ["S"],
      hypotheses: [{ text: "H", provenance: "AI_INFERENCE", evidenceIds: [] }],
      questions: ["Q"],
      searchSuggestions: ["B"],
      insights: [{ text: "I", provenance: "AI_INFERENCE", evidenceIds: [] }],
    }));
    app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      deepSeek: { apiKey: "deepseek-route-key", fetch: fetchMock as typeof fetch },
    });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "DeepSeek", niche: "Prueba" } })).json<Project>();

    const status = await app.inject({ method: "GET", url: `/api/projects/${project.id}/providers/status` });
    expect(status.json()).toMatchObject({ deepseek: { configured: true, model: DEEPSEEK_DEFAULT_MODEL } });

    const research = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "deepseek" } });
    expect(research.statusCode).toBe(200);
    expect(research.json()).toMatchObject({ moduleKey: "research", outputData: { summary: "Resultado Research" } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).model).toBe(DEEPSEEK_DEFAULT_MODEL);

    const blocked = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/product/run`, payload: { provider: "deepseek" } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json<{ message: string }>().message).toContain("Research");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
