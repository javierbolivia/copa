import type { ModuleResult, Project } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("refinamiento editable y trazabilidad", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createApp({ databasePath: ":memory:", logger: false, serveFrontend: false });
  });

  afterEach(async () => app.close());

  it("guarda un draft sin activarlo, expone su origen y lo aprueba explícitamente", async () => {
    const demo = await app.inject({ method: "POST", url: "/api/demo/projects" });
    expect(demo.statusCode).toBe(201);
    const project = demo.json<{ project: Project }>().project;

    const historyBefore = await app.inject({ method: "GET", url: `/api/projects/${project.id}/modules/product` });
    const approvedBefore = historyBefore.json<{ results: ModuleResult[] }>().results[0]!;

    const edited = { ...(approvedBefore.outputData as Record<string, unknown>), editorNote: "Cambio humano verificable" };
    const draftResponse = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/product/drafts`, payload: { outputData: edited } });
    expect(draftResponse.statusCode).toBe(201);
    const draft = draftResponse.json<ModuleResult>();
    expect(draft.status).toBe("draft");
    expect(draft.versionNumber).toBe(approvedBefore.versionNumber + 1);

    const artifactsWhileDraft = await app.inject({ method: "GET", url: `/api/projects/${project.id}/artifacts` });
    const productVersions = artifactsWhileDraft.json<{ versions: Array<{ id: string; artifactType: string; status: string }> }>().versions.filter((item) => item.artifactType === "product");
    expect(productVersions).toEqual(expect.arrayContaining([expect.objectContaining({ id: approvedBefore.versionId, status: "approved" }), expect.objectContaining({ id: draft.versionId, status: "draft" })]));

    const trace = await app.inject({ method: "GET", url: `/api/projects/${project.id}/versions/${draft.versionId}/traceability` });
    expect(trace.statusCode).toBe(200);
    expect(trace.json<{ rootId: string; nodes: unknown[]; edges: unknown[] }>().rootId).toBe(draft.versionId);
    expect(trace.json<{ nodes: unknown[] }>().nodes.length).toBeGreaterThan(1);

    const approvedResponse = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/product/versions/${draft.versionId}/approve` });
    expect(approvedResponse.statusCode).toBe(200);
    expect(approvedResponse.json<ModuleResult>().status).toBe("approved");

    const artifactsAfter = await app.inject({ method: "GET", url: `/api/projects/${project.id}/artifacts` });
    const approvedVersions = artifactsAfter.json<{ versions: Array<{ id: string; artifactType: string; status: string }> }>().versions.filter((item) => item.artifactType === "product");
    expect(approvedVersions).toEqual(expect.arrayContaining([expect.objectContaining({ id: approvedBefore.versionId, status: "superseded" }), expect.objectContaining({ id: draft.versionId, status: "approved" })]));
  });
});
