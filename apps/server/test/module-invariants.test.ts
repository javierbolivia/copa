import type { ModuleKey, ModuleResult, Project, Workflow } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { AppDatabase } from "../src/database/database.js";
import { DEEPSEEK_DEFAULT_MODEL } from "../src/integrations/deepseek-provider.js";
import { ArtifactRepository } from "../src/repositories/artifact-repository.js";

const SCORES = {
  frequency: 75,
  urgency: 78,
  emotionalIntensity: 85,
  willingnessToPay: 62,
  solutionFeasibility: 90,
  competition: 55,
  differentiation: 82,
  commercialPotential: 76,
  evidenceConfidence: 88,
};

function deepSeekResponse(output: unknown) {
  return new Response(JSON.stringify({
    model: DEEPSEEK_DEFAULT_MODEL,
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
    usage: { prompt_tokens: 40, completion_tokens: 30 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function waitForCalls(mock: ReturnType<typeof vi.fn>, count: number) {
  for (let attempt = 0; attempt < 100 && mock.mock.calls.length < count; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(mock).toHaveBeenCalledTimes(count);
}

function opportunityOutput(problemId: string, evidenceIds: string[]) {
  return {
    schemaVersion: 1,
    items: [{ id: "opp-valid", name: "Oportunidad válida", problemId, evidenceIds, scores: SCORES }],
    selectedId: "opp-valid",
  };
}

function workflowState(workflow: Workflow, stepKey: ModuleKey) {
  return workflow.steps.find((step) => step.stepKey === stepKey)?.state;
}

describe("invariantes E2E de módulos", () => {
  const apps: FastifyInstance[] = [];
  const dirs: string[] = [];
  const diskDb = () => {
    const dir = mkdtempSync(join(tmpdir(), "hallazia-module-invariants-"));
    dirs.push(dir);
    return join(dir, "app.db");
  };
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("Research Focus es idempotente y sólo invalida cuando cambia el valor efectivo", async () => {
    const app = await createApp({ databasePath: ":memory:", serveFrontend: false });
    apps.push(app);
    const project = (await app.inject({
      method: "POST", url: "/api/projects", payload: { name: "Focus", niche: "Perros" },
    })).json<Project>();
    await app.inject({
      method: "POST", url: `/api/projects/${project.id}/sources`,
      payload: { sourceType: "manual", title: "Notas", text: "Mi perro reacciona ante otros perros." },
    });
    await app.inject({
      method: "PUT", url: `/api/projects/${project.id}/research-focus`,
      payload: { value: "Perros reactivos", source: "user" },
    });
    expect((await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/problems/run`, payload: { provider: "mock" },
    })).statusCode).toBe(200);

    for (const payload of [
      { value: "  Perros   reactivos  ", source: "user" },
      { value: "Consulta automática distinta", source: "youtube_query" },
    ]) {
      const saved = await app.inject({ method: "PUT", url: `/api/projects/${project.id}/research-focus`, payload });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ value: "Perros reactivos", source: "user" });
      const workflow = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/workflow` })).json<Workflow>();
      expect(workflowState(workflow, "problems")).toBe("COMPLETED");
    }

    const changed = await app.inject({
      method: "PUT", url: `/api/projects/${project.id}/research-focus`,
      payload: { value: "Ansiedad por separación", source: "user" },
    });
    expect(changed.statusCode).toBe(200);
    const workflow = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/workflow` })).json<Workflow>();
    expect(workflowState(workflow, "problems")).toBe("STALE");
  });

  it("bloquea un draft de Problems creado antes de cambiar Research Focus", async () => {
    const app = await createApp({ databasePath: ":memory:", serveFrontend: false });
    apps.push(app);
    const project = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>().project;
    const problems = (await app.inject({
      method: "GET", url: `/api/projects/${project.id}/modules/problems`,
    })).json<{ results: ModuleResult[] }>().results[0]!;
    const draft = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/problems/drafts`,
      payload: { outputData: problems.outputData },
    });
    expect(draft.statusCode).toBe(201);

    expect((await app.inject({
      method: "PUT", url: `/api/projects/${project.id}/research-focus`,
      payload: { value: "Un foco semántico nuevo", source: "user" },
    })).statusCode).toBe(200);
    const approval = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/problems/versions/${draft.json<ModuleResult>().versionId}/approve`,
    });
    expect(approval.statusCode).toBe(409);
    expect(approval.json<{ message: string }>().message).toMatch(/obsolet|foco|vigente/i);
  });

  it("bloquea Problems si Research Focus cambia mientras espera al provider", async () => {
    const release = deferred<void>();
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) await release.promise;
      return deepSeekResponse({ schemaVersion: 1, items: [] });
    });
    const app = await createApp({
      databasePath: ":memory:", serveFrontend: false,
      deepSeek: { apiKey: "test-key", fetch: fetchMock as unknown as typeof fetch },
    });
    apps.push(app);
    const project = (await app.inject({
      method: "POST", url: "/api/projects", payload: { name: "Focus race", niche: "Foco original" },
    })).json<Project>();
    await app.inject({
      method: "POST", url: `/api/projects/${project.id}/sources`,
      payload: { sourceType: "manual", title: "Notas", text: "Evidencia suficiente para la prueba." },
    });
    await app.inject({
      method: "PUT", url: `/api/projects/${project.id}/research-focus`,
      payload: { value: "Foco original explícito", source: "user" },
    });

    const running = app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/problems/run`, payload: { provider: "deepseek" },
    });
    await waitForCalls(fetchMock, 1);
    expect((await app.inject({
      method: "PUT", url: `/api/projects/${project.id}/research-focus`,
      payload: { value: "Foco cambiado durante ejecución", source: "user" },
    })).statusCode).toBe(200);
    release.resolve(undefined);

    const response = await running;
    expect(response.statusCode).toBe(409);
    expect(response.json<{ message: string }>().message).toMatch(/foco|cambi|vigente/i);
    const history = (await app.inject({
      method: "GET", url: `/api/projects/${project.id}/modules/problems`,
    })).json<{ results: ModuleResult[] }>().results;
    expect(history).toHaveLength(0);
  });

  it("bloquea aprobar un draft cuando su padre fue reemplazado", async () => {
    const app = await createApp({ databasePath: ":memory:", serveFrontend: false });
    apps.push(app);
    const project = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>().project;
    const problems = (await app.inject({
      method: "GET", url: `/api/projects/${project.id}/modules/problems`,
    })).json<{ results: ModuleResult[] }>().results[0]!;
    const draft = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/problems/drafts`,
      payload: { outputData: problems.outputData },
    });
    expect(draft.statusCode).toBe(201);
    const draftId = draft.json<ModuleResult>().versionId;

    expect((await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/sources/run`, payload: { provider: "mock" },
    })).statusCode).toBe(200);
    const approval = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/problems/versions/${draftId}/approve`,
    });
    expect(approval.statusCode).toBe(409);
    expect(approval.json<{ message: string }>().message).toMatch(/padre|obsolet|vigente/i);
  });

  it("normaliza scoring de drafts y rechaza referencias de Opportunities fuera del Problems padre", async () => {
    let providerOutput: unknown;
    const fetchMock = vi.fn(async () => deepSeekResponse(providerOutput));
    const databasePath = diskDb();
    const app = await createApp({
      databasePath, serveFrontend: false,
      deepSeek: { apiKey: "test-key", fetch: fetchMock as unknown as typeof fetch },
    });
    apps.push(app);
    const project = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>().project;

    // The demo's deterministic quality gates can legitimately leave Problems
    // empty. Seed one approved Problems version through the real repository so
    // this test isolates Opportunity lineage/reference invariants.
    const setupDb = new AppDatabase(databasePath);
    const active = setupDb.connection.prepare(`SELECT a.id artifactId,a.active_version_id activeVersionId
      FROM artifacts a WHERE a.project_id=? AND a.artifact_type=?`).get(project.id, "problems") as { artifactId: string; activeVersionId: string };
    const sourcesParent = setupDb.connection.prepare(`SELECT a.active_version_id id
      FROM artifacts a WHERE a.project_id=? AND a.artifact_type='sources'`).get(project.id) as { id: string };
    new ArtifactRepository(setupDb).createVersion({
      projectId: project.id,
      artifactType: "problems",
      name: "Problemas",
      artifactId: active.artifactId,
      inputSnapshot: { source: "test-fixture" },
      outputData: { schemaVersion: 1, items: [{ id: "problem-valid", name: "Problema válido", category: "pain", summary: "Problema validado", evidenceIds: [] }] },
      parentVersionIds: [sourcesParent.id],
    });
    setupDb.close();

    const parentProblem = { id: "problem-valid", evidenceIds: [] as string[] };
    providerOutput = opportunityOutput(parentProblem.id, parentProblem.evidenceIds);
    const generated = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(generated.statusCode, generated.body).toBe(200);
    const canonical = generated.json<ModuleResult>().outputData as Record<string, unknown>;

    const forged = structuredClone(canonical) as { items: Array<Record<string, unknown>> };
    forged.items[0] = {
      ...forged.items[0],
      total: 999,
      scoreFormula: { version: "forged", weights: { frequency: 1 } },
    };
    const normalized = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/drafts`,
      payload: { outputData: forged },
    });
    expect(normalized.statusCode, normalized.body).toBe(201);
    const normalizedItem = (normalized.json<ModuleResult>().outputData as { items: Array<Record<string, unknown>> }).items[0]!;
    expect(normalizedItem.total).toBe(78);
    expect(normalizedItem.scoreFormula).toMatchObject({ version: "1.0" });

    const invalidCases: Array<[string, unknown]> = [
      ["selectedId", { ...canonical, selectedId: "missing-opportunity" }],
      ["problemId", { ...canonical, items: [{ ...(canonical.items as Array<Record<string, unknown>>)[0], problemId: "missing-problem" }] }],
      ["evidenceId", { ...canonical, items: [{ ...(canonical.items as Array<Record<string, unknown>>)[0], evidenceIds: ["missing-evidence"] }] }],
      ["tipo de evidenceId", { ...canonical, items: [{ ...(canonical.items as Array<Record<string, unknown>>)[0], evidenceIds: [123] }] }],
    ];
    for (const [label, outputData] of invalidCases) {
      const rejected = await app.inject({
        method: "POST", url: `/api/projects/${project.id}/modules/opportunities/drafts`, payload: { outputData },
      });
      expect(rejected.statusCode, `${label}: ${rejected.body}`).toBe(409);
    }
  });

  it("bloquea una generación si su versión padre cambia mientras espera al provider", async () => {
    const release = deferred<void>();
    const fetchMock = vi.fn(async () => {
      await release.promise;
      return deepSeekResponse({ schemaVersion: 1, items: [] });
    });
    const app = await createApp({
      databasePath: ":memory:", serveFrontend: false,
      deepSeek: { apiKey: "test-key", fetch: fetchMock as unknown as typeof fetch },
    });
    apps.push(app);
    const project = (await app.inject({
      method: "POST", url: "/api/projects", payload: { name: "Parent race", niche: "Prueba" },
    })).json<Project>();
    await app.inject({
      method: "POST", url: `/api/projects/${project.id}/sources`,
      payload: { sourceType: "manual", title: "Primera", text: "Primera evidencia" },
    });

    const running = app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/problems/run`, payload: { provider: "deepseek" },
    });
    await waitForCalls(fetchMock, 1);
    await app.inject({
      method: "POST", url: `/api/projects/${project.id}/sources`,
      payload: { sourceType: "manual", title: "Segunda", text: "Segunda evidencia" },
    });
    expect((await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/sources/run`, payload: { provider: "mock" },
    })).statusCode).toBe(200);
    release.resolve(undefined);

    const response = await running;
    expect(response.statusCode).toBe(409);
    expect(response.json<{ message: string }>().message).toMatch(/padre|cambi|obsolet|vigente/i);
    const history = (await app.inject({
      method: "GET", url: `/api/projects/${project.id}/modules/problems`,
    })).json<{ results: ModuleResult[] }>().results;
    expect(history).toHaveLength(0);
  });

  it("una respuesta tardía no sobreescribe una versión activada durante su ejecución", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi.fn(async () => fetchMock.mock.calls.length === 1 ? first.promise : second.promise);
    const app = await createApp({
      databasePath: ":memory:", serveFrontend: false,
      deepSeek: { apiKey: "test-key", fetch: fetchMock as unknown as typeof fetch },
    });
    apps.push(app);
    const project = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>().project;
    const current = (await app.inject({
      method: "GET", url: `/api/projects/${project.id}/modules/research`,
    })).json<{ results: ModuleResult[] }>().results[0]!.outputData as Record<string, unknown>;

    const olderRequest = app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "deepseek" },
    });
    const newerRequest = app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "deepseek" },
    });
    await waitForCalls(fetchMock, 2);
    second.resolve(deepSeekResponse({ ...current, summary: "respuesta más nueva" }));
    const newerResponse = await newerRequest;
    expect(newerResponse.statusCode, newerResponse.body).toBe(200);

    first.resolve(deepSeekResponse({ ...current, summary: "respuesta tardía antigua" }));
    const olderResponse = await olderRequest;
    expect(olderResponse.statusCode).toBe(409);
    expect(olderResponse.json<{ message: string }>().message).toMatch(/cambi|vigente|versión/i);

    const history = (await app.inject({
      method: "GET", url: `/api/projects/${project.id}/modules/research`,
    })).json<{ results: ModuleResult[] }>().results;
    const approved = history.find((version) => version.status === "approved")!;
    expect((approved.outputData as { summary: string }).summary).toBe("respuesta más nueva");
  });
});
