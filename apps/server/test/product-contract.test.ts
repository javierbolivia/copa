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
      format: "Guía digital",
      deliverables: ["Guía"],
      modules: ["Comprensión", "Plan", "Aplicación"],
      checklists: [],
      templates: [],
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
    expect(incompleteResponse.json<{ message: string }>().message).toContain("$.proposals[0].format");
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
    const workflowAfterInvalid = (await app.inject({
      method: "GET", url: `/api/projects/${demo.project.id}/workflow`,
    })).json<{ steps: Array<{ stepKey: string; state: string }> }>().steps;
    expect(workflowAfterInvalid.find((step) => step.stepKey === "product")?.state).toBe("IN_PROGRESS");

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
    const workflowAfterValid = (await app.inject({
      method: "GET", url: `/api/projects/${demo.project.id}/workflow`,
    })).json<{ steps: Array<{ stepKey: string; state: string }> }>().steps;
    expect(workflowAfterValid.find((step) => step.stepKey === "product")?.state).toBe("COMPLETED");

    const request = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1].body)) as { messages: Array<{ content: string }> };
    expect(request.messages[0]!.content).toContain("`format` debe ser concreto");
    expect(request.messages[0]!.content).toContain("allowedEvidence");
    const providerContext = JSON.parse(request.messages[1]!.content) as Record<string, unknown>;
    expect(providerContext).toHaveProperty("productGrounding.allowedEvidence");
    expect(providerContext).toHaveProperty("productGrounding.authorizedCapabilities");
    expect(providerContext).not.toHaveProperty("parentOutputs");
    expect(providerContext).toMatchObject({ knowledge: { advisoryOnly: true, capabilityAuthorization: false } });
    expect(request.messages[0]!.content).toContain("x-hallazia-product-capability-contract");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses the exact provider allowedEvidence snapshot for backend grounding", async () => {
    const providerContexts: Array<{ productGrounding: { allowedEvidence: Array<{ id: string }> } }> = [];
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const context = JSON.parse(body.messages[1]!.content) as { productGrounding: { allowedEvidence: Array<{ id: string }> } };
      providerContexts.push(context);
      const evidenceIds = providerContexts.length === 1
        ? context.productGrounding.allowedEvidence.slice(0, 1).map((item) => item.id)
        : ["fabricated-evidence-id"];
      return deepSeekResponse(product({ evidenceIds }));
    });
    app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      deepSeek: { apiKey: "product-contract-key", fetch: fetchMock as typeof fetch },
    });
    const demo = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>();

    const valid = await app.inject({ method: "POST", url: `/api/projects/${demo.project.id}/modules/product/run`, payload: { provider: "deepseek" } });
    expect(valid.statusCode).toBe(200);
    expect(valid.json<ModuleResult>()).toMatchObject({
      status: "approved",
      outputData: { productValidationAudit: { ok: true, unresolvedEvidenceIds: [] } },
    });

    const invalid = await app.inject({ method: "POST", url: `/api/projects/${demo.project.id}/modules/product/run`, payload: { provider: "deepseek" } });
    expect(invalid.statusCode).toBe(200);
    expect(invalid.json<ModuleResult>()).toMatchObject({
      status: "draft",
      outputData: { productValidationAudit: {
        ok: false,
        unresolvedEvidenceIds: ["fabricated-evidence-id"],
        issues: [expect.objectContaining({ code: "EVIDENCE_OUTSIDE_SNAPSHOT", path: "$.proposals[0].evidenceIds[0]" })],
      } },
    });
    expect(providerContexts[0]!.productGrounding.allowedEvidence).toEqual(providerContexts[1]!.productGrounding.allowedEvidence);
    const approval=await app.inject({method:"POST",url:`/api/projects/${demo.project.id}/modules/product/versions/${invalid.json<ModuleResult>().versionId}/approve`});
    expect(approval.statusCode).toBe(409);
  });

  it("grounds a regenerated Product on the newly selected Opportunity and records that exact parent", async () => {
    let providerGrounding: { selectedOpportunity: { id: string; name: string } } | undefined;
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const context = JSON.parse(body.messages[1]!.content) as { productGrounding: typeof providerGrounding };
      providerGrounding = context.productGrounding!;
      return deepSeekResponse(product());
    });
    app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      deepSeek: { apiKey: "product-parent-contract-key", fetch: fetchMock as typeof fetch },
    });
    const demo = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>();
    const oldOpportunity = (await app.inject({
      method: "GET", url: `/api/projects/${demo.project.id}/modules/opportunities`,
    })).json<{ results: ModuleResult[] }>().results[0]!;
    const changedOutput = structuredClone(oldOpportunity.outputData) as Record<string, unknown>;
    const oldItems = changedOutput.items as Array<Record<string, unknown>>;
    const revisedOpportunity = {
      ...structuredClone(oldItems[0]!),
      id: "opp-2",
      name: "Método de seguridad y manejo físico para dueños que pierden el control del perro reactivo",
      rationale: "Enfoque en seguridad y control físico durante los paseos.",
    };
    changedOutput.items = [...oldItems, revisedOpportunity];
    changedOutput.selectedId = revisedOpportunity.id;

    const opportunityDraft = await app.inject({
      method: "POST",
      url: `/api/projects/${demo.project.id}/modules/opportunities/drafts`,
      payload: { outputData: changedOutput, expectedBaseVersionId: oldOpportunity.versionId },
    });
    expect(opportunityDraft.statusCode).toBe(201);
    const draftVersionId = opportunityDraft.json<ModuleResult>().versionId;
    const approvedOpportunity = await app.inject({
      method: "POST",
      url: `/api/projects/${demo.project.id}/modules/opportunities/versions/${draftVersionId}/approve`,
    });
    expect(approvedOpportunity.statusCode).toBe(200);
    const currentOpportunity = approvedOpportunity.json<ModuleResult>();

    const productResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${demo.project.id}/modules/product/run`,
      payload: { provider: "deepseek" },
    });
    expect(productResponse.statusCode).toBe(200);
    const generatedProduct = productResponse.json<ModuleResult>();
    expect(generatedProduct).toMatchObject({ status: "approved", freshness: "fresh" });
    expect(providerGrounding?.selectedOpportunity).toMatchObject({
      id: revisedOpportunity.id,
      name: revisedOpportunity.name,
    });
    const versions = (await app.inject({
      method: "GET", url: `/api/projects/${demo.project.id}/artifacts`,
    })).json<{ versions: ArtifactVersion[] }>().versions;
    expect(versions.find((version) => version.id === generatedProduct.versionId)?.inputSnapshot).toMatchObject({
      parentVersionIds: expect.arrayContaining([currentOpportunity.versionId]),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops after one unusable DeepSeek response instead of spending a retry", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hallazia-product-one-shot-"));
    const databasePath = join(directory, "qa.sqlite");
    const fetchMock = vi.fn(async () => deepSeekResponse("Esto no es JSON válido."));
    app = await createApp({
      databasePath,
      serveFrontend: false,
      deepSeek: { apiKey: "product-one-shot-key", fetch: fetchMock as typeof fetch },
    });
    const demo = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>();
    const before = (await app.inject({
      method: "GET", url: `/api/projects/${demo.project.id}/modules/product`,
    })).json<{ results: ModuleResult[] }>().results;

    const failed = await app.inject({
      method: "POST",
      url: `/api/projects/${demo.project.id}/modules/product/run`,
      payload: { provider: "deepseek" },
    });

    expect(failed.statusCode).toBe(409);
    expect(fetchMock).toHaveBeenCalledOnce();
    const after = (await app.inject({
      method: "GET", url: `/api/projects/${demo.project.id}/modules/product`,
    })).json<{ results: ModuleResult[] }>().results;
    expect(after).toHaveLength(before.length);
    expect(after[0]!.versionId).toBe(before[0]!.versionId);

    await app.close();
    app = undefined;
    const database = new AppDatabase(databasePath);
    try {
      const generation = database.connection.prepare(
        "SELECT status,input_tokens,output_tokens,estimated_cost FROM generations WHERE project_id=? AND provider='deepseek' ORDER BY created_at DESC LIMIT 1",
      ).get(demo.project.id) as { status: string; input_tokens: number; output_tokens: number; estimated_cost: number };
      const snapshotRow = database.connection.prepare(
        "SELECT input_snapshot FROM generations WHERE project_id=? AND provider='deepseek' ORDER BY created_at DESC LIMIT 1",
      ).get(demo.project.id) as { input_snapshot: string };
      const snapshot = JSON.parse(snapshotRow.input_snapshot) as { providerAttempts: Array<{ physicalRequests?: Array<Record<string, unknown>> }> };
      expect(generation).toMatchObject({ status: "FAILED", input_tokens: 40, output_tokens: 30 });
      expect(generation.estimated_cost).toBeGreaterThan(0);
      expect(snapshot.providerAttempts.at(-1)?.physicalRequests).toEqual([
        { attempt: 1, inputTokens: 40, outputTokens: 30, usageKind: "provider_reported" },
      ]);
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
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

    const outside = structuredClone(active.outputData as Record<string, unknown>);
    (outside.proposals as Array<Record<string, unknown>>)[0]!.evidenceIds = ["outside-snapshot"];
    const outsideDraft = (await app.inject({
      method: "POST", url: `/api/projects/${demo.project.id}/modules/product/drafts`, payload: { outputData: outside },
    })).json<ModuleResult>();
    const outsideApproval = await app.inject({
      method: "POST", url: `/api/projects/${demo.project.id}/modules/product/versions/${outsideDraft.versionId}/approve`,
    });
    expect(outsideApproval.statusCode).toBe(409);
    expect(outsideApproval.json<{ message: string }>().message).toContain("grounding");
    const memoryPromotion = await app.inject({
      method: "PUT",
      url: `/api/projects/${demo.project.id}/knowledge/memory/${outsideDraft.versionId}`,
      payload: { decision: "APPROVED", visibility: "GLOBAL", reusable: true, preferred: true },
    });
    expect(memoryPromotion.statusCode).toBe(409);
    expect(memoryPromotion.json<{ message: string }>().message).toContain("no puede promoverse");
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
      expect(history[0]).toMatchObject({ status: "draft", freshness: "stale", outputData: { productValidationAudit: { ok: false, errors: expect.any(Array) } } });
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
