import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { AppDatabase } from "../src/database/database.js";
import { createDemoOutput } from "../src/domain/demo-outputs.js";

const geminiSuccess = (output: unknown) => new Response(JSON.stringify({
  responseId: "response-test", candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(output) }] } }],
  usageMetadata: { promptTokenCount: 21, candidatesTokenCount: 13 },
}), { status: 200, headers: { "content-type": "application/json" } });
const geminiBlocked = () => new Response(JSON.stringify({
  responseId: "blocked-test", promptFeedback: { blockReason: "PROHIBITED_CONTENT" }, usageMetadata: { promptTokenCount: 21 },
}), { status: 200, headers: { "content-type": "application/json" } });

describe("Gemini module lifecycle safety", () => {
  let app: FastifyInstance | undefined;
  const directories: string[] = [];
  afterEach(async () => {
    await app?.close(); app = undefined;
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  function databasePath() {
    const directory = mkdtempSync(join(tmpdir(), "hallazia-gemini-lifecycle-"));
    directories.push(directory);
    return join(directory, "app.db");
  }

  it("uses the Gemini projection for Research while preserving canonical evidence byte-for-byte", async () => {
    const path = databasePath();
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const input = JSON.parse(String(JSON.parse(String(init?.body)).contents[0].parts[0].text)) as { evidence: Array<{ id: string; quoteText: string }> };
      expect(input.evidence[0]?.quoteText).not.toContain("hijo de puta");
      return geminiSuccess(createDemoOutput("research", input.evidence.map((item) => item.id)));
    });
    app = await createApp({ databasePath: path, serveFrontend: false, gemini: { apiKey: "test", fetch: fetch as typeof globalThis.fetch } });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Projection", niche: "Prueba" } })).json<{ id: string }>();
    const created = await app.inject({ method: "POST", url: `/api/projects/${project.id}/sources`, payload: { sourceType: "manual", title: "Fuente", text: "Mi vecino dijo joder durante el paseo." } });
    expect(created.statusCode).toBe(201);
    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "gemini" } });
    expect(response.statusCode, response.body).toBe(200);
    await app.close(); app = undefined;

    const db = new AppDatabase(path);
    try {
      expect(db.connection.prepare("SELECT quote_text FROM evidence_snippets WHERE project_id=?").get(project.id)).toEqual({ quote_text: "Mi vecino dijo joder durante el paseo." });
      const generation = db.connection.prepare("SELECT input_snapshot FROM generations WHERE project_id=? AND provider='gemini'").get(project.id) as { input_snapshot: string };
      const snapshot = JSON.parse(generation.input_snapshot) as { providerAttempts: Array<{ stage: string; outcome: string }>; geminiPayloadProjection: Array<{ transformedStringCount: number }> };
      expect(snapshot.providerAttempts).toEqual([expect.objectContaining({ stage: "research/direct", outcome: "usable" })]);
      expect(snapshot.geminiPayloadProjection[0]?.transformedStringCount).toBeGreaterThan(0);
    } finally { db.close(); }
  });

  it("classifies HTTP 200 PROHIBITED_CONTENT and stops Problems after the first MAP request", async () => {
    const path = databasePath();
    const fetch = vi.fn(async () => geminiBlocked());
    app = await createApp({ databasePath: path, serveFrontend: false, gemini: { apiKey: "test", fetch: fetch as typeof globalThis.fetch } });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Fail fast", niche: "Prueba" } })).json<{ id: string }>();
    const text = Array.from({ length: 61 }, (_, index) => `Problema sensible ${index + 1}`).join("\n\n");
    await app.inject({ method: "POST", url: `/api/projects/${project.id}/sources`, payload: { sourceType: "manual", title: "Fuente", text } });
    expect((await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "mock" } })).statusCode).toBe(200);
    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/problems/run`, payload: { provider: "gemini" } });
    expect(response.statusCode, response.body).toBe(409);
    expect(fetch).toHaveBeenCalledTimes(1); // no later MAP batch and no global_reduce after a block
    await app.close(); app = undefined;

    const db = new AppDatabase(path);
    try {
      const generation = db.connection.prepare("SELECT input_snapshot,input_tokens,error_code,error_message FROM generations WHERE project_id=? AND provider='gemini'").get(project.id) as { input_snapshot: string; input_tokens: number; error_code: string; error_message: string };
      const snapshot = JSON.parse(generation.input_snapshot) as { providerAttempts: Array<Record<string, unknown>> };
      expect(generation).toMatchObject({ input_tokens: 21, error_code: "invalid_response", error_message: expect.stringContaining("PROHIBITED_CONTENT") });
      expect(snapshot.providerAttempts).toEqual([expect.objectContaining({ stage: "problems/map", batch: { index: 1, total: 2 }, httpStatus: 200, candidateCount: 0, blockReason: "PROHIBITED_CONTENT", outcome: "empty", attempt: 1 })]);
    } finally { db.close(); }
  });

  it("projects every Problems MAP and global reduce payload without changing canonical text", async () => {
    const path = databasePath();
    const stages: string[] = [];
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const input = JSON.parse(String(JSON.parse(String(init?.body)).contents[0].parts[0].text)) as { stage?: string; evidence?: Array<{ id: string }> };
      stages.push(input.stage ?? "direct");
      expect(JSON.stringify(input)).not.toContain("joder");
      return geminiSuccess(createDemoOutput("problems", input.evidence?.map((item) => item.id) ?? []));
    });
    const discoveryProvider = { name: "local-test", generate: async () => { throw new Error("discovery disabled in this lifecycle fixture"); } };
    app = await createApp({ databasePath: path, serveFrontend: false, gemini: { apiKey: "test", fetch: fetch as typeof globalThis.fetch }, llm: { discoveryProvider } });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Projection batches", niche: "Prueba", description: "joder: texto canónico de contexto" } })).json<{ id: string }>();
    const text = Array.from({ length: 61 }, (_, index) => `Comentario ${index + 1} con joder y contexto.`).join("\n\n");
    await app.inject({ method: "POST", url: `/api/projects/${project.id}/sources`, payload: { sourceType: "manual", title: "Fuente", text } });
    expect((await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "mock" } })).statusCode).toBe(200);
    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/problems/run`, payload: { provider: "gemini" } });
    expect(response.statusCode, response.body).toBe(200);
    expect(stages).toEqual(["map", "map", "global_reduce"]);
    expect(fetch).toHaveBeenCalledTimes(3);
    await app.close(); app = undefined;
    const db = new AppDatabase(path);
    try {
      const canonical = db.connection.prepare("SELECT quote_text FROM evidence_snippets WHERE project_id=? LIMIT 1").get(project.id) as { quote_text: string };
      expect(canonical.quote_text).toContain("joder");
      const row = db.connection.prepare("SELECT input_snapshot FROM generations WHERE project_id=? AND provider='gemini'").get(project.id) as { input_snapshot: string };
      const attempts = (JSON.parse(row.input_snapshot) as { providerAttempts: Array<{ stage: string }> }).providerAttempts;
      expect(attempts.map((item) => item.stage)).toEqual(["problems/map", "problems/map", "problems/global_reduce"]);
    } finally { db.close(); }
  });

  it.each([429, 503])("retries Gemini HTTP %s once with a bounded policy", async (status) => {
    const path = databasePath();
    let calls = 0;
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ error: { status: status === 429 ? "RESOURCE_EXHAUSTED" : "UNAVAILABLE", message: "temporary" } }), { status, headers: { "content-type": "application/json" } });
      const input = JSON.parse(String(JSON.parse(String(init?.body)).contents[0].parts[0].text)) as { evidence: Array<{ id: string }> };
      return geminiSuccess(createDemoOutput("research", input.evidence.map((item) => item.id)));
    });
    app = await createApp({ databasePath: path, serveFrontend: false, gemini: { apiKey: "test", fetch: fetch as typeof globalThis.fetch } });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: `Retry ${status}`, niche: "Prueba" } })).json<{ id: string }>();
    const response = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "gemini" } });
    expect(response.statusCode, response.body).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    await app.close(); app = undefined;
    const db = new AppDatabase(path);
    try {
      const row = db.connection.prepare("SELECT input_snapshot FROM generations WHERE project_id=? AND provider='gemini'").get(project.id) as { input_snapshot: string };
      const attempts = (JSON.parse(row.input_snapshot) as { providerAttempts: Array<{ attempt: number; httpStatus?: number; outcome: string }> }).providerAttempts;
      expect(attempts).toEqual([expect.objectContaining({ attempt: 1, httpStatus: status, outcome: "error" }), expect.objectContaining({ attempt: 2, outcome: "usable" })]);
    } finally { db.close(); }
  });
});
