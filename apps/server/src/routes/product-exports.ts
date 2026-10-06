import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import type { ProductExportService } from "../services/product-export-service.js";
import type { LandingImageService } from "../services/landing-image-service.js";
import type { ProjectRepository } from "../repositories/project-repository.js";

const Project = Type.Object({ id: Type.String({ format: "uuid" }) }),
  Document = Type.Object({
    id: Type.String({ format: "uuid" }),
    documentId: Type.String({ format: "uuid" }),
  }),
  Asset = Type.Object({
    id: Type.String({ format: "uuid" }),
    assetId: Type.String({ format: "uuid" }),
  });
const ImageBody = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 160 }),
    filename: Type.String({ minLength: 1, maxLength: 260 }),
    mimeType: Type.String({ minLength: 3, maxLength: 100 }),
    contentBase64: Type.String({ minLength: 1, maxLength: 18_000_000 }),
  },
  { additionalProperties: false },
);
const GenerateLandingImageBody = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 160 }),
  prompt: Type.String({ minLength: 12, maxLength: 1200 }),
  aspectRatio: Type.Union([Type.Literal("16:9"), Type.Literal("4:3"), Type.Literal("1:1")]),
}, { additionalProperties: false });
const DiagramBody = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 160 }),
    diagramType: Type.Union([
      Type.Literal("flowchart"),
      Type.Literal("timeline"),
      Type.Literal("mindmap"),
      Type.Literal("process"),
    ]),
    description: Type.String({ minLength: 1, maxLength: 4000 }),
    advancedSource: Type.Optional(Type.String({ maxLength: 8000 })),
  },
  { additionalProperties: false },
);
const ExportBody = Type.Object(
  {
    format: Type.Union([
      Type.Literal("html"),
      Type.Literal("docx"),
      Type.Literal("pdf"),
    ]),
  },
  { additionalProperties: false },
);

export function registerProductExportRoutes(
  app: FastifyInstance,
  projects: ProjectRepository,
  service: ProductExportService,
  landingImages: LandingImageService,
): void {
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/product-assets",
    { schema: { params: Project } },
    async (request, reply) => {
      if (!projects.get(request.params.id)) return reply.code(404).send({ error: "not_found", message: "El proyecto no existe." });
      return { assets: service.listAssets(request.params.id) };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/product-assets/image-generation",
    { schema: { params: Project } },
    async (request, reply) => {
      if (!projects.get(request.params.id)) return reply.code(404).send({ error: "not_found", message: "El proyecto no existe." });
      return { configured: landingImages.configured, model: landingImages.model, paidModel: true };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { title: string; prompt: string; aspectRatio: "16:9" | "4:3" | "1:1" };
  }>(
    "/api/projects/:id/product-assets/image-generation",
    { schema: { params: Project, body: GenerateLandingImageBody } },
    async (request, reply) => {
      if (!projects.get(request.params.id)) return reply.code(404).send({ error: "not_found", message: "El proyecto no existe." });
      if (!landingImages.configured) return reply.code(503).send({ error: "image_provider_unavailable", message: "Gemini no está configurado para generar imágenes." });
      try {
        const generated = await landingImages.generate(request.body.prompt, request.body.aspectRatio);
        const extension = generated.mimeType === "image/jpeg" ? "jpg" : generated.mimeType.split("/")[1];
        const asset = await service.addImage(request.params.id, {
          title: request.body.title,
          filename: `landing-generated.${extension}`,
          mimeType: generated.mimeType,
          contentBase64: generated.contentBase64,
        });
        return reply.code(201).send(asset);
      } catch (error) {
        return reply.code(422).send({ error: "image_generation_failed", message: message(error) });
      }
    },
  );
  app.post<{
    Params: { id: string };
    Body: {
      title: string;
      filename: string;
      mimeType: string;
      contentBase64: string;
    };
  }>(
    "/api/projects/:id/product-assets",
    { schema: { params: Project, body: ImageBody } },
    async (request, reply) => {
      if (!projects.get(request.params.id)) return reply.code(404).send({ error: "not_found", message: "El proyecto no existe." });
      try {
        return reply
          .code(201)
          .send(await service.addImage(request.params.id, request.body));
      } catch (error) {
        return reply
          .code(422)
          .send({ error: "invalid_asset", message: message(error) });
      }
    },
  );
  app.post<{
    Params: { id: string };
    Body: {
      title: string;
      diagramType: "flowchart" | "timeline" | "mindmap" | "process";
      description: string;
      advancedSource?: string;
    };
  }>(
    "/api/projects/:id/product-assets/diagrams",
    { schema: { params: Project, body: DiagramBody } },
    async (request, reply) => {
      if (!projects.get(request.params.id)) return reply.code(404).send({ error: "not_found", message: "El proyecto no existe." });
      try {
        return reply
          .code(201)
          .send(await service.addDiagram(request.params.id, request.body));
      } catch (error) {
        return reply
          .code(422)
          .send({ error: "invalid_diagram", message: message(error) });
      }
    },
  );
  app.get<{ Params: { id: string; assetId: string } }>(
    "/api/projects/:id/product-assets/:assetId/content",
    { schema: { params: Asset } },
    async (request, reply) => {
      const asset = service.resolveAsset(
        request.params.id,
        request.params.assetId,
      );
      if (!asset)
        return reply
          .code(404)
          .send({ error: "not_found", message: "El asset no existe." });
      reply.type(asset.mimeType);
      reply.header(
        "content-security-policy",
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      );
      return reply.send(createReadStream(asset.path));
    },
  );
  app.post<{ Params: { id: string; documentId: string } }>(
    "/api/projects/:id/product-documents/:documentId/validate",
    { schema: { params: Document } },
    async (request, reply) => {
      try {
        return service.validate(request.params.id, request.params.documentId);
      } catch (error) {
        return reply
          .code(404)
          .send({ error: "not_found", message: message(error) });
      }
    },
  );
  app.get<{ Params: { id: string; documentId: string } }>(
    "/api/projects/:id/product-documents/:documentId/exports",
    { schema: { params: Document } },
    async (request) => ({
      exports: service.listExports(
        request.params.id,
        request.params.documentId,
      ),
    }),
  );
  app.post<{
    Params: { id: string; documentId: string };
    Body: { format: "html" | "docx" | "pdf" };
  }>(
    "/api/projects/:id/product-documents/:documentId/exports",
    { schema: { params: Document, body: ExportBody } },
    async (request, reply) => {
      try {
        return reply
          .code(201)
          .send(
            await service.export(
              request.params.id,
              request.params.documentId,
              request.body.format,
            ),
          );
      } catch (error) {
        return reply
          .code(422)
          .send({ error: "product_export_failed", message: message(error) });
      }
    },
  );
}
function message(value: unknown) {
  return value instanceof Error ? value.message : "Error inesperado.";
}
