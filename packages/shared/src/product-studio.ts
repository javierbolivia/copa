import { Type, type Static } from "@sinclair/typebox";

export const ProductDocumentTypeSchema = Type.Union([
  Type.Literal("ebook"), Type.Literal("guide"), Type.Literal("workbook"),
  Type.Literal("checklist"), Type.Literal("lead_magnet"),
]);
export const ProductDocumentStatusSchema = Type.Union([
  Type.Literal("DRAFT"), Type.Literal("OUTLINE_READY"), Type.Literal("OUTLINE_APPROVED"),
  Type.Literal("IN_PROGRESS"), Type.Literal("APPROVED"), Type.Literal("STALE"),
]);
export const ProductChapterStatusSchema = Type.Union([
  Type.Literal("PENDING"), Type.Literal("GENERATING"), Type.Literal("DRAFT"),
  Type.Literal("APPROVED"), Type.Literal("FAILED"), Type.Literal("STALE"),
]);
export const ProductBlockTypeSchema = Type.Union([
  Type.Literal("heading"), Type.Literal("paragraph"), Type.Literal("bulletList"),
  Type.Literal("numberedList"), Type.Literal("checklist"), Type.Literal("quote"),
  Type.Literal("callout"), Type.Literal("image"), Type.Literal("table"),
  Type.Literal("divider"), Type.Literal("pageBreak"), Type.Literal("exercise"),
  Type.Literal("question"), Type.Literal("keyTakeaway"), Type.Literal("diagram"),
  Type.Literal("sourceReference"), Type.Literal("CTA"),
]);

const JsonScalarSchema = Type.Union([Type.String({ maxLength: 200_000 }), Type.Number(), Type.Boolean(), Type.Null()]);
const JsonListSchema = Type.Array(JsonScalarSchema, { maxItems: 2_000 });
const SafeObjectSchema = Type.Record(Type.String({ maxLength: 100 }), Type.Union([JsonScalarSchema, JsonListSchema]));
type SafeJsonScalar = string | number | boolean | null;
const ProductBlockMetadataSchema = Type.Unsafe<
  Record<string, SafeJsonScalar | SafeJsonScalar[]>
>({
  type: "object",
  propertyNames: { maxLength: 100 },
  properties: {
    evidenceIds: {
      anyOf: [
        {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 200 },
          maxItems: 20,
        },
        { type: "string", minLength: 1, maxLength: 200 },
      ],
    },
  },
  additionalProperties: Type.Union([JsonScalarSchema, JsonListSchema]),
});
export const ProductBlockSchema = Type.Object({
  id: Type.String({ format: "uuid" }), type: ProductBlockTypeSchema,
  content: Type.Union([JsonScalarSchema, JsonListSchema, SafeObjectSchema]),
  order: Type.Integer({ minimum: 0 }), metadata: ProductBlockMetadataSchema,
  createdAt: Type.String({ format: "date-time" }), updatedAt: Type.String({ format: "date-time" }),
}, { additionalProperties: false });

export const ProductThemeSchema = Type.Object({
  template: Type.Union([Type.Literal("minimal"), Type.Literal("professional"), Type.Literal("workbook"), Type.Literal("lead_magnet")]),
  accentColor: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  typographyScale: Type.Number({ minimum: 0.75, maximum: 2 }),
  spacing: Type.Number({ minimum: 0.5, maximum: 3 }),
  pageSize: Type.Union([Type.Literal("A4"), Type.Literal("LETTER")]),
  margins: Type.Number({ minimum: 0, maximum: 80 }),
}, { additionalProperties: false });

export const ProductOutlineItemSchema = Type.Object({
  id: Type.String({ format: "uuid" }), title: Type.String({ minLength: 1, maxLength: 300 }),
  objective: Type.String({ maxLength: 2_000 }), order: Type.Integer({ minimum: 0 }),
  targetWords: Type.Integer({ minimum: 50, maximum: 50_000 }),
  status: ProductChapterStatusSchema,
}, { additionalProperties: false });

export const ProductDocumentVersionSchema = Type.Object({
  id: Type.String({ format: "uuid" }), documentId: Type.String({ format: "uuid" }),
  versionNumber: Type.Integer({ minimum: 1 }), blocks: Type.Array(ProductBlockSchema, { maxItems: 20_000 }),
  outline: Type.Array(ProductOutlineItemSchema, { maxItems: 500 }), theme: ProductThemeSchema,
  metadata: SafeObjectSchema, revisionKind: Type.Union([Type.Literal("WIZARD"), Type.Literal("OUTLINE"), Type.Literal("AUTOSAVE"), Type.Literal("CHAPTER"), Type.Literal("APPROVAL")]),
  createdAt: Type.String({ format: "date-time" }),
});

export const ProductDocumentSchema = Type.Object({
  id: Type.String({ format: "uuid" }), projectId: Type.String({ format: "uuid" }),
  productArtifactVersionId: Type.String({ format: "uuid" }),
  opportunityArtifactVersionId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  mechanismArtifactVersionId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  artifactVersionId: Type.String({ format: "uuid" }), documentType: ProductDocumentTypeSchema,
  title: Type.String(), subtitle: Type.Union([Type.String(), Type.Null()]),
  language: Type.String(), length: Type.Union([Type.Literal("short"), Type.Literal("medium"), Type.Literal("long")]),
  level: Type.Union([Type.Literal("beginner"), Type.Literal("intermediate"), Type.Literal("advanced")]),
  status: ProductDocumentStatusSchema, freshness: Type.Union([Type.Literal("fresh"), Type.Literal("stale")]),
  staleReason: Type.Union([Type.String(), Type.Null()]), activeVersionId: Type.String({ format: "uuid" }),
  version: ProductDocumentVersionSchema, createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});

export const CreateProductDocumentSchema = Type.Object({
  documentType: ProductDocumentTypeSchema, productArtifactVersionId: Type.Optional(Type.String({ format: "uuid" })),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  subtitle: Type.Optional(Type.String({ maxLength: 500 })), language: Type.String({ minLength: 2, maxLength: 16 }),
  length: Type.Union([Type.Literal("short"), Type.Literal("medium"), Type.Literal("long")]),
  level: Type.Union([Type.Literal("beginner"), Type.Literal("intermediate"), Type.Literal("advanced")]),
  selectedGlobalLibraryIds: Type.Optional(Type.Array(Type.String({ format: "uuid" }), { maxItems: 100 })),
}, { additionalProperties: false });

export const ProductOutlineOperationSchema = Type.Object({
  operation: Type.Union([Type.Literal("add"), Type.Literal("update"), Type.Literal("move"), Type.Literal("duplicate"), Type.Literal("delete")]),
  itemId: Type.Optional(Type.String({ format: "uuid" })), title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  objective: Type.Optional(Type.String({ maxLength: 2_000 })), targetWords: Type.Optional(Type.Integer({ minimum: 50, maximum: 50_000 })),
  afterId: Type.Optional(Type.String({ format: "uuid" })), toIndex: Type.Optional(Type.Integer({ minimum: 0 })),
}, { additionalProperties: false });

export const ProductAutosaveSchema = Type.Object({
  baseVersionNumber: Type.Integer({ minimum: 1 }), idempotencyKey: Type.String({ minLength: 8, maxLength: 200 }),
  blocks: Type.Array(ProductBlockSchema, { maxItems: 20_000 }), theme: Type.Optional(ProductThemeSchema),
  metadata: Type.Optional(SafeObjectSchema),
}, { additionalProperties: false });

export type ProductDocumentType = Static<typeof ProductDocumentTypeSchema>;
export type ProductDocumentStatus = Static<typeof ProductDocumentStatusSchema>;
export type ProductChapterStatus = Static<typeof ProductChapterStatusSchema>;
export type ProductBlockType = Static<typeof ProductBlockTypeSchema>;
export type ProductBlock = Static<typeof ProductBlockSchema>;
export type ProductTheme = Static<typeof ProductThemeSchema>;
export type ProductOutlineItem = Static<typeof ProductOutlineItemSchema>;
export type ProductDocumentVersion = Static<typeof ProductDocumentVersionSchema>;
export type ProductDocument = Static<typeof ProductDocumentSchema>;
export type CreateProductDocumentInput = Static<typeof CreateProductDocumentSchema>;
export type ProductOutlineOperation =
  | {operation:"add";title:string;objective?:string;targetWords?:number;afterId?:string}
  | {operation:"update";itemId:string;title?:string;objective?:string;targetWords?:number}
  | {operation:"move";itemId:string;toIndex:number}
  | {operation:"duplicate";itemId:string}
  | {operation:"delete";itemId:string};
export type ProductAutosaveInput = Static<typeof ProductAutosaveSchema>;
