import type {
  ProductBlock,
  ProductDocument,
  Project,
} from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as mammoth from "mammoth";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { projectExportProfileInput } from "../src/services/product-export-service.js";

describe("Product Studio physical assets and exports", () => {
  let app: FastifyInstance;
  let root: string;
  let databasePath: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "our-platform-product-export-"));
    const data = join(root, "data");
    mkdirSync(data, { recursive: true });
    databasePath = join(data, "our-platform.sqlite");
    app = await createApp({ databasePath, serveFrontend: false });
  });

  afterEach(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  async function createReadyDocument(): Promise<{
    project: Project;
    document: ProductDocument;
  }> {
    const demo = await app.inject({
      method: "POST",
      url: "/api/demo/projects",
    });
    const project = demo.json<{ project: Project }>().project;
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents`,
      payload: {
        documentType: "workbook",
        title: "Plan de lanzamiento",
        language: "es",
        length: "short",
        level: "beginner",
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    let document = created.json<ProductDocument>();
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
        payload: {},
      })
    ).json<ProductDocument>();
    const editedOutline=await app.inject({method:"PATCH",url:`/api/projects/${project.id}/product-documents/${document.id}/outline`,payload:{operation:"update",itemId:document.version.outline[0]!.id,title:"Inicio práctico",targetWords:350}});expect(editedOutline.statusCode,editedOutline.body).toBe(200);document=editedOutline.json<ProductDocument>();
    document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/outline/approve`,
        payload: {},
      })
    ).json<ProductDocument>();
    const batch = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/generate-pending`,
      payload: {},
    });
    expect(batch.statusCode, batch.body).toBe(200);
    document = batch.json<{ document: ProductDocument }>().document;
    return { project, document };
  }

  async function createExportableDocument(
    project: Project,
    documentType: "ebook" | "checklist" | "guide",
  ): Promise<ProductDocument> {
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents`,
      payload: {
        documentType,
        title: `Perfil ${documentType}`,
        language: "es",
        length: "short",
        level: "beginner",
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    let document = created.json<ProductDocument>();
    const outlined = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`,
      payload: {},
    });
    expect(outlined.statusCode, outlined.body).toBe(200);
    document = outlined.json<ProductDocument>();
    const now = new Date().toISOString();
    const blocks: ProductBlock[] = [
      {
        id: crypto.randomUUID(),
        type: "heading",
        content: "Preparación",
        order: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: documentType === "checklist" ? "checklist" : "paragraph",
        content:
          documentType === "checklist"
            ? ["Definir objetivo", "Completar tarea", "Revisar resultado"]
            : "Contenido de exportación.",
        order: 1,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      },
    ];
    const saved = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/product-documents/${document.id}/autosave`,
      payload: {
        baseVersionNumber: document.version.versionNumber,
        idempotencyKey: `export-profile-${documentType}-001`,
        blocks,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    return saved.json<ProductDocument>();
  }

  async function exportDocument(
    project: Project,
    document: ProductDocument,
    format: "html" | "docx",
  ) {
    const exported = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/exports`,
      payload: { format },
    });
    expect(exported.statusCode, exported.body).toBe(201);
    const download = await app.inject({
      method: "GET",
      url: exported.json<{ downloadUrl: string }>().downloadUrl,
    });
    expect(download.statusCode).toBe(200);
    return download.rawPayload;
  }

  it("proyecta sólo la entrada de perfil y la aplica en HTML y DOCX sin mutar la versión", async () => {
    const project = (
      await app.inject({ method: "POST", url: "/api/demo/projects" })
    ).json<{ project: Project }>().project;
    const ebook = await createExportableDocument(project, "ebook");
    const ebookBefore = structuredClone(ebook.version);
    expect(projectExportProfileInput(ebook)).toEqual({
      documentType: ebook.documentType,
      outline: ebook.version.outline,
      blocks: ebook.version.blocks,
      theme: ebook.version.theme,
    });
    expect(Object.keys(projectExportProfileInput(ebook)).sort()).toEqual([
      "blocks",
      "documentType",
      "outline",
      "theme",
    ]);
    const ebookHtml = (
      await exportDocument(project, ebook, "html")
    ).toString("utf8");
    expect(ebookHtml).toContain('data-export-profile="ebook"');
    expect(ebookHtml).toContain("Ebook ·");
    expect(await exportDocument(project, ebook, "html")).toEqual(
      Buffer.from(ebookHtml, "utf8"),
    );
    expect(
      (await mammoth.convertToHtml({ buffer: await exportDocument(project, ebook, "docx") })).value,
    ).toContain("Ebook ·");

    const checklist = await createExportableDocument(project, "checklist");
    const checklistHtml = (
      await exportDocument(project, checklist, "html")
    ).toString("utf8");
    expect(checklistHtml).toContain('data-export-profile="checklist"');
    expect(checklistHtml).toContain("Checklist ·");
    expect(checklistHtml).toContain("3 tareas");
    expect(
      (await mammoth.convertToHtml({ buffer: await exportDocument(project, checklist, "docx") })).value,
    ).toContain("Checklist ·");

    const guide = await createExportableDocument(project, "guide");
    const guideHtml = (
      await exportDocument(project, guide, "html")
    ).toString("utf8");
    expect(guideHtml).not.toContain("data-export-profile=");
    expect(guideHtml).toContain('<span class="type">guide</span>');

    const after = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/product-documents/${ebook.id}`,
    });
    expect(after.statusCode, after.body).toBe(200);
    expect(after.json<ProductDocument>().version).toEqual(ebookBefore);
  });

  it("genera assets seguros y archivos HTML, DOCX y PDF físicos, sin sobrescribir historial", async () => {
    let { project, document } = await createReadyDocument();
    const imageBytes = await sharp({
      create: { width: 80, height: 50, channels: 4, background: "#76a953" },
    })
      .png()
      .toBuffer();
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-assets`,
      payload: {
        title: "Mapa visual",
        filename: "mapa.png",
        mimeType: "image/png",
        contentBase64: imageBytes.toString("base64"),
      },
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const image = uploaded.json<{
      id: string;
      mimeType: string;
      url: string;
    }>();
    expect(image.mimeType).toBe("image/webp");

    const diagramResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-assets/diagrams`,
      payload: {
        title: "Flujo de trabajo",
        diagramType: "flowchart",
        description: "Definir objetivo. Crear borrador. Revisar resultado.",
      },
    });
    expect(diagramResponse.statusCode, diagramResponse.body).toBe(201);
    const diagram = diagramResponse.json<{ id: string; mimeType: string }>();
    expect(diagram.mimeType).toBe("image/svg+xml");

    const now = new Date().toISOString();
    const chapterId = document.version.outline[0]!.id;
    const assetBlocks: ProductBlock[] = [
      {
        id: crypto.randomUUID(),
        type: "image",
        content: "Mapa visual",
        order: document.version.blocks.length,
        metadata: { chapterId, assetId: image.id },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: "diagram",
        content: "Flujo de trabajo",
        order: document.version.blocks.length + 1,
        metadata: { chapterId, assetId: diagram.id },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: "checklist",
        content: ["Definir objetivo", "Revisar evidencia"],
        order: document.version.blocks.length + 2,
        metadata: { chapterId },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: "exercise",
        content: {
          title: "Ejercicio",
          objective: "Definir el siguiente paso",
          instructions: "Escribe una acción concreta",
          question: "¿Qué harás hoy?",
          responseSpace: "",
        },
        order: document.version.blocks.length + 3,
        metadata: { chapterId },
        createdAt: now,
        updatedAt: now,
      },
    ];
    const saved = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/product-documents/${document.id}/autosave`,
      payload: {
        baseVersionNumber: document.version.versionNumber,
        idempotencyKey: "physical-export-assets",
        blocks: [...document.version.blocks, ...assetBlocks],
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    document = saved.json<ProductDocument>();

    for (const chapter of document.version.outline) {
      const approved = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/${chapter.id}/approve`,
        payload: {},
      });
      expect(approved.statusCode, approved.body).toBe(200);
      document = approved.json<ProductDocument>();
    }
    const approval = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/approve`,
      payload: {},
    });
    expect(approval.statusCode, approval.body).toBe(200);

    const outputs = new Map<string, Buffer>();
    for (const format of ["html", "docx", "pdf"] as const) {
      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/exports`,
        payload: { format },
      });
      expect(response.statusCode, response.body).toBe(201);
      const exported = response.json<{
        filename: string;
        downloadUrl: string;
        bytes: number;
      }>();
      expect(exported.filename.endsWith(`.${format}`)).toBe(true);
      expect(exported.bytes).toBeGreaterThan(100);
      const download = await app.inject({
        method: "GET",
        url: exported.downloadUrl,
      });
      expect(download.statusCode).toBe(200);
      outputs.set(format, download.rawPayload);
    }

    const html = outputs.get("html")!.toString("utf8");
    expect(html).toContain("Plan de lanzamiento");
    expect(html).toContain("data:image/webp;base64,");
    expect(html).not.toMatch(/<script\b/i);
    const docx = outputs.get("docx")!;
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    expect(docx.includes(Buffer.from("word/document.xml"))).toBe(true);
    expect(outputs.get("pdf")!.subarray(0, 5).toString()).toBe("%PDF-");

    const history = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/product-documents/${document.id}/exports`,
    });
    expect(history.json<{ exports: unknown[] }>().exports).toHaveLength(3);

    const backupResponse=await app.inject({method:"POST",url:"/api/backups",payload:{}});expect(backupResponse.statusCode,backupResponse.body).toBe(201);const backup=backupResponse.json<{filename:string}>();
    expect(existsSync(join(root,"data","backups",`${backup.filename}.assets`))).toBe(true);
    expect(existsSync(join(root,"data","backups",`${backup.filename}.files`))).toBe(true);
    const restored=await app.inject({method:"POST",url:"/api/backups/restore",payload:{filename:backup.filename,confirmed:true}});expect(restored.statusCode,restored.body).toBe(200);
    const afterRestore=await app.inject({method:"GET",url:`/api/projects/${project.id}/product-documents/${document.id}/exports`});expect(afterRestore.json<{exports:unknown[]}>().exports).toHaveLength(3);

    await app.close();
    app = await createApp({ databasePath, serveFrontend: false });
    const persisted = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/product-documents/${document.id}/exports`,
    });
    expect(persisted.json<{ exports: unknown[] }>().exports).toHaveLength(3);
  }, 90_000);

  it("rechaza MIME falso, directivas Mermaid peligrosas y acceso cruzado a assets", async () => {
    const { project } = await createReadyDocument();
    const outsider = (
      await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "Otro proyecto", niche: "QA" },
      })
    ).json<Project>();
    const fake = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-assets`,
      payload: {
        title: "Falso",
        filename: "ataque.svg",
        mimeType: "image/svg+xml",
        contentBase64: "PHNjcmlwdD4=",
      },
    });
    expect(fake.statusCode).toBe(422);
    const unsafe = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-assets/diagrams`,
      payload: {
        title: "Peligroso",
        diagramType: "flowchart",
        description: "A",
        advancedSource: "flowchart TD\nA-->B\nclick A href https://example.com",
      },
    });
    expect(unsafe.statusCode).toBe(422);

    const imageBytes = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#000000" },
    })
      .png()
      .toBuffer();
    const asset = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-assets`,
        payload: {
          title: "Privado",
          filename: "privado.png",
          mimeType: "image/png",
          contentBase64: imageBytes.toString("base64"),
        },
      })
    ).json<{ id: string }>();
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/projects/${outsider.id}/product-assets/${asset.id}/content`,
        })
      ).statusCode,
    ).toBe(404);
  }, 45_000);

  it("elimina archivos físicos del Product Studio al borrar el proyecto permanentemente", async () => {
    const { project } = await createReadyDocument();
    const imageBytes = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-assets`,
      payload: {
        title: "Temporal",
        filename: "temporal.png",
        mimeType: "image/png",
        contentBase64: imageBytes.toString("base64"),
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const assetDirectory = join(root, "data", "assets", project.id);
    expect(existsSync(assetDirectory)).toBe(true);
    await app.inject({ method: "DELETE", url: `/api/projects/${project.id}` });
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/projects/${project.id}/permanent`,
      payload: { confirmProjectName: project.name },
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(existsSync(assetDirectory)).toBe(false);
  }, 45_000);
});
