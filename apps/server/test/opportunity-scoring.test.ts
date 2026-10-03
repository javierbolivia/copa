import type { ArtifactVersion, ModuleResult, Project } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { DEEPSEEK_DEFAULT_MODEL } from "../src/integrations/deepseek-provider.js";

/**
 * Scoring contract confirmed by architectural audit (Opus) and implemented per
 * OPTION A:
 *   provider scores -> backend validation -> backend deterministic total
 *   -> backend scoreFormula -> persisted canonical Opportunity
 * The provider is NEVER the source of truth for `total`; the backend always
 * recomputes it from the validated `scores` using the weights already defined
 * in module-service.ts (`OPPORTUNITY_SCORE_WEIGHTS`, version "1.0").
 */

const EXPECTED_WEIGHTS = {
  frequency: .15, urgency: .15, emotionalIntensity: .15, willingnessToPay: .10,
  solutionFeasibility: .15, competition: .05, differentiation: .10, commercialPotential: .10,
  evidenceConfidence: .05,
} as const;

/** Distinct, deliberately non-uniform scores so the weighted formula is
 * actually exercised (not just averaging). total = 68 (see report). */
const VALID_SCORES = {
  frequency: 80, urgency: 70, emotionalIntensity: 60, willingnessToPay: 50,
  solutionFeasibility: 90, competition: 40, differentiation: 55,
  commercialPotential: 65, evidenceConfidence: 75,
};
const EXPECTED_TOTAL_FOR_VALID_SCORES = 68;

/** Exact scores createContextOutput()/mock path uses by default when evidence
 * exists (evidenceConfidence: 65). total = 56. Used to prove mock and
 * provider-real paths apply the identical formula. */
const MOCK_DEFAULT_SCORES = {
  frequency: 60, urgency: 55, emotionalIntensity: 50, willingnessToPay: 40,
  solutionFeasibility: 70, competition: 50, differentiation: 55,
  commercialPotential: 55, evidenceConfidence: 65,
};
const EXPECTED_TOTAL_FOR_MOCK_DEFAULT_SCORES = 56;

function opportunitiesOutput(scores: Record<string, unknown>, extraItemFields: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    items: [{
      id: "opp-1",
      name: "Oportunidad de prueba",
      problemId: "problem-1",
      evidenceIds: [],
      scores,
      ...extraItemFields,
    }],
    selectedId: "opp-1",
  };
}

function deepSeekResponse(output: unknown) {
  return new Response(JSON.stringify({
    model: DEEPSEEK_DEFAULT_MODEL,
    choices: [{ finish_reason: "stop", message: { content: typeof output === "string" ? output : JSON.stringify(output) } }],
    usage: { prompt_tokens: 40, completion_tokens: 30 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function deepSeekResponsesResponse(output: unknown) {
  return new Response(JSON.stringify({
    model: DEEPSEEK_DEFAULT_MODEL,
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    usage: { input_tokens: 40, output_tokens: 30 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("scoring determinista de Opportunities (provider scores -> backend total)", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  /** Creates a project with one manual source and a fresh Problems version
   * (mock provider), so Opportunities' parent dependency is never stale. */
  async function projectWithFreshProblems(deepSeekFetch: typeof fetch): Promise<Project> {
    app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      deepSeek: { apiKey: "scoring-test-key", fetch: deepSeekFetch },
    });
    const project = (await app.inject({
      method: "POST", url: "/api/projects", payload: { name: "Scoring", niche: "Prueba" },
    })).json<Project>();
    await app.inject({
      method: "POST", url: `/api/projects/${project.id}/sources`,
      payload: { sourceType: "manual", title: "Notas", text: "Problema real observado en el corpus de evidencia." },
    });
    const problems = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/problems/run`, payload: { provider: "mock" },
    });
    expect(problems.statusCode).toBe(200);
    return project;
  }

  it("A. scores completos: acepta el output y el backend calcula total determinista", async () => {
    const fetchMock = vi.fn(async () => deepSeekResponse(opportunitiesOutput(VALID_SCORES)));
    const project = await projectWithFreshProblems(fetchMock as unknown as typeof fetch);

    const response = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(response.statusCode).toBe(200);
    const item = (response.json<ModuleResult>().outputData as { items: Array<Record<string, unknown>> }).items[0]!;
    expect(item.total).toBe(EXPECTED_TOTAL_FOR_VALID_SCORES);
    expect(item.scores).toMatchObject(VALID_SCORES);
  });

  it("registra si las citas de una oportunidad vinieron del provider o del fallback del backend", async () => {
    const fetchMock = vi.fn();
    const project = await projectWithFreshProblems(fetchMock as unknown as typeof fetch);
    const problems = (await app!.inject({
      method: "GET", url: `/api/projects/${project.id}/modules/problems`,
    })).json<{ results: ModuleResult[] }>().results;
    const parentProblem = (problems[0]!.outputData as { items: Array<{ id: string; evidenceIds: string[] }> }).items[0]!;
    const providerEvidenceId = parentProblem.evidenceIds[0]!;
    fetchMock.mockImplementation(async () => deepSeekResponse(opportunitiesOutput(VALID_SCORES, { evidenceIds: [providerEvidenceId] })));

    const selectedResponse = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(selectedResponse.statusCode).toBe(200);

    const selectedVersions = (await app!.inject({
      method: "GET", url: `/api/projects/${project.id}/artifacts`,
    })).json<{ versions: ArtifactVersion[] }>().versions;
    const selectedSnapshot = selectedVersions.find((version) => version.artifactType === "opportunities")!.inputSnapshot as Record<string, unknown>;
    expect(selectedSnapshot.opportunityEvidenceResolution).toMatchObject({
      version: 1,
      generationProvider: "deepseek",
      items: [{
        opportunityId: "opp-1",
        problemId: parentProblem.id,
        providerEvidenceIds: [providerEvidenceId],
        acceptedProviderEvidenceIds: [providerEvidenceId],
        rejectedProviderEvidenceIds: [],
        persistedEvidenceIds: [providerEvidenceId],
        resolution: "provider_selected",
      }],
    });

    fetchMock.mockImplementation(async () => deepSeekResponse(opportunitiesOutput(VALID_SCORES, { evidenceIds: [providerEvidenceId, "foreign-evidence"] })));
    const filteredResponse = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(filteredResponse.statusCode).toBe(200);
    const filteredVersions = (await app!.inject({
      method: "GET", url: `/api/projects/${project.id}/artifacts`,
    })).json<{ versions: ArtifactVersion[] }>().versions;
    const filteredSnapshot = filteredVersions.find((version) => version.artifactType === "opportunities" && version.versionNumber === 2)!.inputSnapshot as Record<string, unknown>;
    expect(filteredSnapshot.opportunityEvidenceResolution).toMatchObject({
      version: 1,
      generationProvider: "deepseek",
      items: [{
        opportunityId: "opp-1",
        problemId: parentProblem.id,
        providerEvidenceIds: [providerEvidenceId, "foreign-evidence"],
        acceptedProviderEvidenceIds: [providerEvidenceId],
        rejectedProviderEvidenceIds: ["foreign-evidence"],
        persistedEvidenceIds: [providerEvidenceId],
        resolution: "provider_selected",
      }],
    });

    fetchMock.mockImplementation(async () => deepSeekResponse(opportunitiesOutput(VALID_SCORES)));
    const fallbackResponse = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(fallbackResponse.statusCode).toBe(200);

    const fallbackVersions = (await app!.inject({
      method: "GET", url: `/api/projects/${project.id}/artifacts`,
    })).json<{ versions: ArtifactVersion[] }>().versions;
    const fallbackSnapshot = fallbackVersions.find((version) => version.artifactType === "opportunities" && version.versionNumber === 3)!.inputSnapshot as Record<string, unknown>;
    expect(fallbackSnapshot.opportunityEvidenceResolution).toMatchObject({
      version: 1,
      generationProvider: "deepseek",
      items: [{
        opportunityId: "opp-1",
        problemId: parentProblem.id,
        providerEvidenceIds: [],
        acceptedProviderEvidenceIds: [],
        rejectedProviderEvidenceIds: [],
        persistedEvidenceIds: [providerEvidenceId],
        resolution: "backend_fallback_first_parent_ids",
      }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("A2. recupera Oportunidades cuando Chat no devuelve JSON usando Responses JSON Schema", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(deepSeekResponse("No puedo generar el objeto solicitado."))
      .mockResolvedValueOnce(deepSeekResponsesResponse(opportunitiesOutput(VALID_SCORES)));
    const project = await projectWithFreshProblems(fetchMock as unknown as typeof fetch);

    const response = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe("https://api.deepseek.com/responses");
    const [, retryInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(retryInit.body))).toMatchObject({
      model: DEEPSEEK_DEFAULT_MODEL,
      reasoning: { effort: "none" },
      text: { format: { type: "json_schema", name: "opportunities_output" } },
    });
    const result = response.json<ModuleResult>();
    expect(result.outputData).toMatchObject({ selectedId: "opp-1" });
  });

  it("A3. procesa exitosamente la respuesta de DeepSeek cuando incluye bloques <think> de razonamiento y llaves", async () => {
    const rawOutputWithThink = `<think>
Razonando sobre el problema {"id": "problem-1"}.
Evaluando frequency: 80, urgency: 70, etc.
</think>
\`\`\`json
${JSON.stringify(opportunitiesOutput(VALID_SCORES))}
\`\`\``;
    const fetchMock = vi.fn(async () => deepSeekResponse(rawOutputWithThink));
    const project = await projectWithFreshProblems(fetchMock as unknown as typeof fetch);

    const response = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const item = (response.json<ModuleResult>().outputData as { items: Array<Record<string, unknown>> }).items[0]!;
    expect(item.total).toBe(EXPECTED_TOTAL_FOR_VALID_SCORES);
    expect(item.scores).toMatchObject(VALID_SCORES);
  });

  it("B. score faltante: rechazado explícitamente, no crea versión", async () => {
    const incomplete = { ...VALID_SCORES } as Record<string, unknown>;
    delete incomplete.emotionalIntensity;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(deepSeekResponse(opportunitiesOutput(incomplete)))
      .mockResolvedValueOnce(deepSeekResponsesResponse(opportunitiesOutput(incomplete)));
    const project = await projectWithFreshProblems(fetchMock as unknown as typeof fetch);

    const response = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "module_blocked" });
    expect(response.json<{ message: string }>().message).toContain("scores.emotionalIntensity");

    const versions = (await app!.inject({
      method: "GET", url: `/api/projects/${project.id}/modules/opportunities`,
    })).json<{ results: ModuleResult[] }>().results;
    expect(versions).toHaveLength(0);
  });

  it.each([
    ["negativo (-1)", { ...VALID_SCORES, frequency: -1 }],
    ["fuera de rango (101)", { ...VALID_SCORES, urgency: 101 }],
    ["string en lugar de number", { ...VALID_SCORES, competition: "alto" }],
  ])("C. score inválido — %s: rechazado explícitamente", async (_label, scores) => {
    const fetchMock = vi.fn(async () => deepSeekResponse(opportunitiesOutput(scores)));
    const project = await projectWithFreshProblems(fetchMock as unknown as typeof fetch);

    const response = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "module_blocked" });

    const versions = (await app!.inject({
      method: "GET", url: `/api/projects/${project.id}/modules/opportunities`,
    })).json<{ results: ModuleResult[] }>().results;
    expect(versions).toHaveLength(0);
  });

  it("D. total manipulado por el provider: el backend lo sobrescribe con el valor calculado", async () => {
    const fetchMock = vi.fn(async () => deepSeekResponse(opportunitiesOutput(VALID_SCORES, { total: 999 })));
    const project = await projectWithFreshProblems(fetchMock as unknown as typeof fetch);

    const response = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(response.statusCode).toBe(200);
    const item = (response.json<ModuleResult>().outputData as { items: Array<Record<string, unknown>> }).items[0]!;
    expect(item.total).not.toBe(999);
    expect(item.total).toBe(EXPECTED_TOTAL_FOR_VALID_SCORES);
  });

  it("E. fórmula determinista: mismos scores producen siempre el mismo total", async () => {
    const fetchMock = vi.fn(async () => deepSeekResponse(opportunitiesOutput(VALID_SCORES)));
    const project = await projectWithFreshProblems(fetchMock as unknown as typeof fetch);

    const first = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    const second = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const firstTotal = (first.json<ModuleResult>().outputData as { items: Array<{ total: number }> }).items[0]!.total;
    const secondTotal = (second.json<ModuleResult>().outputData as { items: Array<{ total: number }> }).items[0]!.total;
    expect(firstTotal).toBe(EXPECTED_TOTAL_FOR_VALID_SCORES);
    expect(secondTotal).toBe(EXPECTED_TOTAL_FOR_VALID_SCORES);
  });

  it("F. mock y provider real aplican la misma fórmula para los mismos scores", async () => {
    // Provider real (DeepSeek, simulado) recibe exactamente los scores que el
    // camino mock produce por defecto cuando hay evidencia disponible.
    const fetchMock = vi.fn(async () => deepSeekResponse(opportunitiesOutput(MOCK_DEFAULT_SCORES)));
    const realProject = await projectWithFreshProblems(fetchMock as unknown as typeof fetch);
    const realResponse = await app!.inject({
      method: "POST", url: `/api/projects/${realProject.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(realResponse.statusCode).toBe(200);
    const realTotal = (realResponse.json<ModuleResult>().outputData as { items: Array<{ total: number }> }).items[0]!.total;
    expect(realTotal).toBe(EXPECTED_TOTAL_FOR_MOCK_DEFAULT_SCORES);
    await app!.close();

    // Mismo escenario con provider mock (camino createContextOutput/contextualize).
    const mockFetch = vi.fn(async () => deepSeekResponse(opportunitiesOutput(MOCK_DEFAULT_SCORES)));
    const mockProject = await projectWithFreshProblems(mockFetch as unknown as typeof fetch);
    const mockResponse = await app!.inject({
      method: "POST", url: `/api/projects/${mockProject.id}/modules/opportunities/run`, payload: { provider: "mock" },
    });
    expect(mockResponse.statusCode).toBe(200);
    const mockTotal = (mockResponse.json<ModuleResult>().outputData as { items: Array<{ total: number }> }).items[0]!.total;
    expect(mockTotal).toBe(EXPECTED_TOTAL_FOR_MOCK_DEFAULT_SCORES);

    expect(mockTotal).toBe(realTotal);
  });

  it("G. scoreFormula: existe, conserva versión y pesos exactos, y nunca proviene del provider", async () => {
    // El provider envía un scoreFormula falso; el backend debe ignorarlo y
    // persistir el suyo.
    const fetchMock = vi.fn(async () => deepSeekResponse(opportunitiesOutput(VALID_SCORES, {
      scoreFormula: { version: "9.9", weights: { frequency: 1 } },
    })));
    const project = await projectWithFreshProblems(fetchMock as unknown as typeof fetch);

    const response = await app!.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/opportunities/run`, payload: { provider: "deepseek" },
    });
    expect(response.statusCode).toBe(200);
    const item = (response.json<ModuleResult>().outputData as { items: Array<Record<string, unknown>> }).items[0]!;
    expect(item.scoreFormula).toMatchObject({ version: "1.0", weights: EXPECTED_WEIGHTS });
  });
});
