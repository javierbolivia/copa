import type {
  ModuleResult,
  ProductBlock,
  ProductDocument,
  Project,
} from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ArtifactRepository } from "../src/repositories/artifact-repository.js";

describe("Product Studio backend", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await createApp({ databasePath: ":memory:", serveFrontend: false });
  });
  afterEach(async () => app.close());

  async function demo() {
    return (
      await app.inject({ method: "POST", url: "/api/demo/projects" })
    ).json<{ project: Project }>().project;
  }
  async function create(project: Project) {
    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents`,
      payload: {
        documentType: "ebook",
        language: "es",
        length: "short",
        level: "beginner",
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<ProductDocument>();
  }

  it("rechaza una versión de producto de otro proyecto al crear un ebook", async () => {
    const source = await demo();
    const target = await demo();
    const foreign = (await app.inject({ method: "GET", url: `/api/projects/${source.id}/modules/product` }))
      .json<{ results: Array<{ versionId: string }> }>().results[0]!;

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${target.id}/product-documents`,
      payload: { documentType: "ebook", language: "es", length: "short", level: "beginner", productArtifactVersionId: foreign.versionId },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "product_document_blocked" });
  });

  it("captures all upstream context and becomes stale when it changes", async () => {
    const project = await demo();
    const document = await create(project);
    const snapshot = JSON.parse(
      String(document.version.metadata.upstreamParentVersionIds),
    ) as Record<string, string>;
    expect(snapshot).toMatchObject({ product: document.productArtifactVersionId });
    expect(snapshot).toHaveProperty("avatar");

    const outline = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
      payload: {},
    });
    expect(outline.statusCode, outline.body).toBe(200);
    const revisedDocument = outline.json<ProductDocument>();
    const traceability = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/versions/${revisedDocument.artifactVersionId}/traceability`,
    });
    expect(traceability.statusCode, traceability.body).toBe(200);
    expect(traceability.json().edges).toContainEqual({
      from: snapshot.avatar,
      to: revisedDocument.artifactVersionId,
      relation: "derived_from",
    });

    const replacement = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/modules/avatar/run`,
      payload: { provider: "mock" },
    });
    expect(replacement.statusCode, replacement.body).toBe(200);
    const pendingAvatar = replacement.json<ModuleResult>();
    expect(pendingAvatar.status).toBe("draft");

    // A pending interpretation does not replace the active parent. The
    // document becomes stale only when that reviewed Avatar is activated.
    const beforeApproval = (await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/product-documents/${document.id}`,
    })).json<ProductDocument>();
    expect(beforeApproval.freshness).toBe("fresh");

    const approval = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/modules/avatar/versions/${pendingAvatar.versionId}/approve`,
    });
    expect(approval.statusCode, approval.body).toBe(200);

    const stale = (await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/product-documents/${document.id}`,
    })).json<ProductDocument>();
    expect(stale).toMatchObject({ freshness: "stale", status: "STALE" });
  });

  it("blocks Product Studio while a current Avatar draft awaits review", async () => {
    const project = await demo();
    const avatar = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/modules/avatar/run`,
      payload: { provider: "mock" },
    });
    expect(avatar.statusCode, avatar.body).toBe(200);
    expect(avatar.json<ModuleResult>().status).toBe("draft");

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents`,
      payload: {
        documentType: "ebook",
        language: "es",
        length: "short",
        level: "beginner",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "product_document_blocked",
      message: expect.stringContaining("Avatar tiene un borrador vigente pendiente de aprobación"),
    });
  });

  it("crea wizard persistente, edita outline, genera por lote y aprueba", async () => {
    const project = await demo();
    let document = await create(project);
    expect(document).toMatchObject({
      projectId: project.id,
      documentType: "ebook",
      status: "DRAFT",
      version: { versionNumber: 1, blocks: [] },
    });

    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
        payload: {},
      })
    ).json<ProductDocument>();
    expect(document.status).toBe("OUTLINE_READY");
    expect(document.version.outline.length).toBeGreaterThan(3);
    const first = document.version.outline[0]!;
    const edit = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}/product-documents/${document.id}/outline`,
      payload: {
        operation: "update",
        itemId: first.id,
        title: "Bienvenida práctica",
        targetWords: 450,
      },
    });
    expect(edit.statusCode, edit.body).toBe(200);
    document = edit.json<ProductDocument>();
    expect(document.version.outline[0]).toMatchObject({
      title: "Bienvenida práctica",
      targetWords: 450,
    });
    document = (
      await app.inject({
        method: "PATCH",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline`,
        payload: { operation: "duplicate", itemId: first.id },
      })
    ).json<ProductDocument>();
    expect(document.version.outline[1]?.title).toContain("copia");
    const copyId = document.version.outline[1]!.id;
    document = (
      await app.inject({
        method: "PATCH",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline`,
        payload: {
          operation: "move",
          itemId: copyId,
          toIndex: document.version.outline.length - 1,
        },
      })
    ).json<ProductDocument>();
    expect(document.version.outline.at(-1)?.id).toBe(copyId);
    document = (
      await app.inject({
        method: "PATCH",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline`,
        payload: { operation: "delete", itemId: copyId },
      })
    ).json<ProductDocument>();
    expect(document.version.outline.some((item) => item.id === copyId)).toBe(
      false,
    );
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/approve`,
        payload: {},
      })
    ).json<ProductDocument>();
    expect(document.status).toBe("OUTLINE_APPROVED");

    const batch = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/generate-pending`,
      payload: {},
    });
    expect(batch.statusCode, batch.body).toBe(200);
    document = batch.json<{ jobId: string; document: ProductDocument }>()
      .document;
    expect(document.version.blocks.length).toBeGreaterThan(
      document.version.outline.length,
    );
    for (const chapter of document.version.outline) {
      const approved = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/${chapter.id}/approve`,
        payload: {},
      });
      expect(approved.statusCode, approved.body).toBe(200);
      document = approved.json<ProductDocument>();
    }
    const versionBeforeApproval = document.activeVersionId;
    const failApproval = vi.spyOn(ArtifactRepository.prototype, "approveVersion")
      .mockImplementationOnce(() => { throw new Error("simulated artifact approval failure"); });
    const failed = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/approve`,
      payload: {},
    });
    failApproval.mockRestore();
    expect(failed.statusCode).toBe(422);
    const afterFailure = (await app.inject({
      method: "GET", url: `/api/projects/${project.id}/product-documents/${document.id}`,
    })).json<ProductDocument>();
    expect(afterFailure.activeVersionId).toBe(versionBeforeApproval);
    expect(afterFailure.status).not.toBe("APPROVED");

    const approved = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/approve`,
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json<ProductDocument>()).toMatchObject({
      status: "APPROVED",
      freshness: "fresh",
    });
    const jobs = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/jobs`,
      })
    ).json<{ jobs: Array<{ jobType: string; status: string }> }>().jobs;
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobType: "product_chapters",
          status: "COMPLETED",
        }),
      ]),
    );
  }, 30_000);

  it("hace autosave idempotente, rechaza carreras y contenido ejecutable", async () => {
    const project = await demo();
    let document = await create(project);
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
        payload: {},
      })
    ).json<ProductDocument>();
    const now = new Date().toISOString();
    const block: ProductBlock = {
      id: crypto.randomUUID(),
      type: "paragraph",
      content: "Edición humana",
      order: 0,
      metadata: {
        evidenceId: "00000000-0000-4000-8000-000000000001",
        evidenceIds: ["00000000-0000-4000-8000-000000000001"],
      },
      createdAt: now,
      updatedAt: now,
    };
    const payload = {
      baseVersionNumber: document.version.versionNumber,
      idempotencyKey: "autosave-test-001",
      blocks: [block],
    };
    const first = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/product-documents/${document.id}/autosave`,
      payload,
    });
    expect(first.statusCode, first.body).toBe(200);
    const savedDocument = first.json<ProductDocument>();
    expect(savedDocument.version.blocks[0]?.metadata.evidenceIds).toEqual([
      "00000000-0000-4000-8000-000000000001",
    ]);
    const loaded = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/product-documents/${document.id}`,
    });
    expect(loaded.statusCode, loaded.body).toBe(200);
    expect(
      loaded.json<ProductDocument>().version.blocks[0]?.metadata.evidenceIds,
    ).toEqual(["00000000-0000-4000-8000-000000000001"]);
    const firstVersion = savedDocument.version.versionNumber;
    const replay = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/product-documents/${document.id}/autosave`,
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json<ProductDocument>().version.versionNumber).toBe(
      firstVersion,
    );
    const stale = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/product-documents/${document.id}/autosave`,
      payload: { ...payload, idempotencyKey: "autosave-test-002" },
    });
    expect(stale.statusCode).toBe(409);
    const unsafe = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/product-documents/${document.id}/autosave`,
      payload: {
        baseVersionNumber: firstVersion,
        idempotencyKey: "autosave-test-003",
        blocks: [
          {
            ...block,
            id: crypto.randomUUID(),
            content: "<script>alert(1)</script>",
          },
        ],
      },
    });
    expect(unsafe.statusCode).toBe(422);
  }, 30_000);

  it("conserva ediciones humanas al generar o regenerar otros capítulos", async () => {
    const project = await demo();
    let document = await create(project);
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
        payload: {},
      })
    ).json<ProductDocument>();
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/approve`,
        payload: {},
      })
    ).json<ProductDocument>();
    const [first, second] = document.version.outline;
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/${first!.id}/generate`,
        payload: {},
      })
    ).json<ProductDocument>();
    const now = new Date().toISOString(),
      manual: ProductBlock = {
        id: crypto.randomUUID(),
        type: "exercise",
        content: "Ejercicio humano que no debe perderse",
        order: document.version.blocks.length,
        metadata: { authorship: "human" },
        createdAt: now,
        updatedAt: now,
      };
    document = (
      await app.inject({
        method: "PUT",
        url: `/api/projects/${project.id}/product-documents/${document.id}/autosave`,
        payload: {
          baseVersionNumber: document.version.versionNumber,
          idempotencyKey: "human-edit-preserve-001",
          blocks: [...document.version.blocks, manual],
        },
      })
    ).json<ProductDocument>();
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/${second!.id}/generate`,
        payload: {},
      })
    ).json<ProductDocument>();
    expect(document.version.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: manual.id, content: manual.content }),
      ]),
    );
    const firstIds = document.version.blocks
      .filter((block) => block.metadata.chapterId === first!.id)
      .map((block) => block.id);
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/${second!.id}/generate`,
        payload: {},
      })
    ).json<ProductDocument>();
    expect(
      document.version.blocks.some((block) => block.id === manual.id),
    ).toBe(true);
    expect(
      document.version.blocks
        .filter((block) => block.metadata.chapterId === first!.id)
        .map((block) => block.id),
    ).toEqual(firstIds);
  }, 30_000);

  it("aísla proyectos, registra RAG exacto y queda stale al cambiar Product", async () => {
    const project = await demo(),
      outsider = (
        await app.inject({
          method: "POST",
          url: "/api/projects",
          payload: { name: "Otro", niche: "Otro" },
        })
      ).json<Project>();
    const library = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/knowledge/libraries`,
        payload: { name: "Product base", scope: "PROJECT" },
      })
    ).json<{ id: string }>();
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/knowledge/libraries/${library.id}/documents`,
      payload: {
        title: "Introducción",
        fileType: "manual",
        text: "La introducción debe empezar con una acción pequeña, observable y revisable.",
      },
    });
    const direct = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/knowledge/search?q=introduccion`,
    });
    expect(direct.statusCode, direct.body).toBe(200);
    expect(direct.body).toContain("Introducci");
    let document = await create(project);
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
        payload: {},
      })
    ).json<ProductDocument>();
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/approve`,
        payload: {},
      })
    ).json<ProductDocument>();
    const chapter = document.version.outline[0]!;
    const generated = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/${chapter.id}/generate`,
      payload: {},
    });
    expect(generated.statusCode, generated.body).toBe(200);
    document = generated.json<ProductDocument>();
    const generations = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/generations`,
      })
    ).json<{ generations: Array<{ id: string; agentKey: string }> }>()
      .generations;
    const generation = generations.find(
      (item) => item.agentKey === "product_chapter",
    )!;
    const used = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/generations/${generation.id}/knowledge`,
    });
    expect(used.statusCode, used.body).toBe(200);
    expect(used.body).toContain("Introducci");
    const trace = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/versions/${document.artifactVersionId}/traceability`,
    });
    expect(trace.statusCode, trace.body).toBe(200);
    expect(
      trace.json<{ knowledgeCount: number }>().knowledgeCount,
    ).toBeGreaterThan(0);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/projects/${outsider.id}/product-documents/${document.id}`,
        })
      ).statusCode,
    ).toBe(404);
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/modules/product/run`,
      payload: { provider: "mock", instructions: "Nueva revisión" },
    });
    const stale = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/product-documents/${document.id}`,
      })
    ).json<ProductDocument>();
    expect(stale).toMatchObject({ status: "STALE", freshness: "stale" });
  }, 30_000);
  it("usa OpenAI estructurado cuando el proyecto lo configura y conserva coste/prompt", async () => {
    await app.close();
    const outputs = [
      {
        chapters: [
          {
            title: "Introducción",
            objective: "Orientar al lector",
            targetWords: 300,
          },
          { title: "Plan", objective: "Aplicar el método", targetWords: 500 },
        ],
      },
      {
        blocks: [
          { type: "heading", content: "Introducción" },
          {
            type: "paragraph",
            content: "Un avance práctico y revisable.",
            provenance: "AI_INFERENCE",
          },
          {
            type: "checklist",
            content: "Definir objetivo\nRevisar resultado",
            provenance: "AI_INFERENCE",
          },
        ],
      },
    ];
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          model: "gpt-5-test",
          status: "completed",
          usage: { input_tokens: 120, output_tokens: 80 },
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify(outputs.shift()) },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      openAI: { apiKey: "test-key", fetch: fakeFetch },
    });
    const project = await demo(),
      settings = (
        await app.inject({
          method: "GET",
          url: `/api/projects/${project.id}/settings`,
        })
      ).json<Record<string, unknown>>();
    const updated = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/settings`,
      payload: {
        language: settings.language,
        targetMarket: settings.targetMarket,
        currency: settings.currency,
        generalNotes: settings.generalNotes,
        preferredLlmProvider: "openai",
        economyModel: "gpt-5-mini-test",
        powerfulModel: "gpt-5-test",
        maxBudget: 2,
        contentLanguage: settings.contentLanguage,
        knowledgeEnabled: true,
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    let document = await create(project);
    const outline = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
      payload: {},
    });
    expect(outline.statusCode, outline.body).toBe(200);
    document = outline.json<ProductDocument>();
    expect(document.version.outline.map((item) => item.title)).toEqual([
      "Introducción",
      "Plan",
    ]);
    const estimate = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/product-documents/${document.id}/generation-estimate`,
    });
    expect(estimate.statusCode, estimate.body).toBe(200);
    expect(
      estimate.json<{ provider: string; estimatedCost: number }>(),
    ).toMatchObject({ provider: "openai" });
    expect(
      estimate.json<{ estimatedCost: number }>().estimatedCost,
    ).toBeGreaterThan(0);
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/approve`,
        payload: {},
      })
    ).json<ProductDocument>();
    const chapter = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/${document.version.outline[0]!.id}/generate`,
      payload: {},
    });
    expect(chapter.statusCode, chapter.body).toBe(200);
    expect(
      chapter
        .json<ProductDocument>()
        .version.blocks.some((block) => block.type === "checklist"),
    ).toBe(true);
    const generations = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/generations`,
      })
    )
      .json<{
        generations: Array<{
          provider: string;
          model: string;
          promptVersion: string;
          estimatedCost: number;
        }>;
      }>()
      .generations.filter((item) => item.promptVersion.startsWith("product-"));
    expect(generations).toHaveLength(2);
    expect(
      generations.every(
        (item) =>
          item.provider === "openai" &&
          item.model === "gpt-5-test" &&
          item.estimatedCost > 0,
      ),
    ).toBe(true);
  }, 30_000);

  it("rechaza por presupuesto antes de realizar una llamada OpenAI", async () => {
    await app.close();
    let calls = 0;
    app = await createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      openAI: {
        apiKey: "test-key",
        fetch: async () => {
          calls += 1;
          return new Response("{}", { status: 500 });
        },
      },
    });
    const project = await demo(),
      settings = (
        await app.inject({
          method: "GET",
          url: `/api/projects/${project.id}/settings`,
        })
      ).json<Record<string, unknown>>();
    const updated = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/settings`,
      payload: {
        language: settings.language,
        targetMarket: settings.targetMarket,
        currency: settings.currency,
        generalNotes: settings.generalNotes,
        preferredLlmProvider: "openai",
        economyModel: "gpt-5-mini-test",
        powerfulModel: "gpt-5-test",
        maxBudget: 0,
        contentLanguage: settings.contentLanguage,
        knowledgeEnabled: true,
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    const document = await create(project);
    const generated = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
      payload: {},
    });
    expect(generated.statusCode, generated.body).toBe(409);
    expect(calls).toBe(0);
    const generations = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/generations`,
      })
    ).json<{ generations: Array<{ agentKey: string }> }>().generations;
    expect(
      generations.filter((item) => item.agentKey === "product_outline"),
    ).toHaveLength(0);
  });
});
