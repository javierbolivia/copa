import { Type, type Static } from "@sinclair/typebox";

const RequiredTextSchema = Type.String({ minLength: 1, maxLength: 4_000 });
const TextListSchema = Type.Array(Type.String({ minLength: 1, maxLength: 1_000 }), { maxItems: 100 });

export const ProductProposalSchema = Type.Object({
  id: RequiredTextSchema,
  name: RequiredTextSchema,
  concept: RequiredTextSchema,
  problem: RequiredTextSchema,
  outcome: RequiredTextSchema,
  promise: RequiredTextSchema,
  format: RequiredTextSchema,
  deliverables: Type.Array(Type.String({ minLength: 1, maxLength: 1_000 }), { minItems: 1, maxItems: 100 }),
  modules: Type.Array(Type.String({ minLength: 1, maxLength: 1_000 }), { minItems: 1, maxItems: 100 }),
  checklists: TextListSchema,
  templates: TextListSchema,
  resources: TextListSchema,
  bonuses: TextListSchema,
  evidenceIds: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 100 }),
}, { additionalProperties: true });

export const ProductModuleOutputSchema = Type.Object({
  schemaVersion: Type.Integer({ minimum: 1 }),
  proposals: Type.Array(ProductProposalSchema, { minItems: 1, maxItems: 20 }),
  selectedId: RequiredTextSchema,
}, { additionalProperties: true });

export type ProductProposal = Static<typeof ProductProposalSchema>;
export type ProductModuleOutput = Static<typeof ProductModuleOutputSchema>;
