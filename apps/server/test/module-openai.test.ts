import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { Project } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

function openAIResponse(output: unknown, model = "reported-powerful") {
  return new Response(JSON.stringify({
    status: "completed",
    model,
    output: [{ type: "message", content: [{ type: "output_text", text: typeof output === "string" ? output : JSON.stringify(output) }] }],
    usage: { input_tokens: 101, output_tokens: 37 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("pipeline real de modulos con OpenAI", () => {
  let app: FastifyInstance | undefined;
  const directories: string[] = [];

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("usa prompt versionado, modelo powerful, usage real y persiste atomicamente", async () => {
    const directory = mkdtempSync(join(tmpdir(), "our-platform-openai-"));
    directories.push(directory);
    const databasePath = join(directory, "test.db");
    const fetchMock = vi.fn(async () => openAIResponse({ schemaVersion: 1, summary: "Resultado real", insights: [] }));
    app = await createApp({
      databasePath,
      serveFrontend: false,
      openAI: { apiKey: "test-key", fetch: fetchMock as typeof fetch },
      llm: { economyModel: "economy-test", powerfulModel: "powerful-test", powerfulInputCostPerMillion: 2, powerfulOutputCostPerMillion: 8 },
    });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "OpenAI", niche: "Prueba" } })).json<Project>();
    expect((await app.inject({
      method: "PUT", url: `/api/projects/${project.id}/settings`, payload: {
        language: "es", targetMarket: null, currency: "USD", generalNotes: null,
        preferredLlmProvider: "openai", economyModel: "project-economy", powerfulModel: "project-powerful",
        maxBudget: null, contentLanguage: "es",
      },
    })).statusCode).toBe(200);
    const status = await app.inject({ method: "GET", url: `/api/projects/${project.id}/providers/status` });
    expect(status.json()).toMatchObject({ openai: { configured: true, economyModel: "project-economy", powerfulModel: "project-powerful" }, defaultProvider: "openai" });

    const response = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/research/run`,
      payload: { instructions: "Prioriza patrones repetidos" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ moduleKey: "research", outputData: { summary: "Resultado real" } });
    expect(fetchMock).toHaveBeenCalledOnce();
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>;
    const requestBody = JSON.parse(String(calls[0]![1].body));
    expect(requestBody.model).toBe("project-powerful");
    expect(requestBody.instructions).toContain("Research Agent");
    expect(requestBody.text.format).toMatchObject({ name: "research_output", strict: false });

    await app.close();
    app = undefined;
    const db = new DatabaseSync(databasePath, { readOnly: true });
    const generation = db.prepare("SELECT * FROM generations").get() as Record<string, unknown>;
    const snapshot = JSON.parse(generation.input_snapshot as string) as Record<string, unknown>;
    expect(generation).toMatchObject({ agent_key: "research_agent", provider: "openai", model: "project-powerful", status: "COMPLETED", input_tokens: 101, output_tokens: 37 });
    expect(generation.prompt_version).toMatch(/^1\.0\.0\+sha256\.[a-f0-9]{12}$/);
    expect(generation.estimated_cost).toBeCloseTo(0.000498, 8);
    expect(snapshot).toMatchObject({ provider: "openai", model: "project-powerful", promptPath: "prompts/research.md", instructions: "Prioriza patrones repetidos", context: { moduleKey: "research" } });
    expect(snapshot.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(db.prepare("SELECT COUNT(*) AS total FROM llm_usage").get()).toMatchObject({ total: 1 });
    db.close();
  });

  it("sin key devuelve un error claro y no altera artefactos ni generaciones", async () => {
    app = await createApp({ databasePath: ":memory:", serveFrontend: false, openAI: {} });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Sin key", niche: "Prueba" } })).json<Project>();
    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "openai" } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "module_blocked" });
    expect(response.json<{ message: string }>().message).toContain("OPENAI_API_KEY");
    expect((await app.inject({ method: "GET", url: `/api/projects/${project.id}/generations` })).json()).toEqual({ generations: [] });
    expect((await app.inject({ method: "GET", url: `/api/projects/${project.id}/modules/research` })).json()).toEqual({ results: [] });
  });

  it("repara una vez el formato invalido antes de persistir", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(openAIResponse("no-json"))
      .mockResolvedValueOnce(openAIResponse({ schemaVersion: 1, summary: "Reparado", insights: [] }));
    app = await createApp({ databasePath: ":memory:", serveFrontend: false, openAI: { apiKey: "test-key", fetch: fetchMock as typeof fetch } });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Repair", niche: "Prueba" } })).json<Project>();
    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "openai" } });
    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>;
    const repairBody = JSON.parse(String(calls[1]![1].body));
    expect(repairBody.input).toContain("REPARACION DE FORMATO");
    expect((await app.inject({ method: "GET", url: `/api/projects/${project.id}/generations` })).json<{ generations: unknown[] }>().generations).toHaveLength(1);
  });

  it("registra un intento fallido sin crear un artefacto parcial",async()=>{
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({error:{type:"server_error"}}),{status:500,headers:{"content-type":"application/json"}}));
    app=await createApp({databasePath:":memory:",serveFrontend:false,openAI:{apiKey:"test-key",fetch:fetchMock as typeof fetch}});
    const project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Failure",niche:"Prueba"}})).json<Project>();
    expect((await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/research/run`,payload:{provider:"openai"}})).statusCode).toBe(409);
    const generations=(await app.inject({method:"GET",url:`/api/projects/${project.id}/generations`})).json<{generations:Array<{status:string;artifactVersionId:string|null}>}>().generations;
    expect(generations).toHaveLength(1);expect(generations[0]).toMatchObject({status:"FAILED",artifactVersionId:null});
    expect((await app.inject({method:"GET",url:`/api/projects/${project.id}/modules/research`})).json()).toEqual({results:[]});
  });
});
