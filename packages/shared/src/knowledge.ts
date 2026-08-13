import { Type, type Static } from "@sinclair/typebox";

export const KnowledgeScopeSchema = Type.Union([Type.Literal("GLOBAL"), Type.Literal("PROJECT")]);
export const KnowledgeDocumentStatusSchema = Type.Union([
  Type.Literal("PENDING"), Type.Literal("PROCESSING"), Type.Literal("READY"),
  Type.Literal("FAILED"), Type.Literal("NEEDS_OCR"),
]);
export const KnowledgeFileTypeSchema = Type.Union([
  Type.Literal("pdf"), Type.Literal("docx"), Type.Literal("txt"),
  Type.Literal("md"), Type.Literal("html"), Type.Literal("manual"),
]);

export const KnowledgeLibrarySchema = Type.Object({
  id: Type.String({ format: "uuid" }), name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]), scope: KnowledgeScopeSchema,
  projectId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  domain: Type.Union([Type.String(), Type.Null()]), category: Type.Union([Type.String(), Type.Null()]),
  tags: Type.Array(Type.String()), priority: Type.Integer(), enabled: Type.Boolean(),
  documentCount: Type.Integer(), chunkCount: Type.Integer(), createdAt: Type.String({ format: "date-time" }),
});

export const KnowledgeDocumentSchema = Type.Object({
  id: Type.String({ format: "uuid" }), libraryId: Type.String({ format: "uuid" }),
  title: Type.String(), description: Type.Union([Type.String(), Type.Null()]),
  fileType: KnowledgeFileTypeSchema, status: KnowledgeDocumentStatusSchema,
  originalName: Type.Union([Type.String(), Type.Null()]), fileHash: Type.String(),
  mimeType: Type.Union([Type.String(), Type.Null()]), bytes: Type.Integer(),
  chunkCount: Type.Integer(), errorCode: Type.Union([Type.String(), Type.Null()]),
  errorMessage: Type.Union([Type.String(), Type.Null()]), createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});

export const KnowledgeChunkResultSchema = Type.Object({
  id: Type.String({ format: "uuid" }), documentId: Type.String({ format: "uuid" }),
  documentTitle: Type.String(), libraryId: Type.String({ format: "uuid" }), libraryName: Type.String(),
  heading: Type.Union([Type.String(), Type.Null()]), pageNumber: Type.Union([Type.Integer(), Type.Null()]),
  position: Type.Integer(), content: Type.String(), score: Type.Number(), sourceKind: Type.Literal("document"),
  scope: KnowledgeScopeSchema, category: Type.Union([Type.String(),Type.Null()]),
  fileType: KnowledgeFileTypeSchema, tags: Type.Array(Type.String()),
});

export const ArtifactMemorySchema = Type.Object({
  id: Type.String({ format: "uuid" }), projectId: Type.String({ format: "uuid" }),
  artifactVersionId: Type.String({ format: "uuid" }), moduleKey: Type.String(),
  decision: Type.Union([Type.Literal("APPROVED"), Type.Literal("REJECTED")]),
  reusable: Type.Boolean(), preferred: Type.Boolean(), content: Type.String(),
  createdAt: Type.String({ format: "date-time" }), updatedAt: Type.String({ format: "date-time" }),
});

export const CreateKnowledgeLibrarySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  scope: KnowledgeScopeSchema, domain: Type.Optional(Type.String({ maxLength: 120 })),
  category: Type.Optional(Type.String({ maxLength: 120 })),
  tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 60 }), { maxItems: 30 })),
  priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
}, { additionalProperties: false });

export const ImportKnowledgeDocumentSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 300 }),
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  category: Type.Optional(Type.String({ maxLength: 120 })),
  tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 60 }), { maxItems: 30 })),
  priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  fileType: KnowledgeFileTypeSchema,
  filename: Type.Optional(Type.String({ maxLength: 260 })),
  contentBase64: Type.Optional(Type.String({ maxLength: 70_000_000 })),
  text: Type.Optional(Type.String({ maxLength: 20_000_000 })),
}, { additionalProperties: false });

export const KnowledgeSearchQuerySchema = Type.Object({
  q: Type.String({ minLength: 1, maxLength: 1000 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  libraryId: Type.Optional(Type.String({ format: "uuid" })),
  scope: Type.Optional(KnowledgeScopeSchema),
  category: Type.Optional(Type.String({ maxLength: 120 })),
  tags: Type.Optional(Type.String({ maxLength: 500 })),
  fileType: Type.Optional(KnowledgeFileTypeSchema),
});

export const KnowledgeAskSchema = Type.Object({
  question: Type.String({ minLength: 1, maxLength: 4000 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
}, { additionalProperties: false });

export type KnowledgeScope = Static<typeof KnowledgeScopeSchema>;
export type KnowledgeDocumentStatus = Static<typeof KnowledgeDocumentStatusSchema>;
export type KnowledgeFileType = Static<typeof KnowledgeFileTypeSchema>;
export type KnowledgeLibrary = Static<typeof KnowledgeLibrarySchema>;
export type KnowledgeDocument = Static<typeof KnowledgeDocumentSchema>;
export type KnowledgeChunkResult = Static<typeof KnowledgeChunkResultSchema>;
export type ArtifactMemory = Static<typeof ArtifactMemorySchema>;
export type CreateKnowledgeLibraryInput = Static<typeof CreateKnowledgeLibrarySchema>;
export type ImportKnowledgeDocumentInput = Static<typeof ImportKnowledgeDocumentSchema>;
export type KnowledgeSearchQuery = Static<typeof KnowledgeSearchQuerySchema>;
export type KnowledgeAskInput = Static<typeof KnowledgeAskSchema>;
