import { ApiErrorSchema, GeneratedFileSchema, type ApiError, type GeneratedFile } from "@our-platform/shared";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";

import type { ProjectRepository } from "../repositories/project-repository.js";
import type { FileExporterService } from "../services/file-exporter-service.js";

const ProjectParams = Type.Object({ id: Type.String({ format: "uuid" }) });
const FileParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  fileId: Type.String({ format: "uuid" }),
});
const FileListSchema = Type.Object({ files: Type.Array(GeneratedFileSchema) });

export function registerFileRoutes(
  app: FastifyInstance,
  projects: ProjectRepository,
  files: FileExporterService,
): void {
  app.get<{ Params: { id: string }; Reply: { files: GeneratedFile[] } | ApiError }>(
    "/api/projects/:id/files",
    { schema: { params: ProjectParams, response: { 200: FileListSchema, 404: ApiErrorSchema } } },
    async (request, reply) => projects.get(request.params.id)
      ? { files: files.list(request.params.id) }
      : reply.code(404).send({ error: "not_found", message: "El proyecto no existe." }),
  );

  app.get<{ Params: { id: string; fileId: string } }>(
    "/api/projects/:id/files/:fileId/download",
    { schema: { params: FileParams } },
    async (request, reply) => {
      const file = files.resolveDownload(request.params.id, request.params.fileId);
      if (!file) return reply.code(404).send({ error: "not_found", message: "El archivo no existe." });
      reply.header("content-disposition", `attachment; filename="${file.filename.replaceAll('"', '')}"`);
      return reply.send(createReadStream(file.path));
    },
  );
}
