import {
  ApiErrorSchema,
  ModuleKeySchema,
  ModuleResultListSchema,
  ModuleResultSchema,
  RunModuleSchema,
  type ApiError,
  type ModuleKey,
  type ModuleResult,
  type RunModuleInput,
} from "@our-platform/shared";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { ProjectRepository } from "../repositories/project-repository.js";
import type { ModuleService } from "../services/module-service.js";

const ParamsSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  key: ModuleKeySchema,
});

interface Params { id: string; key: ModuleKey }

export function registerModuleRoutes(
  app: FastifyInstance,
  projects: ProjectRepository,
  modules: ModuleService,
): void {
  app.get<{ Params: Params; Reply: { results: ModuleResult[] } | ApiError }>(
    "/api/projects/:id/modules/:key",
    { schema: { params: ParamsSchema, response: { 200: ModuleResultListSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      if (!projects.get(request.params.id)) {
        return reply.code(404).send({ error: "not_found", message: "El proyecto no existe." });
      }
      return { results: modules.history(request.params.id, request.params.key) };
    },
  );

  app.post<{ Params: Params; Body: RunModuleInput; Reply: ModuleResult | ApiError }>(
    "/api/projects/:id/modules/:key/run",
    {
      schema: {
        params: ParamsSchema,
        body: RunModuleSchema,
        response: { 200: ModuleResultSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      if (!projects.get(request.params.id)) {
        return reply.code(404).send({ error: "not_found", message: "El proyecto no existe." });
      }
      try {
        return modules.run(request.params.id, request.params.key, request.body.provider ?? "mock",request.body.instructions);
      } catch (error) {
        return reply.code(409).send({
          error: "module_blocked",
          message: error instanceof Error ? error.message : "No se pudo ejecutar el módulo.",
        });
      }
    },
  );
}
