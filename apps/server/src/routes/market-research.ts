import {
  ApiErrorSchema,
  RunMarketResearchSchema,
  type ApiError,
  type MarketResearchRun,
  type MarketResearchStatus,
  type RunMarketResearchInput,
} from "@our-platform/shared";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { ProjectRepository } from "../repositories/project-repository.js";
import type { MarketResearchService } from "../services/market-research-service.js";

const ProjectParams = Type.Object({ id: Type.String({ format: "uuid" }) });

const missing: ApiError = { error: "not_found", message: "El proyecto no existe." };

/**
 * Minimum server surface for the real multi-source Research flow. All provider
 * calls stay server-side: the browser never receives keys, headers or raw
 * provider bodies, and budgets are enforced here rather than trusted from the UI.
 */
export function registerMarketResearchRoutes(
  app: FastifyInstance,
  projects: ProjectRepository,
  research: MarketResearchService,
): void {
  app.get<{ Params: { id: string }; Reply: MarketResearchStatus | ApiError }>(
    "/api/projects/:id/market-research/status",
    { schema: { params: ProjectParams, response: { 404: ApiErrorSchema } } },
    async (request, reply) => {
      if (!projects.get(request.params.id)) return reply.code(404).send(missing);
      return research.status();
    },
  );

  app.post<{ Params: { id: string }; Body: RunMarketResearchInput; Reply: MarketResearchRun | ApiError }>(
    "/api/projects/:id/market-research",
    { schema: { params: ProjectParams, body: RunMarketResearchSchema, response: { 404: ApiErrorSchema, 503: ApiErrorSchema } } },
    async (request, reply) => {
      if (!projects.get(request.params.id)) return reply.code(404).send(missing);
      try {
        return await research.run(request.params.id, {
          topic: request.body.topic,
          ...(request.body.providers === undefined ? {} : { providers: request.body.providers }),
        });
      } catch (error) {
        request.log.error({ err: error instanceof Error ? error.name : "unknown" }, "market research run failed");
        return reply.code(503).send({
          error: "market_research_failed",
          message: "La investigación de mercado no se completó. Revisa la configuración de proveedores e inténtalo de nuevo.",
        });
      }
    },
  );
}
