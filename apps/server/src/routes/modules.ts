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
const VersionParamsSchema=Type.Object({id:Type.String({format:"uuid"}),key:ModuleKeySchema,versionId:Type.String({format:"uuid"})});
const EditModuleSchema=Type.Object({outputData:Type.Unknown(),expectedBaseVersionId:Type.Optional(Type.String({format:"uuid"})),sourceVersionId:Type.Optional(Type.String({format:"uuid"}))},{additionalProperties:false});

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
        return await modules.run(request.params.id, request.params.key, request.body.provider,request.body.instructions);
      } catch (error) {
        return reply.code(409).send({
          error: "module_blocked",
          message: error instanceof Error ? error.message : "No se pudo ejecutar el módulo.",
        });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/providers/status",
    { schema: { params: Type.Object({ id: Type.String({ format: "uuid" }) }) } },
    async (request, reply) => {
      if (!projects.get(request.params.id)) {
        return reply.code(404).send({ error: "not_found", message: "El proyecto no existe." });
      }
      return modules.providerStatus(request.params.id);
    },
  );

  app.post<{Params:Params;Body:{outputData:unknown;expectedBaseVersionId?:string;sourceVersionId?:string};Reply:ModuleResult|ApiError}>(
    "/api/projects/:id/modules/:key/drafts",
    {schema:{params:ParamsSchema,body:EditModuleSchema,response:{201:ModuleResultSchema,404:ApiErrorSchema,409:ApiErrorSchema}}},
    async(request,reply)=>{
      if(!projects.get(request.params.id))return reply.code(404).send({error:"not_found",message:"El proyecto no existe."});
      try{return reply.code(201).send(modules.saveDraft(request.params.id,request.params.key,request.body.outputData,request.body.expectedBaseVersionId,request.body.sourceVersionId));}
      catch(error){return reply.code(409).send({error:"edit_blocked",message:error instanceof Error?error.message:"No se pudo guardar el borrador."});}
    },
  );

  app.post<{Params:{id:string;key:ModuleKey;versionId:string};Reply:ModuleResult|ApiError}>(
    "/api/projects/:id/modules/:key/versions/:versionId/approve",
    {schema:{params:VersionParamsSchema,response:{200:ModuleResultSchema,404:ApiErrorSchema,409:ApiErrorSchema}}},
    async(request,reply)=>{
      try{return modules.approve(request.params.id,request.params.key,request.params.versionId)
        ?? reply.code(404).send({error:"not_found",message:"La versión no existe en este módulo."});}
      catch(error){return reply.code(409).send({error:"approval_blocked",message:error instanceof Error?error.message:"No se pudo aprobar la versión."});}
    },
  );
}
