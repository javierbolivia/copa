import { Type, type Static } from "@sinclair/typebox";

export const ApiErrorSchema = Type.Object({
  error: Type.String(),
  message: Type.String(),
});

export type ApiError = Static<typeof ApiErrorSchema>;
