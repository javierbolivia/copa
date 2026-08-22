import { Type, type Static } from "@sinclair/typebox";

import { LearnedMemoryKindSchema } from "./learning-memory.js";

export const InternalSkillStatusSchema = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("DEPRECATED"),
]);

export const InternalSkillDefinitionSchema = Type.Object({
  id: Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 80 }),
  version: Type.Integer({ minimum: 1 }),
  kind: Type.String({ minLength: 1, maxLength: 80 }),
  scope: Type.Union([Type.Literal("PROJECT"), Type.Literal("DOMAIN"), Type.Literal("GLOBAL")]),
  description: Type.String({ minLength: 1, maxLength: 1000 }),
  inputContract: Type.Object({
    schemaVersion: Type.Integer({ minimum: 1 }),
    requiredContext: Type.Array(Type.Union([
      Type.Literal("projectId"),
      Type.Literal("domain"),
      Type.Literal("query"),
    ]), { uniqueItems: true }),
  }, { additionalProperties: false }),
  memoryPolicy: Type.Object({
    requiredKinds: Type.Array(LearnedMemoryKindSchema, { uniqueItems: true }),
    optionalKinds: Type.Array(LearnedMemoryKindSchema, { uniqueItems: true }),
    scopePolicy: Type.Union([
      Type.Literal("PROJECT_ONLY"),
      Type.Literal("PROJECT_AND_DOMAIN"),
      Type.Literal("PROJECT_DOMAIN_GLOBAL"),
    ]),
    retrievalLimit: Type.Integer({ minimum: 0, maximum: 20 }),
  }, { additionalProperties: false }),
  executionPolicy: Type.Object({
    mode: Type.Literal("DETERMINISTIC"),
    steps: Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 20 }),
  }, { additionalProperties: false }),
  budgetPolicy: Type.Object({
    maxMemoryItems: Type.Integer({ minimum: 0, maximum: 20 }),
    maxEvidenceItems: Type.Integer({ minimum: 0, maximum: 200 }),
    maxContextTokens: Type.Integer({ minimum: 0, maximum: 20000 }),
    externalCalls: Type.Literal(0),
  }, { additionalProperties: false }),
  evidencePolicy: Type.Object({
    preserveOriginalEvidence: Type.Literal(true),
    provenanceRequired: Type.Literal(true),
    destructiveFiltering: Type.Literal("FORBIDDEN"),
  }, { additionalProperties: false }),
  outputContract: Type.Object({
    schemaVersion: Type.Integer({ minimum: 1 }),
    type: Type.String({ minLength: 1, maxLength: 120 }),
  }, { additionalProperties: false }),
  acceptancePolicy: Type.Object({
    auditable: Type.Literal(true),
    rejectedMemoryAllowed: Type.Literal(false),
    externalCallsAllowed: Type.Literal(false),
  }, { additionalProperties: false }),
  status: InternalSkillStatusSchema,
}, { additionalProperties: false });

export type InternalSkillStatus = Static<typeof InternalSkillStatusSchema>;
export type InternalSkillDefinition = Static<typeof InternalSkillDefinitionSchema>;
