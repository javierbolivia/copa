import { Type, type Static } from "@sinclair/typebox";

export const HealthSchema = Type.Object({
  status: Type.Union([Type.Literal("ok"), Type.Literal("degraded")]),
  version: Type.String(),
  sqlite: Type.Object({
    status: Type.Union([Type.Literal("ok"), Type.Literal("error")]),
    implementation: Type.Literal("node:sqlite"),
    schemaVersion: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  }),
});

export type Health = Static<typeof HealthSchema>;
