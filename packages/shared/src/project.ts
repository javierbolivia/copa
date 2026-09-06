import { Type, type Static } from "@sinclair/typebox";

export const ProjectStatusSchema = Type.Union([
  Type.Literal("active"),
  Type.Literal("archived"),
]);

export const ProjectSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.String({ minLength: 1, maxLength: 120 }),
  niche: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Union([Type.String({ maxLength: 2_000 }), Type.Null()]),
  status: ProjectStatusSchema,
  language: Type.String({ minLength: 2, maxLength: 16 }),
  region: Type.Union([Type.String({ maxLength: 80 }), Type.Null()]),
  currency: Type.String({ minLength: 3, maxLength: 3 }),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
  archivedAt: Type.Union([
    Type.String({ format: "date-time" }),
    Type.Null(),
  ]),
  workflowStage: Type.String(),
  workflowCompletedSteps: Type.Integer({ minimum: 0 }),
  workflowTotalSteps: Type.Integer({ minimum: 1 }),
});

export const CreateProjectSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    niche: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.Optional(
      Type.Union([Type.String({ maxLength: 2_000 }), Type.Null()]),
    ),
  },
  { additionalProperties: false },
);

export const UpdateProjectSchema = Type.Partial(
  Type.Object(
    {
      name: Type.String({ minLength: 1, maxLength: 120 }),
      niche: Type.String({ minLength: 1, maxLength: 200 }),
      description: Type.Union([
        Type.String({ maxLength: 2_000 }),
        Type.Null(),
      ]),
    },
    { additionalProperties: false },
  ),
  { minProperties: 1, additionalProperties: false },
);

export const ProjectListSchema = Type.Object({
  projects: Type.Array(ProjectSchema),
});

export const ProjectSettingsSchema = Type.Object({
  projectId: Type.String({ format: "uuid" }),
  language: Type.String({ minLength: 2, maxLength: 16 }),
  targetMarket: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
  currency: Type.String({ minLength: 3, maxLength: 3 }),
  generalNotes: Type.Union([Type.String({ maxLength: 5000 }), Type.Null()]),
  preferredLlmProvider: Type.Union([Type.String({ maxLength: 80 }), Type.Null()]),
  economyModel: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
  powerfulModel: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
  // A single type union prevents coercion of null to 0 in an anyOf number branch.
  maxBudget: Type.Unsafe<number | null>({ type: ["number", "null"], minimum: 0 }),
  contentLanguage: Type.String({ minLength: 2, maxLength: 16 }),
  knowledgeEnabled: Type.Boolean(),
  updatedAt: Type.String({ format: "date-time" }),
});

export const UpdateProjectSettingsSchema = Type.Intersect([
  Type.Omit(ProjectSettingsSchema, ["projectId", "updatedAt", "knowledgeEnabled"]),
  Type.Object({ knowledgeEnabled: Type.Optional(Type.Boolean()) }),
]);

export const PermanentDeleteSchema = Type.Object({
  /** @deprecated Kept optional so older clients may continue sending it. */
  confirmProjectName: Type.Optional(Type.String()),
});

export type ProjectStatus = Static<typeof ProjectStatusSchema>;
export type Project = Static<typeof ProjectSchema>;
export type CreateProjectInput = Static<typeof CreateProjectSchema>;
export type UpdateProjectInput = Static<typeof UpdateProjectSchema>;
export type ProjectList = Static<typeof ProjectListSchema>;
export type ProjectSettings = Static<typeof ProjectSettingsSchema>;
export type UpdateProjectSettingsInput = Static<typeof UpdateProjectSettingsSchema>;
export type PermanentDeleteInput = Static<typeof PermanentDeleteSchema>;
