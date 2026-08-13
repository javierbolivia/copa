import { ApiErrorSchema, type ApiError } from "@our-platform/shared";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { TraceabilityGraph, TraceabilityService } from "../services/traceability-service.js";

const ParamsSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  versionId: Type.String({ format: "uuid" }),
});

const NodeSchema = Type.Object({
  id: Type.String(),
  kind: Type.Union([Type.Literal("artifact"), Type.Literal("evidence"), Type.Literal("source"), Type.Literal("knowledge"), Type.Literal("memory")]),
  label: Type.String(),
  subtitle: Type.Union([Type.String(), Type.Null()]),
  artifactType: Type.Union([Type.String(), Type.Null()]),
  versionNumber: Type.Union([Type.Integer(), Type.Null()]),
  status: Type.Union([Type.String(), Type.Null()]),
  freshness: Type.Union([Type.String(), Type.Null()]),
  provenance: Type.Union([Type.String(), Type.Null()]),
});
const GraphSchema = Type.Object({
  rootId: Type.String(),
  nodes: Type.Array(NodeSchema),
  edges: Type.Array(Type.Object({ from: Type.String(), to: Type.String(), relation: Type.String() })),
  evidenceCount: Type.Integer({ minimum: 0 }),
  sourceCount: Type.Integer({ minimum: 0 }),
  knowledgeCount: Type.Integer({ minimum: 0 }),
  memoryCount: Type.Integer({ minimum: 0 }),
});

interface Params { id: string; versionId: string }

export function registerTraceabilityRoutes(app: FastifyInstance, traceability: TraceabilityService): void {
  app.get<{ Params: Params; Reply: TraceabilityGraph | ApiError }>(
    "/api/projects/:id/versions/:versionId/traceability",
    { schema: { params: ParamsSchema, response: { 200: GraphSchema, 404: ApiErrorSchema } } },
    async (request, reply) => traceability.get(request.params.id, request.params.versionId)
      ?? reply.code(404).send({ error: "not_found", message: "La versión no existe en este proyecto." }),
  );
}
