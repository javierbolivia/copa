import type {
  ProductBlock,
  ProductDocument,
  Project,
} from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import * as mammoth from "mammoth";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { extractPdf } from "../src/services/knowledge/index.js";
import { projectExportProfileInput } from "../src/services/product-export-service.js";

function docxDocumentXml(bytes: Buffer): string {
  for (let offset = 0; offset + 30 <= bytes.length; ) {
    if (bytes.readUInt32LE(offset) !== 0x04034b50) {
      offset++;
      continue;
    }
    const flags = bytes.readUInt16LE(offset + 6);
    const compression = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const filenameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const filenameStart = offset + 30;
    const dataStart = filenameStart + filenameLength + extraLength;
    const filename = bytes
      .subarray(filenameStart, filenameStart + filenameLength)
      .toString("utf8");
    if (!(flags & 0x08) && filename === "word/document.xml") {
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      return (compression === 8 ? inflateRawSync(data) : data).toString("utf8");
    }
    offset = dataStart + compressedSize;
  }
  throw new Error("No se encontró word/document.xml en el DOCX.");
}

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

  it("rechaza assets de un proyecto inexistente antes de procesar imágenes o diagramas", async () => {
    const base = "/api/projects/00000000-0000-4000-8000-000000000000/product-assets";
    const requests = [
      { method: "GET" as const, url: base },
      { method: "GET" as const, url: `${base}/image-generation` },
      { method: "POST" as const, url: base, payload: { title: "Imagen", filename: "imagen.png", mimeType: "image/png", contentBase64: "aW52YWxpZA==" } },
      { method: "POST" as const, url: `${base}/diagrams`, payload: { title: "Diagrama", diagramType: "flowchart", description: "Paso A a B" } },
    ];
    for (const request of requests) {
      const response = await app.inject(request);
      expect(response.statusCode, `${request.method} ${request.url}: ${response.body}`).toBe(404);
      expect(response.json()).toMatchObject({ error: "not_found" });
    }
  });

  it.each([
    { width: 3200, height: 1600, orientation: 1, expectedWidth: 2400, expectedHeight: 1200 },
    { width: 800, height: 400, orientation: 6, expectedWidth: 400, expectedHeight: 800 },
  ])("stores the dimensions of the processed image ($width x $height, orientation $orientation)", async ({ width, height, orientation, expectedWidth, expectedHeight }) => {
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Image dimensions", niche: "Photography" } });
    expect(created.statusCode, created.body).toBe(201);
    const project = created.json<Project>();
    const source = await sharp({ create: { width, height, channels: 3, background: "#315efb" } })
      .jpeg().withMetadata({ orientation }).toBuffer();
    const uploaded = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/product-assets`,
      payload: { title: "Processed image", filename: "image.jpg", mimeType: "image/jpeg", contentBase64: source.toString("base64") },
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const asset = uploaded.json<{ id: string; url: string; width: number; height: number }>();
    const downloaded = await app.inject({ method: "GET", url: asset.url });
    expect(downloaded.statusCode).toBe(200);
    const actual = await sharp(downloaded.rawPayload).metadata();
    expect(actual).toMatchObject({ width: expectedWidth, height: expectedHeight });
    expect(asset).toMatchObject({ width: actual.width, height: actual.height });
    const listed = await app.inject({ method: "GET", url: `/api/projects/${project.id}/product-assets` });
    expect(listed.json<{ assets: unknown[] }>().assets).toContainEqual(expect.objectContaining({ id: asset.id, width: actual.width, height: actual.height }));
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
    format: "html" | "docx" | "pdf",
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

  it("detecta marcadores reales sin confundirlos con texto normal en español", async () => {
    const project = (
      await app.inject({ method: "POST", url: "/api/demo/projects" })
    ).json<{ project: Project }>().project;
    const document = await createExportableDocument(project, "ebook");
    const content = document.version.blocks.map((block) =>
      block.type === "paragraph"
        ? { ...block, content: "El método permite completar todo el registro y revisar el resultado." }
        : block,
    );
    const saved = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/product-documents/${document.id}/autosave`,
      payload: {
        baseVersionNumber: document.version.versionNumber,
        idempotencyKey: "placeholder-validation-spanish-001",
        blocks: content,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const validate = async () =>
      app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents/${document.id}/validate`,
        payload: {},
      });

    let validation = await validate();
    expect(validation.statusCode, validation.body).toBe(200);
    expect(validation.json<{ warnings: string[] }>().warnings).not.toContainEqual(
      expect.stringContaining("contiene un placeholder"),
    );

    const current = saved.json<ProductDocument>();
    const withMarker = current.version.blocks.map((block) =>
      block.type === "paragraph"
        ? { ...block, content: "TODO: completar este campo antes de publicar." }
        : block,
    );
    const markerSaved = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/product-documents/${document.id}/autosave`,
      payload: {
        baseVersionNumber: current.version.versionNumber,
        idempotencyKey: "placeholder-validation-marker-002",
        blocks: withMarker,
      },
    });
    expect(markerSaved.statusCode, markerSaved.body).toBe(200);
    validation = await validate();
    expect(validation.statusCode, validation.body).toBe(200);
    expect(validation.json<{ warnings: string[] }>().warnings).toContainEqual(
      expect.stringContaining("contiene un placeholder"),
    );
  });

  it("deriva una presentación ebook estructurada en HTML, DOCX y PDF sin mutar la versión", async () => {
    const project = (
      await app.inject({ method: "POST", url: "/api/demo/projects" })
    ).json<{ project: Project }>().project;
    let ebook = await createExportableDocument(project, "ebook");
    const chapters = [...ebook.version.outline].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id),
    );
    expect(chapters.length).toBeGreaterThan(1);
    const now = new Date().toISOString();
    const blocks: ProductBlock[] = [
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Bloque del segundo capítulo.",
        order: 0,
        metadata: { chapterId: chapters[1]!.id },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Bloque del primer capítulo.",
        order: 1,
        metadata: { chapterId: chapters[0]!.id },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Contenido sin capítulo A.",
        order: 2,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Contenido sin capítulo B.",
        order: 3,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: "sourceReference",
        content:
          "PDSA. Example resource: https://example.com/dog?first=one&second=two. Credential URL: https://user:pass@example.com/private",
        order: 4,
        metadata: { provenance: "KNOWLEDGE" },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: "table",
        content: "Fecha | Hora\n08:00 | 08:30",
        order: 5,
        metadata: { chapterId: chapters[0]!.id },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        type: "table",
        content: { rows: ["Pregunta | Dato pendiente & contexto"] },
        order: 6,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      },
    ];
    const saved = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/product-documents/${ebook.id}/autosave`,
      payload: {
        baseVersionNumber: ebook.version.versionNumber,
        idempotencyKey: "advanced-ebook-export-001",
        blocks,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    ebook = saved.json<ProductDocument>();
    expect(
      ebook.version.blocks
        .filter((block) => block.type === "table")
        .map((block) => block.content),
    ).toEqual([
      "Fecha | Hora\n08:00 | 08:30",
      { rows: "Pregunta | Dato pendiente & contexto" },
    ]);
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
    const firstAnchor = `chapter-${chapters[0]!.id.replaceAll("-", "")}`;
    const secondAnchor = `chapter-${chapters[1]!.id.replaceAll("-", "")}`;
    expect(ebookHtml).toContain('class="cover ebook-cover"');
    expect(ebookHtml).toContain(`<h1>${ebook.title}</h1>`);
    expect(ebookHtml).toContain(
      `data-ebook-theme="${ebook.version.theme.template}"`,
    );
    expect(ebookHtml).toContain(`--accent:${ebook.version.theme.accentColor}`);
    expect(ebookHtml).toContain('<nav class="ebook-toc"');
    for (const [index, chapter] of chapters.entries()) {
      const anchor = `chapter-${chapter.id.replaceAll("-", "")}`;
      expect(anchor).toMatch(/^chapter-[a-z0-9]+$/);
      expect(ebookHtml).toContain(`href="#${anchor}"`);
      expect(ebookHtml).toContain(`id="${anchor}"`);
      expect(ebookHtml).toContain(`${index + 1}. ${chapter.title}`);
    }
    const firstChapterStart = ebookHtml.indexOf(
      `<section class="ebook-chapter" id="${firstAnchor}">`,
    );
    const firstChapterEnd = ebookHtml.indexOf("</section>", firstChapterStart);
    const secondChapterStart = ebookHtml.indexOf(
      `<section class="ebook-chapter" id="${secondAnchor}">`,
    );
    const secondChapterEnd = ebookHtml.indexOf("</section>", secondChapterStart);
    expect(ebookHtml.slice(firstChapterStart, firstChapterEnd)).toContain(
      "Bloque del primer capítulo.",
    );
    expect(ebookHtml.slice(secondChapterStart, secondChapterEnd)).toContain(
      "Bloque del segundo capítulo.",
    );
    expect(ebookHtml).toContain("Contenido sin capítulo A.");
    expect(ebookHtml.indexOf("Contenido sin capítulo A.")).toBeLessThan(
      ebookHtml.indexOf("Contenido sin capítulo B."),
    );
    expect(ebookHtml).toContain("Contenido adicional");
    expect(ebookHtml).toContain(
      "<tr><td>Fecha</td><td>Hora</td></tr><tr><td>08:00</td><td>08:30</td></tr>",
    );
    expect(ebookHtml).toContain(
      "<tr><td>Pregunta</td><td>Dato pendiente &amp; contexto</td></tr>",
    );
    expect(ebookHtml).toContain(
      '<a href="https://example.com/dog?first=one&amp;second=two" target="_blank" rel="noopener noreferrer">https://example.com/dog?first=one&amp;second=two</a>.',
    );
    expect(ebookHtml).toContain("https://user:pass@example.com/private");
    expect(ebookHtml).not.toContain(
      'href="https://user:pass@example.com/private"',
    );
    expect(
      ebookHtml.match(/class="page-break ebook-page-break"/g),
    ).toHaveLength(chapters.length - 1);
    expect(ebookHtml).not.toMatch(/<script\b/i);
    expect(ebookHtml).not.toMatch(/<[^>]+\son\w+\s*=/i);
    expect(ebookHtml).not.toMatch(/(?:href|src)\s*=\s*["']?javascript:/i);
    expect(await exportDocument(project, ebook, "html")).toEqual(
      Buffer.from(ebookHtml, "utf8"),
    );

    const ebookDocx = await exportDocument(project, ebook, "docx");
    const ebookDocxHtml = (
      await mammoth.convertToHtml({ buffer: ebookDocx })
    ).value;
    expect(ebookDocxHtml).toContain(ebook.title);
    expect(ebookDocxHtml).toContain(`Ebook · ${ebook.version.theme.template}`);
    expect(ebookDocxHtml).toContain("Contenido");
    expect(ebookDocxHtml).toContain(`1. ${chapters[0]!.title}`);
    expect(ebookDocxHtml).toContain(`2. ${chapters[1]!.title}`);
    expect(ebookDocxHtml).toContain("Contenido sin capítulo A.");
    expect(ebookDocxHtml).toContain("Contenido adicional");
    expect(ebookDocxHtml).toContain("<td><p>Fecha</p></td>");
    expect(ebookDocxHtml).toContain("<td><p>08:00</p></td>");
    expect(ebookDocxHtml).toContain("<td><p>Pregunta</p></td>");
    expect(ebookDocxHtml).toContain(
      "<td><p>Dato pendiente &amp; contexto</p></td>",
    );
    expect(ebookDocxHtml).toContain(
      '<a href="https://example.com/dog?first=one&amp;second=two">https://example.com/dog?first=one&amp;second=two</a>.',
    );
    expect(ebookDocxHtml).toContain("https://user:pass@example.com/private");
    expect(ebookDocxHtml).not.toContain(
      '<a href="https://user:pass@example.com/private">',
    );
    expect(
      docxDocumentXml(ebookDocx).match(/<w:br\b[^>]*w:type="page"/g),
    ).toHaveLength(chapters.length + 1);

    const ebookPdf = await exportDocument(project, ebook, "pdf");
    expect(ebookPdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(ebookPdf.length).toBeGreaterThan(100);
    const ebookPdfDocument = await extractPdf(ebookPdf, { maxPages: 100 });
    expect(ebookPdfDocument.status).toBe("READY");
    expect(ebookPdfDocument.text).toContain(ebook.title);
    expect(ebookPdfDocument.text).toContain("Contenido");
    for (const [index, chapter] of chapters.entries())
      expect(ebookPdfDocument.text).toContain(`${index + 1}. ${chapter.title}`);
    expect(ebookPdfDocument.text).toContain("Bloque del primer capítulo.");
    expect(ebookPdfDocument.text).toContain("Bloque del segundo capítulo.");

    const after = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/product-documents/${ebook.id}`,
    });
    expect(after.statusCode, after.body).toBe(200);
    expect(after.json<ProductDocument>().version).toEqual(ebookBefore);
  });

  it("preserva el perfil checklist en HTML, DOCX y PDF", async () => {
    const project = (
      await app.inject({ method: "POST", url: "/api/demo/projects" })
    ).json<{ project: Project }>().project;
    const checklist = await createExportableDocument(project, "checklist");
    const checklistHtml = (
      await exportDocument(project, checklist, "html")
    ).toString("utf8");
    expect(checklistHtml).toContain('data-export-profile="checklist"');
    expect(checklistHtml).toContain("Checklist ·");
    expect(checklistHtml).toContain("3 tareas");
    expect(checklistHtml).not.toContain("ebook-cover");
    expect(checklistHtml).not.toContain("ebook-toc");
    expect(checklistHtml).not.toContain('id="chapter-');
    const checklistDocx = await exportDocument(project, checklist, "docx");
    const checklistDocxHtml = (
      await mammoth.convertToHtml({ buffer: checklistDocx })
    ).value;
    expect(checklistDocxHtml).toContain(checklist.title);
    expect(checklistDocxHtml).toContain("Checklist ·");
    expect(checklistDocxHtml).toContain("Definir objetivo");
    expect(checklistDocxHtml).not.toContain("Contenido");
    expect(docxDocumentXml(checklistDocx)).not.toContain("chapter-");
    const checklistPdf = await extractPdf(
      await exportDocument(project, checklist, "pdf"),
      { maxPages: 100 },
    );
    expect(checklistPdf.status).toBe("READY");
    expect(checklistPdf.text).toContain(checklist.title);
    expect(checklistPdf.text.replaceAll(/\s+/g, "")).toContain("CHECKLIST·");
    expect(checklistPdf.text).toContain("Definir objetivo");
    expect(checklistPdf.text).not.toContain("Contenido");
    expect(checklistPdf.text).not.toContain("chapter-");

  });

  it("preserva la presentación de guía sin aplicar el perfil ebook", async () => {
    const project = (
      await app.inject({ method: "POST", url: "/api/demo/projects" })
    ).json<{ project: Project }>().project;
    const guide = await createExportableDocument(project, "guide");
    const guideHtml = (
      await exportDocument(project, guide, "html")
    ).toString("utf8");
    expect(guideHtml).not.toContain("data-export-profile=");
    expect(guideHtml).toContain('<span class="type">guide</span>');
    expect(guideHtml).not.toContain("ebook-cover");
    expect(guideHtml).not.toContain("ebook-toc");
    expect(guideHtml).not.toContain('id="chapter-');
    const guideDocx = await exportDocument(project, guide, "docx");
    const guideDocxHtml = (await mammoth.convertToHtml({ buffer: guideDocx }))
      .value;
    expect(guideDocxHtml).toContain(guide.title);
    expect(guideDocxHtml).toContain("Preparación");
    expect(guideDocxHtml).toContain("Contenido de exportación.");
    expect(guideDocxHtml).not.toContain("Contenido adicional");
    expect(docxDocumentXml(guideDocx)).not.toContain("chapter-");
    const guidePdf = await extractPdf(await exportDocument(project, guide, "pdf"), {
      maxPages: 100,
    });
    expect(guidePdf.status).toBe("READY");
    expect(guidePdf.text).toContain(guide.title);
    expect(guidePdf.text).toContain("Preparación");
    expect(guidePdf.text).toContain("Contenido de exportación.");
    expect(guidePdf.text).not.toContain("Contenido adicional");
    expect(guidePdf.text).not.toContain("chapter-");

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
