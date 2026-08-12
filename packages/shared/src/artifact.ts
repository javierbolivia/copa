import { Type, type Static } from "@sinclair/typebox";

export const ArtifactVersionStatusSchema = Type.Union([
  Type.Literal("draft"), Type.Literal("approved"),
  Type.Literal("superseded"), Type.Literal("archived"),
]);
export const ArtifactFreshnessSchema = Type.Union([Type.Literal("fresh"), Type.Literal("stale")]);

export const ArtifactVersionSchema = Type.Object({
  id: Type.String({ format: "uuid" }), projectId: Type.String({ format: "uuid" }),
  artifactId: Type.String({ format: "uuid" }), artifactType: Type.String(),
  versionNumber: Type.Integer({ minimum: 1 }), status: ArtifactVersionStatusSchema,
  freshness: ArtifactFreshnessSchema, createdAt: Type.String({ format: "date-time" }),
  inputSnapshot: Type.Unknown(), outputData: Type.Unknown(),
  supersedesVersionId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  staleReason: Type.Union([Type.String(), Type.Null()]),
});
export const ArtifactVersionListSchema = Type.Object({ versions: Type.Array(ArtifactVersionSchema) });
export type ArtifactVersion = Static<typeof ArtifactVersionSchema>;
