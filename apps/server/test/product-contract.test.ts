import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArtifactVersion, ModuleResult, Project } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { AppDatabase } from "../src/database/database.js";
import { DEEPSEEK_DEFAULT_MODEL } from "../src/integrations/deepseek-provider.js";
import { ArtifactRepository } from "../src/repositories/artifact-repository.js";

function product(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    proposals: [{
      id: "qa-product",
      name: "Guía estructurada",
      concept: "Guía para abordar la oportunidad seleccionada",
      problem: "El problema seleccionado",
      outcome: "Comprender y manejar mejor el problema",
      promise: "Una guía estructurada para comprender y manejar mejor el problema",
      format: "Guía digital con workbook",
      deliverables: ["Guía", "Workbook"],
      modules: ["Comprensión", "Plan", "Aplicación"],
      checklists: ["Checklist de aplicación"],
      templates: ["Plantilla de plan"],
      resources: [],
      bonuses: [],
      evidenceIds: [],
      ...overrides,
    }],
    selectedId: "qa-product",
  };
}

function deepSeekResponse(output: unknown) {
  return new Response(JSON.stringify({
    model: DEEPSEEK_DEFAULT_MODEL,
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
    usage: { prompt_tokens: 40, completion_tokens: 30 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("strict Product contract, grounding and downstream safety", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("rejects incomplete DeepSeek Product, then approves a complete conservative version", async () => {
    const missingFormat = product();
    delete (missingFormat.proposals as Array<Record<string, unknown>>)[0]!.format;
    const outputs = [
      missingFormat,
      product({ promise: "Resultados garantizados en 30 días con método probado y apoyo personalizado" }),
      product(),
    ];
    const fetchMock = vi.fn(async () => deepSeekResponse(outputs.shift()));
    app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      deepSeek: { apiKey: "product-contract-key", fetch: fetchMock as typeof fetch },
    });
    const demo = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>();

    const incompleteResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${demo.project.id}/modules/product/run`,
      payload: { provider: "deepseek" },
    });
    expect(incompleteResponse.statusCode).toBe(409);
    expect(incompleteResponse.json<{ message: string }>().message).toContain("schema");
    const productVersionsAfterFailure = (await app.inject({
      method: "GET", url: `/api/projects/${demo.project.id}/modules/product`,
    })).json<{ results: ModuleResult[] }>().results;
    expect(productVersionsAfterFailure).toHaveLength(1);
    expect(productVersionsAfterFailure[0]).toMatchObject({ status: "approved", versionNumber: 1 });

    const unsupportedResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${demo.project.id}/modules/product/run`,
      payload: { provider: "deepseek" },
    });
    expect(unsupportedResponse.statusCode).toBe(200);
    const unsupported = unsupportedResponse.json<ModuleResult>();
    expect(unsupported.status).toBe("draft");
    expect(unsupported.outputData).toMatchObject({
      productValidationAudit: { ok: false, grounded: false, unsupportedClaims: expect.any(Array) },
    });

    const validResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${demo.project.id}/modules/product/run`,
      payload: { provider: "deepseek" },
    });
    expect(validResponse.statusCode).toBe(200);
    const valid = validResponse.json<ModuleResult>();
    expect(valid).toMatchObject({ status: "approved", freshness: "fresh" });
    expect(valid.outputData).toMatchObject({ schemaVersion: 2, productValidationAudit: { ok: true } });
    const trace = await app.inject({ method: "GET", url: `/api/projects/${demo.project.id}/versions/${valid.versionId}/traceability` });
    expect(trace.statusCode).toBe(200);
    expect(trace.json<{ nodes: unknown[]; edges: unknown[] }>()).toMatchObject({ nodes: expect.any(Array), edges: expect.any(Array) });
    expect(trace.json<{ edges: unknown[] }>().edges.length).toBeGreaterThan(0);

    const request = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1].body)) as { messages: Array<{ content: string }> };
    expect(request.messages[0]!.content).toContain("`format` debe describir concretamente");
    expect(request.messages[0]!.content).toContain("evidencia del problema");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not approve an incomplete user draft", async () => {
    app = await createApp({ databasePath: ":memory:", serveFrontend: false });
    const demo = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>();
    const active = (await app.inject({
      method: "GET", url: `/api/projects/${demo.project.id}/modules/product`,
    })).json<{ results: ModuleResult[] }>().results[0]!;
    const output = structuredClone(active.outputData as Record<string, unknown>);
    (output.proposals as Array<Record<string, unknown>>)[0]!.format = "";
    const draft = (await app.inject({
      method: "POST",
      url: `/api/projects/${demo.project.id}/modules/product/drafts`,
      payload: { outputData: output },
    })).json<ModuleResult>();
    expect(draft.status).toBe("draft");
    const approval = await app.inject({
      method: "POST",
      url: `/api/projects/${demo.project.id}/modules/product/versions/${draft.versionId}/approve`,
    });
    expect(approval.statusCode).toBe(409);
    expect(approval.json<{ message: string }>().message).toContain("Producto incompleto");
  });

  it("presents a legacy invalid approved Product as draft/stale and blocks downstream consumption", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hallazia-product-contract-"));
    const databasePath = join(directory, "qa.sqlite");
    try {
      app = await createApp({ databasePath, serveFrontend: false });
      const demo = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>();
      await app.close();
      app = undefined;

      const database = new AppDatabase(databasePath);
      try {
        const artifacts = new ArtifactRepository(database);
        const productArtifact = database.connection.prepare(
          "SELECT id FROM artifacts WHERE project_id=? AND artifact_type='product'",
        ).get(demo.project.id) as { id: string };
        const opportunity = database.connection.prepare(`SELECT version.id,version.output_data FROM artifacts artifact
          JOIN artifact_versions version ON version.id=artifact.active_version_id
          WHERE artifact.project_id=? AND artifact.artifact_type='opportunities'`).get(demo.project.id) as { id: string; output_data: string };
        artifacts.createVersion({
          projectId: demo.project.id,
          artifactType: "product",
          name: "Producto",
          artifactId: productArtifact.id,
          inputSnapshot: { evidenceIds: [], context: { parentOutputs: { opportunities: JSON.parse(opportunity.output_data) } } },
          outputData: product({ format: "Sin completar" }),
          parentVersionIds: [opportunity.id],
          status: "approved",
        });
      } finally {
        database.close();
      }

      app = await createApp({ databasePath, serveFrontend: false });
      const history = (await app.inject({
        method: "GET", url: `/api/projects/${demo.project.id}/modules/product`,
      })).json<{ results: ModuleResult[] }>().results;
      expect(history[0]).toMatchObject({ status: "draft", freshness: "stale" });
      const versions = (await app.inject({
        method: "GET", url: `/api/projects/${demo.project.id}/artifacts`,
      })).json<{ versions: ArtifactVersion[] }>().versions;
      expect(versions.find((item) => item.id === history[0]!.versionId)).toMatchObject({ status: "draft", freshness: "stale" });
      const downstream = await app.inject({
        method: "POST",
        url: `/api/projects/${demo.project.id}/modules/final_product/run`,
        payload: { provider: "mock" },
      });
      expect(downstream.statusCode).toBe(409);
      expect(downstream.json<{ message: string }>().message).toContain("Falta completar product");
    } finally {
      await app?.close();
      app = undefined;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
