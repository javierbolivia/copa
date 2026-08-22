import {
  ApiErrorSchema,
  CreateProjectSchema,
  ProjectListSchema,
  ProjectSchema,
  UpdateProjectSchema,
  type ApiError,
  type CreateProjectInput,
  type Project,
  type ProjectList,
  type UpdateProjectInput,
} from "@our-platform/shared";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { ProjectRepository } from "../repositories/project-repository.js";

const ProjectParamsSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
});

const ProjectListQuerySchema = Type.Object({
  includeArchived: Type.Optional(Type.Boolean()),
});

interface ProjectParams {
  id: string;
}

interface ProjectListQuery {
  includeArchived?: boolean;
}

export function registerProjectRoutes(
  app: FastifyInstance,
  repository: ProjectRepository,
): void {
  app.get<{ Querystring: ProjectListQuery; Reply: ProjectList }>(
    "/api/projects",
    {
      schema: {
        querystring: ProjectListQuerySchema,
        response: { 200: ProjectListSchema },
      },
    },
    async (request) => ({
      projects: repository.list(request.query.includeArchived ?? false),
    }),
  );

  app.post<{ Body: CreateProjectInput; Reply: Project }>(
    "/api/projects",
    {
      schema: {
        body: CreateProjectSchema,
        response: { 201: ProjectSchema },
      },
    },
    async (request, reply) => {
      const project = repository.create(request.body);
      return reply.code(201).send(project);
    },
  );

  app.get<{ Params: ProjectParams; Reply: Project | ApiError }>(
    "/api/projects/:id",
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: ProjectSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const project = repository.get(request.params.id);
      if (project === undefined) {
        return reply.code(404).send({
          error: "not_found",
          message: "El proyecto no existe.",
        });
      }
      return project;
    },
  );

  app.patch<{
    Params: ProjectParams;
    Body: UpdateProjectInput;
    Reply: Project | ApiError;
  }>(
    "/api/projects/:id",
    {
      schema: {
        params: ProjectParamsSchema,
        body: UpdateProjectSchema,
        response: { 200: ProjectSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const project = repository.update(request.params.id, request.body);
      if (project === undefined) {
        return reply.code(404).send({
          error: "not_found",
          message: "El proyecto no existe.",
        });
      }
      return project;
    },
  );

  app.delete<{ Params: ProjectParams; Reply: Project | ApiError }>(
    "/api/projects/:id",
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: ProjectSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const project = repository.archive(request.params.id);
      if (project === undefined) {
        return reply.code(404).send({
          error: "not_found",
          message: "El proyecto no existe.",
        });
      }
      return project;
    },
  );

  app.post<{ Params: ProjectParams; Reply: Project | ApiError }>(
    "/api/projects/:id/restore",
    { schema:{params:ProjectParamsSchema,response:{200:ProjectSchema,404:ApiErrorSchema}} },
    async(request,reply)=>repository.restore(request.params.id) ?? reply.code(404).send({error:"not_found",message:"El proyecto no existe."}),
  );

  app.delete<{Params:ProjectParams;Reply:{deleted:true}|ApiError}>(
    "/api/projects/:id/permanent",
    {schema:{params:ProjectParamsSchema}},
    async(request,reply)=>{
      const project=repository.get(request.params.id);
      if(!project)return reply.code(404).send({error:"not_found",message:"El proyecto no existe."});
      if(project.status!=="archived")return reply.code(409).send({error:"project_not_archived",message:"Sólo se pueden eliminar definitivamente proyectos archivados."});
      try{return repository.deletePermanently(request.params.id)
        ? {deleted:true as const}
        : reply.code(404).send({error:"not_found",message:"El proyecto ya no existe."});
      }catch(error){request.log.error({err:error,projectId:request.params.id},"permanent project deletion failed");return reply.code(500).send({error:"delete_failed",message:"No se pudo eliminar definitivamente el proyecto y sus datos asociados."});}
    },
  );
}
