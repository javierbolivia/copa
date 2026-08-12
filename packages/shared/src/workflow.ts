import { Type, type Static } from "@sinclair/typebox";

export const WorkflowStateSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("READY"),
  Type.Literal("IN_PROGRESS"),
  Type.Literal("COMPLETED"),
  Type.Literal("STALE"),
  Type.Literal("BLOCKED"),
]);

export const WorkflowStepSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  projectId: Type.String({ format: "uuid" }),
  stepKey: Type.String(),
  label: Type.String(),
  position: Type.Integer({ minimum: 1 }),
  state: WorkflowStateSchema,
  staleReason: Type.Union([Type.String(), Type.Null()]),
  updatedAt: Type.String({ format: "date-time" }),
});

export const WorkflowSchema = Type.Object({
  steps: Type.Array(WorkflowStepSchema),
});

export const UpdateWorkflowStepSchema = Type.Object({ state: WorkflowStateSchema });

export type WorkflowState = Static<typeof WorkflowStateSchema>;
export type WorkflowStep = Static<typeof WorkflowStepSchema>;
export type Workflow = Static<typeof WorkflowSchema>;
export type UpdateWorkflowStepInput = Static<typeof UpdateWorkflowStepSchema>;
