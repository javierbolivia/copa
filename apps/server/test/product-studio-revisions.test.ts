import type { ProductBlock, ProductDocument, Project, ProjectSettings } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ProductStudioService } from "../src/services/product-studio-service.js";

describe("Product Studio revision integrity", () => {
  let app: FastifyInstance;
  let base: string;
  let providerCall: () => Promise<Response>;

  beforeEach(async () => {
    providerCall = async () => { throw new Error("Unexpected provider call"); };
    app = await createApp({ databasePath: ":memory:", serveFrontend: false,
      openAI: { apiKey: "test-key", fetch: async () => providerCall() },
    });
    const demo = await app.inject({ method: "POST", url: "/api/demo/projects" });
    expect(demo.statusCode, demo.body).toBe(201);
    const project = demo.json<{ project: Project }>().project;
    const created = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/product-documents`,
      payload: { documentType: "ebook", language: "es", length: "short", level: "beginner" },
    });
    expect(created.statusCode, created.body).toBe(201);
    base = `/api/projects/${project.id}/product-documents/${created.json<ProductDocument>().id}`;
  });
  afterEach(async () => { vi.restoreAllMocks(); await app.close(); });

  async function action(path: string): Promise<ProductDocument> {
    const response = await app.inject({ method: "POST", url: `${base}/${path}`, payload: {} });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<ProductDocument>();
  }

  async function save(document: ProductDocument, blocks: ProductBlock[]) {
    const response = await app.inject({
      method: "PUT", url: `${base}/autosave`,
      payload: { baseVersionNumber: document.version.versionNumber, idempotencyKey: crypto.randomUUID(), blocks },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<ProductDocument>();
  }

  async function enableFakeProvider(projectId: string) {
    const url = `/api/projects/${projectId}/settings`;
    const settings = (await app.inject({ method: "GET", url })).json<ProjectSettings>();
    const { projectId: _, updatedAt: __, ...input } = settings;
    const response = await app.inject({ method: "PUT", url, payload: { ...input, preferredLlmProvider: "openai", maxBudget: 2 } });
    expect(response.statusCode, response.body).toBe(200);
  }

  function providerResponse(output: unknown) {
    return new Response(JSON.stringify({ status: "completed", model: "test-model",
      usage: { input_tokens: 100, output_tokens: 50 },
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  it("preserves an outline edited while a replacement outline is generating", async () => {
    const document = await action("outline/generate");
    await enableFakeProvider(document.projectId);
    let edited: ProductDocument;
    providerCall = async () => {
      const response = await app.inject({ method: "PATCH", url: `${base}/outline`,
        payload: { operation: "update", itemId: document.version.outline[0]!.id, title: "Edición humana durante generación" },
      });
      expect(response.statusCode).toBe(200);
      edited = response.json<ProductDocument>();
      return providerResponse({ chapters: [
        { title: "Inicio", objective: "Aprender", targetWords: 300 },
        { title: "Acción", objective: "Aplicar", targetWords: 300 },
      ] });
    };
    const generated = await app.inject({ method: "POST", url: `${base}/outline/generate`, payload: {} });
    expect(edited!, generated.body).toBeDefined();
    expect(generated.statusCode, generated.body).toBe(409);
    const current = (await app.inject({ method: "GET", url: base })).json<ProductDocument>();
    expect(current.version).toEqual(edited!.version);
  });

  it("preserves chapter edits made while regeneration awaits the provider", async () => {
    await action("outline/generate");
    let document = await action("outline/approve");
    const chapter = document.version.outline[0]!;
    document = await action(`chapters/${chapter.id}/generate`);
    await enableFakeProvider(document.projectId);
    let edited: ProductDocument;
    providerCall = async () => {
      edited = await save(document, document.version.blocks.map((block, index) =>
        index === 0 ? { ...block, content: "Cambio humano que debe conservarse" } : block));
      return providerResponse({ blocks: [
        { type: "heading", content: "Respuesta tardía" },
        { type: "paragraph", content: "Contenido generado" },
      ] });
    };
    const generated = await app.inject({ method: "POST", url: `${base}/chapters/${chapter.id}/generate`, payload: {} });
    expect(edited!, generated.body).toBeDefined();
    expect(generated.statusCode, generated.body).toBe(409);
    expect((await app.inject({ method: "GET", url: base })).json<ProductDocument>().version).toEqual(edited!.version);
  });

  it("merges a generated chapter while preserving concurrent edits to another chapter", async () => {
    await action("outline/generate");
    let document = await action("outline/approve");
    const [first, second] = document.version.outline;
    document = await action(`chapters/${second!.id}/generate`);
    await enableFakeProvider(document.projectId);
    providerCall = async () => {
      await save(document, document.version.blocks.map((block, index) =>
        index === 0 ? { ...block, content: "Edición del otro capítulo" } : block));
      return providerResponse({ blocks: [
        { type: "heading", content: "Primer capítulo" },
        { type: "paragraph", content: "Contenido generado" },
      ] });
    };
    const generated = await action(`chapters/${first!.id}/generate`);
    expect(generated.version.blocks.some((block) => block.content === "Edición del otro capítulo")).toBe(true);
    expect([...new Set(generated.version.blocks.map((block) => block.metadata.chapterId))]).toEqual([first!.id, second!.id]);
  });

  it("rejects simultaneous generation of the same chapter before a second provider call", async () => {
    await action("outline/generate");
    const document = await action("outline/approve");
    const chapter = document.version.outline[0]!;
    await enableFakeProvider(document.projectId);
    let calls = 0;
    let duplicateStatus: number | undefined;
    providerCall = async () => {
      calls++;
      if (calls === 1) {
        duplicateStatus = (await app.inject({ method: "POST", url: `${base}/chapters/${chapter.id}/generate`, payload: {} })).statusCode;
      }
      return providerResponse({ blocks: [
        { type: "heading", content: "Capítulo" },
        { type: "paragraph", content: "Contenido generado" },
      ] });
    };
    await action(`chapters/${chapter.id}/generate`);
    expect(duplicateStatus).toBe(409);
    expect(calls).toBe(1);
  });

  it("removes deleted chapter blocks, preserving manual content and historical versions", async () => {
    await action("outline/generate");
    let document = await action("outline/approve");
    const chapter = document.version.outline[0]!;
    document = await action(`chapters/${chapter.id}/generate`);
    const now = new Date().toISOString();
    const manual: ProductBlock = {
      id: crypto.randomUUID(), type: "paragraph", content: "Nota independiente del autor",
      order: document.version.blocks.length, metadata: {}, createdAt: now, updatedAt: now,
    };
    document = await save(document, [...document.version.blocks, manual]);
    const previousVersion = document.version;
    const deleted = await app.inject({
      method: "PATCH", url: `${base}/outline`, payload: { operation: "delete", itemId: chapter.id },
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    const next = deleted.json<ProductDocument>();
    expect(next.version.outline.some((item) => item.id === chapter.id)).toBe(false);
    expect(next.version.blocks).toEqual([{ ...manual, order: 0 }]);
    const history = await app.inject({ method: "GET", url: `${base}/versions` });
    expect(history.json<{ versions: ProductDocument["version"][] }>().versions)
      .toContainEqual(previousVersion);
  });

  it("inserts a middle chapter before the next generated chapter when its predecessors are pending", async () => {
    await action("outline/generate");
    const document = await action("outline/approve");
    const [, second, third] = document.version.outline;
    await action(`chapters/${third!.id}/generate`);
    const next = await action(`chapters/${second!.id}/generate`);
    const chapterOrder = [...new Set(next.version.blocks.map((block) => block.metadata.chapterId))];
    expect(chapterOrder).toEqual([second!.id, third!.id]);
    expect(next.version.blocks.map((block) => block.order)).toEqual(next.version.blocks.map((_, index) => index));
  });

  it("requires explicit document approval again after autosaving an approved document", async () => {
    await action("outline/generate");
    let document = await action("outline/approve");
    for (const chapter of document.version.outline) {
      await action(`chapters/${chapter.id}/generate`);
      document = await action(`chapters/${chapter.id}/approve`);
    }
    document = await action("approve");
    expect(document.status).toBe("APPROVED");
    const approvedVersion = document.version;
    const next = await save(document, document.version.blocks.map((block, index) =>
      index === 0 ? { ...block, content: "Título revisado por el autor" } : block));
    expect(next.status).toBe("IN_PROGRESS");
    const reloaded = await app.inject({ method: "GET", url: base });
    expect(reloaded.json<ProductDocument>().status).toBe("IN_PROGRESS");
    const history = await app.inject({ method: "GET", url: `${base}/versions` });
    expect(history.json<{ versions: ProductDocument["version"][] }>().versions).toContainEqual(approvedVersion);
    expect((await action("approve")).status).toBe("APPROVED");
  });

  it("preserves cancellation and resumes without regenerating completed chapters", async () => {
    await action("outline/generate");
    const document = await action("outline/approve");
    const generatedIds: string[] = [];
    let cancelAt = 1;
    const generate = ProductStudioService.prototype.generateChapter;
    vi.spyOn(ProductStudioService.prototype, "generateChapter").mockImplementation(async function (this: ProductStudioService, projectId, documentId, chapterId) {
      const result = await generate.call(this, projectId, documentId, chapterId);
      generatedIds.push(chapterId);
      if (generatedIds.length === cancelAt) {
        const jobs = await app.inject({ method: "GET", url: `/api/projects/${projectId}/jobs` });
        const running = jobs.json<{ jobs: Array<{ id: string; jobType: string; status: string }> }>().jobs
          .find((job) => job.jobType === "product_chapters" && job.status === "RUNNING")!;
        const cancelled = await app.inject({ method: "POST", url: `/api/projects/${projectId}/jobs/${running.id}/cancel` });
        expect(cancelled.json().status).toBe("CANCELLED");
      }
      return result;
    });
    const batch = await app.inject({ method: "POST", url: `${base}/chapters/generate-pending`, payload: {} });
    expect(batch.statusCode, batch.body).toBe(200);
    const { jobId } = batch.json<{ jobId: string }>();
    const jobUrl = `/api/projects/${document.projectId}/jobs/${jobId}`;
    expect((await app.inject({ method: "GET", url: jobUrl })).json().status).toBe("CANCELLED");
    expect(generatedIds).toEqual([document.version.outline[0]!.id]);

    cancelAt = 2;
    const resumeUrl = `/api/projects/${document.projectId}/product-document-jobs/${jobId}/resume`;
    const pausedAgain = await app.inject({ method: "POST", url: resumeUrl, payload: {} });
    expect(pausedAgain.statusCode, pausedAgain.body).toBe(200);
    expect((await app.inject({ method: "GET", url: jobUrl })).json().status).toBe("CANCELLED");
    expect(generatedIds).toEqual(document.version.outline.slice(0, 2).map((chapter) => chapter.id));

    cancelAt = -1;
    const completed = await app.inject({ method: "POST", url: resumeUrl, payload: {} });
    expect(completed.statusCode, completed.body).toBe(200);
    expect((await app.inject({ method: "GET", url: jobUrl })).json().status).toBe("COMPLETED");
    expect(generatedIds).toEqual(document.version.outline.map((chapter) => chapter.id));
    const replay = await app.inject({ method: "POST", url: resumeUrl, payload: {} });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().document.version).toEqual(completed.json().document.version);
    expect(generatedIds).toHaveLength(document.version.outline.length);
  });

  it("rejects exhausted retries before generating more content", async () => {
    await action("outline/generate");
    const document = await action("outline/approve");
    const generate = vi.spyOn(ProductStudioService.prototype, "generateChapter")
      .mockRejectedValue(new Error("Controlled generation failure"));
    const failed = await app.inject({ method: "POST", url: `${base}/chapters/generate-pending`, payload: {} });
    expect(failed.statusCode).toBe(422);
    const jobs = await app.inject({ method: "GET", url: `/api/projects/${document.projectId}/jobs` });
    const job = jobs.json<{ jobs: Array<{ id: string; jobType: string }> }>().jobs.find((item) => item.jobType === "product_chapters")!;
    const url = `/api/projects/${document.projectId}/product-document-jobs/${job.id}/resume`;
    for (let retry = 0; retry < 2; retry++) {
      expect((await app.inject({ method: "POST", url, payload: {} })).statusCode).toBe(422);
    }
    const exhausted = await app.inject({ method: "POST", url, payload: {} });
    expect(exhausted.statusCode, exhausted.body).toBe(409);
    expect(generate).toHaveBeenCalledTimes(3);
    expect((await app.inject({ method: "GET", url: `/api/projects/${document.projectId}/jobs/${job.id}` })).json().status).toBe("FAILED");
  });

  it("rejects a second resume while the batch is running", async () => {
    await action("outline/generate");
    const document = await action("outline/approve");
    const generate = ProductStudioService.prototype.generateChapter;
    vi.spyOn(ProductStudioService.prototype, "generateChapter").mockImplementationOnce(async function (this: ProductStudioService, projectId, documentId, chapterId) {
      const jobs = await app.inject({ method: "GET", url: `/api/projects/${projectId}/jobs` });
      const job = jobs.json<{ jobs: Array<{ id: string; jobType: string }> }>().jobs.find((item) => item.jobType === "product_chapters")!;
      const concurrent = await app.inject({ method: "POST", url: `/api/projects/${projectId}/product-document-jobs/${job.id}/resume`, payload: {} });
      expect(concurrent.statusCode, concurrent.body).toBe(409);
      return generate.call(this, projectId, documentId, chapterId);
    });
    const batch = await app.inject({ method: "POST", url: `${base}/chapters/generate-pending`, payload: {} });
    expect(batch.statusCode, batch.body).toBe(200);
    expect(batch.json().document.version.outline).toHaveLength(document.version.outline.length);
  });
});
