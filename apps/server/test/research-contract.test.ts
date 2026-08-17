import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Project } from "@our-platform/shared";
import { createApp } from "../src/app.js";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { ArtifactRepository } from "../src/repositories/artifact-repository.js";

function openAIResponse(output: unknown) {
  return new Response(JSON.stringify({
    status: "completed",
    model: "reported-powerful",
    output: [{ type: "message", content: [{ type: "output_text", text: typeof output === "string" ? output : JSON.stringify(output) }] }],
    usage: { input_tokens: 101, output_tokens: 37 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Strict Research contract + evidence grounding (integration)", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  async function makeApp(fetchMock: ReturnType<typeof vi.fn>) {
    return createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      openAI: { apiKey: "test-key", fetch: fetchMock as typeof fetch },
      llm: { economyModel: "e", powerfulModel: "p" },
    });
  }

  it("TEST 1 — complete valid Research output is APPROVED with all promised sections", async () => {
    const complete = {
      schemaVersion: 1,
      summary: "Resumen completo",
      subniches: ["Subnicho A"],
      hypotheses: [{ text: "Hipótesis A", provenance: "AI_INFERENCE", evidenceIds: [] }],
      questions: ["Pregunta A"],
      searchSuggestions: ["Búsqueda A"],
      insights: [{ text: "Hallazgo A", provenance: "AI_INFERENCE", evidenceIds: [] }],
    };
    const fetchMock = vi.fn(async () => openAIResponse(complete));
    app = await makeApp(fetchMock);
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "R", niche: "Prueba" } })).json<Project>();
    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "openai" } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; outputData: Record<string, unknown> }>();
    expect(body.status).toBe("approved");
    expect(body.outputData.schemaVersion).toBe(2);
    for (const key of ["summary", "subniches", "hypotheses", "questions", "searchSuggestions", "insights"]) {
      expect(body.outputData[key], key).toBeTruthy();
    }
    expect((body.outputData.validationAudit as { ok: boolean }).ok).toBe(true);
    expect((body.outputData.validationAudit as { unresolvedEvidenceRefs: number }).unresolvedEvidenceRefs).toBe(0);
  });

  it("TEST 5 — evidence-invalid (schema-complete) Research output is persisted as a DRAFT, never approved", async () => {
    // Schema-complete (all sections present) but the EVIDENCE_BACKED insight has
    // only an invalid/malformed evidence ID => reaches the validator => DRAFT.
    const incomplete = {
      schemaVersion: 1,
      summary: "Resumen",
      subniches: ["Subnicho A"],
      hypotheses: [{ text: "Hipótesis A", provenance: "AI_INFERENCE", evidenceIds: [] }],
      questions: ["Pregunta A"],
      searchSuggestions: ["Búsqueda A"],
      insights: [{ text: "Hallazgo A", provenance: "EVIDENCE_BACKED", evidenceIds: ["01a010d9-cdb7-76ce-01a010d9-cdb7-76ce-b2d6-0866d0a093df"] }],
    };
    const fetchMock = vi.fn(async () => openAIResponse(incomplete));
    app = await makeApp(fetchMock);
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "R", niche: "Prueba" } })).json<Project>();
    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "openai" } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; outputData: { validationAudit: { ok: boolean; unresolvedEvidenceIds: string[] } } }>();
    expect(body.status).toBe("draft");
    expect(body.outputData.validationAudit.ok).toBe(false);
    expect(body.outputData.validationAudit.unresolvedEvidenceIds).toContain("01a010d9-cdb7-76ce-01a010d9-cdb7-76ce-b2d6-0866d0a093df");
    // No approved version exists.
    const list = await app.inject({ method: "GET", url: `/api/projects/${project.id}/modules/research` });
    const results = list.json<{ results: Array<{ status: string }> }>().results;
    expect(results.some((v) => v.status === "approved")).toBe(false);
  });

  it("TEST 7 — schema-incomplete Research output (missing section) fails the generation explicitly, never approved", async () => {
    // Missing `subniches` violates the strict provider schema => schema_mismatch
    // (after the single repair attempt) => generation FAILED (409), no artifact.
    const incomplete = {
      schemaVersion: 1,
      summary: "Resumen incompleto",
      hypotheses: [{ text: "Hipótesis A", provenance: "AI_INFERENCE", evidenceIds: [] }],
      questions: ["Pregunta A"],
      searchSuggestions: ["Búsqueda A"],
      insights: [{ text: "Hallazgo A", provenance: "AI_INFERENCE", evidenceIds: [] }],
    };
    const fetchMock = vi.fn(async () => openAIResponse(incomplete));
    app = await makeApp(fetchMock);
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "R", niche: "Prueba" } })).json<Project>();
    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "openai" } });
    expect(res.statusCode).toBe(409);
    const list = await app.inject({ method: "GET", url: `/api/projects/${project.id}/modules/research` });
    const results = list.json<{ results: Array<{ status: string }> }>().results;
    expect(results.some((v) => v.status === "approved")).toBe(false);
  });

  it("TEST 15 — historical schemaVersion 1 Research artifact still loads unchanged", () => {
    const db = new AppDatabase(":memory:");
    const project = new ProjectRepository(db).create({ name: "H", niche: "Prueba" });
    const artifacts = new ArtifactRepository(db);
    const legacy = { schemaVersion: 1, summary: "Antiguo", insights: [{ text: "x", provenance: "AI_INFERENCE", evidenceIds: [] }] };
    const version = artifacts.createVersion({ projectId: project.id, artifactType: "research", name: "Investigación", inputSnapshot: {}, outputData: legacy });
    const loaded = artifacts.getVersion(version.id)!;
    // Not retroactively rewritten: no schemaVersion 2 stamp, no validationAudit.
    expect(loaded.outputData).toEqual(legacy);
    db.close();
  });
});
