import { ModuleResultSchema, ProjectSchema, type ModuleResult, type Project } from "@our-platform/shared";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import { MODULES } from "../domain/module-registry.js";
import type { ProjectRepository } from "../repositories/project-repository.js";
import type { SourceRepository } from "../repositories/source-repository.js";
import type { ModuleService } from "../services/module-service.js";

const DemoResultSchema = Type.Object({
  project: ProjectSchema,
  results: Type.Array(ModuleResultSchema),
});

export function registerDemoRoutes(
  app: FastifyInstance,
  projects: ProjectRepository,
  sources: SourceRepository,
  modules: ModuleService,
): void {
  app.post<{ Reply: { project: Project; results: ModuleResult[] } }>(
    "/api/demo/projects",
    { schema: { response: { 201: DemoResultSchema } } },
    async (_request, reply) => {
      const suffix = new Date().toISOString().slice(0, 16).replace("T", " ");
      const project = projects.create({
        name: `DEMO · Organización de fotografías · ${suffix}`,
        niche: "Organización de fotografías digitales",
        description: "Proyecto DEMO local, sintético y reproducible. No usa claves ni servicios externos.",
      });

      const results: ModuleResult[] = [];
      results.push(await modules.run(project.id, "research", "mock"));
      sources.createDemo(project.id, "Comentarios DEMO · organización de fotografías");
      for (const definition of MODULES) {
        if (definition.key === "research") continue;
        results.push(await modules.run(project.id, definition.key, "mock"));
      }
      return reply.code(201).send({ project: projects.get(project.id)!, results });
    },
  );
}
