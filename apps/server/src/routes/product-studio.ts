import {
  ApiErrorSchema,
  CreateProductDocumentSchema,
  ProductAutosaveSchema,
  ProductDocumentSchema,
  ProductDocumentVersionSchema,
  ProductOutlineOperationSchema,
  type ApiError,
  type CreateProductDocumentInput,
  type ProductAutosaveInput,
  type ProductDocument,
  type ProductOutlineOperation,
} from "@our-platform/shared";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { ProjectRepository } from "../repositories/project-repository.js";
import {
  ProductStudioConflictError,
  type ProductStudioService,
} from "../services/product-studio-service.js";

const ProjectParams = Type.Object({ id: Type.String({ format: "uuid" }) });
const DocumentParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  documentId: Type.String({ format: "uuid" }),
});
const ChapterParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  documentId: Type.String({ format: "uuid" }),
  chapterId: Type.String({ format: "uuid" }),
});
const JobParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  jobId: Type.String({ format: "uuid" }),
});
const Empty = Type.Object({}, { additionalProperties: false });

export function registerProductStudioRoutes(
  app: FastifyInstance,
  projects: ProjectRepository,
  studio: ProductStudioService,
): void {
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/product-documents",
    { schema: { params: ProjectParams } },
    async (request, reply) => {
      if (!projects.get(request.params.id))
        return reply
          .code(404)
          .send(error("not_found", "El proyecto no existe."));
      return { documents: studio.list(request.params.id) };
    },
  );
  app.post<{
    Params: { id: string };
    Body: CreateProductDocumentInput;
    Reply: ProductDocument | ApiError;
  }>(
    "/api/projects/:id/product-documents",
    {
      schema: {
        params: ProjectParams,
        body: CreateProductDocumentSchema,
        response: {
          201: ProductDocumentSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      if (!projects.get(request.params.id))
        return reply
          .code(404)
          .send(error("not_found", "El proyecto no existe."));
      try {
        return reply
          .code(201)
          .send(studio.create(request.params.id, request.body));
      } catch (cause) {
        return reply
          .code(409)
          .send(fromError("product_document_blocked", cause));
      }
    },
  );
  app.get<{
    Params: { id: string; documentId: string };
    Reply: ProductDocument | ApiError;
  }>(
    "/api/projects/:id/product-documents/:documentId",
    {
      schema: {
        params: DocumentParams,
        response: { 200: ProductDocumentSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) =>
      studio.get(request.params.id, request.params.documentId) ??
      reply.code(404).send(error("not_found", "El documento no existe.")),
  );
  app.delete<{ Params: { id: string; documentId: string } }>(
    "/api/projects/:id/product-documents/:documentId",
    { schema: { params: DocumentParams } },
    async (request, reply) =>
      handle(reply, () =>
        studio.delete(request.params.id, request.params.documentId)
          ? { deleted: true }
          : reply.code(404).send(error("not_found", "El documento no existe.")),
      ),
  );
  app.get<{ Params: { id: string; documentId: string } }>(
    "/api/projects/:id/product-documents/:documentId/versions",
    { schema: { params: DocumentParams } },
    async (request, reply) =>
      studio.get(request.params.id, request.params.documentId)
        ? {
            versions: studio.history(
              request.params.id,
              request.params.documentId,
            ),
          }
        : reply.code(404).send(error("not_found", "El documento no existe.")),
  );
  app.get<{ Params: { id: string; documentId: string } }>(
    "/api/projects/:id/product-documents/:documentId/generation-estimate",
    { schema: { params: DocumentParams } },
    async (request, reply) =>
      studio.get(request.params.id, request.params.documentId)
        ? studio.estimate(request.params.id, request.params.documentId)
        : reply.code(404).send(error("not_found", "El documento no existe.")),
  );

  app.post<{
    Params: { id: string; documentId: string };
    Body: Record<string, never>;
  }>(
    "/api/projects/:id/product-documents/:documentId/outline/generate",
    { schema: { params: DocumentParams, body: Empty } },
    async (request, reply) =>
      handle(reply, () =>
        studio.generateOutline(request.params.id, request.params.documentId),
      ),
  );
  app.patch<{
    Params: { id: string; documentId: string };
    Body: ProductOutlineOperation;
  }>(
    "/api/projects/:id/product-documents/:documentId/outline",
    { schema: { params: DocumentParams, body: ProductOutlineOperationSchema } },
    async (request, reply) =>
      handle(reply, () =>
        studio.editOutline(
          request.params.id,
          request.params.documentId,
          request.body,
        ),
      ),
  );
  app.post<{
    Params: { id: string; documentId: string };
    Body: Record<string, never>;
  }>(
    "/api/projects/:id/product-documents/:documentId/outline/approve",
    { schema: { params: DocumentParams, body: Empty } },
    async (request, reply) =>
      handle(reply, () =>
        studio.approveOutline(request.params.id, request.params.documentId),
      ),
  );
  app.put<{
    Params: { id: string; documentId: string };
    Body: ProductAutosaveInput;
  }>(
    "/api/projects/:id/product-documents/:documentId/autosave",
    { schema: { params: DocumentParams, body: ProductAutosaveSchema } },
    async (request, reply) =>
      handle(reply, () =>
        studio.autosave(
          request.params.id,
          request.params.documentId,
          request.body,
        ),
      ),
  );

  app.post<{
    Params: { id: string; documentId: string; chapterId: string };
    Body: Record<string, never>;
  }>(
    "/api/projects/:id/product-documents/:documentId/chapters/:chapterId/generate",
    { schema: { params: ChapterParams, body: Empty } },
    async (request, reply) =>
      handle(reply, () =>
        studio.generateChapter(
          request.params.id,
          request.params.documentId,
          request.params.chapterId,
        ),
      ),
  );
  app.post<{
    Params: { id: string; documentId: string; chapterId: string };
    Body: Record<string, never>;
  }>(
    "/api/projects/:id/product-documents/:documentId/chapters/:chapterId/approve",
    { schema: { params: ChapterParams, body: Empty } },
    async (request, reply) =>
      handle(reply, () =>
        studio.approveChapter(
          request.params.id,
          request.params.documentId,
          request.params.chapterId,
        ),
      ),
  );
  app.post<{
    Params: { id: string; documentId: string };
    Body: Record<string, never>;
  }>(
    "/api/projects/:id/product-documents/:documentId/chapters/generate-pending",
    { schema: { params: DocumentParams, body: Empty } },
    async (request, reply) =>
      handle(reply, () =>
        studio.generatePending(request.params.id, request.params.documentId),
      ),
  );
  app.post<{
    Params: { id: string; jobId: string };
    Body: Record<string, never>;
  }>(
    "/api/projects/:id/product-document-jobs/:jobId/resume",
    { schema: { params: JobParams, body: Empty } },
    async (request, reply) =>
      handle(reply, () =>
        studio.resumeBatch(request.params.id, request.params.jobId),
      ),
  );
  app.post<{
    Params: { id: string; documentId: string };
    Body: Record<string, never>;
  }>(
    "/api/projects/:id/product-documents/:documentId/approve",
    { schema: { params: DocumentParams, body: Empty } },
    async (request, reply) =>
      handle(reply, () =>
        studio.approveDocument(request.params.id, request.params.documentId),
      ),
  );
}

async function handle<T>(
  reply: any,
  fn: () => T | Promise<T>,
): Promise<T | unknown> {
  try {
    return await fn();
  } catch (cause) {
    const conflict = cause instanceof ProductStudioConflictError;
    return reply
      .code(conflict ? 409 : 422)
      .send(
        fromError(
          conflict ? "version_conflict" : "product_studio_error",
          cause,
        ),
      );
  }
}
function error(code: string, message: string): ApiError {
  return { error: code, message };
}
function fromError(code: string, cause: unknown): ApiError {
  return error(
    code,
    cause instanceof Error
      ? cause.message
      : "No se pudo completar la operación.",
  );
}
