import { Type, type Static } from "@sinclair/typebox";

export const ModuleKeySchema = Type.Union([
  Type.Literal("research"), Type.Literal("sources"), Type.Literal("problems"),
  Type.Literal("opportunities"), Type.Literal("product"), Type.Literal("avatar"),
  Type.Literal("mechanism"), Type.Literal("beliefs"), Type.Literal("offer"),
  Type.Literal("landing"), Type.Literal("funnel"), Type.Literal("emails"),
  Type.Literal("content"), Type.Literal("final_product"),
]);
export type ModuleKey=Static<typeof ModuleKeySchema>;

export const SourceSchema=Type.Object({id:Type.String({format:"uuid"}),projectId:Type.String({format:"uuid"}),sourceType:Type.Union([Type.Literal("youtube"),Type.Literal("manual"),Type.Literal("demo")]),title:Type.String(),url:Type.Union([Type.String(),Type.Null()]),status:Type.String(),metadata:Type.Record(Type.String(),Type.Unknown()),createdAt:Type.String({format:"date-time"})});
export const CommentSchema=Type.Object({id:Type.String({format:"uuid"}),projectId:Type.String({format:"uuid"}),sourceId:Type.String({format:"uuid"}),platformCommentId:Type.String(),author:Type.String(),text:Type.String(),likes:Type.Integer({minimum:0}),publishedAt:Type.Union([Type.String(),Type.Null()]),threadId:Type.Union([Type.String(),Type.Null()]),parentCommentId:Type.Union([Type.String(),Type.Null()]),isReply:Type.Boolean(),isDemo:Type.Boolean()});
export const SourceBundleSchema=Type.Object({sources:Type.Array(SourceSchema),comments:Type.Array(CommentSchema)});
export const CreateSourceSchema=Type.Object({sourceType:Type.Union([Type.Literal("youtube"),Type.Literal("manual"),Type.Literal("demo")]),title:Type.Optional(Type.String()),url:Type.Optional(Type.String()),text:Type.Optional(Type.String())});
export type Source=Static<typeof SourceSchema>;export type Comment=Static<typeof CommentSchema>;export type SourceBundle=Static<typeof SourceBundleSchema>;export type CreateSourceInput=Static<typeof CreateSourceSchema>;

export const ModuleResultSchema=Type.Object({moduleKey:ModuleKeySchema,artifactId:Type.String({format:"uuid"}),versionId:Type.String({format:"uuid"}),versionNumber:Type.Integer(),freshness:Type.String(),status:Type.String(),outputData:Type.Unknown(),createdAt:Type.String({format:"date-time"})});
export const ModuleResultListSchema=Type.Object({results:Type.Array(ModuleResultSchema)});
export const RunModuleSchema=Type.Object({provider:Type.Optional(Type.Union([Type.Literal("mock"),Type.Literal("openai")])),instructions:Type.Optional(Type.String()),demo:Type.Optional(Type.Boolean())});
export type ModuleResult=Static<typeof ModuleResultSchema>;export type RunModuleInput=Static<typeof RunModuleSchema>;

export const JobSchema=Type.Object({id:Type.String({format:"uuid"}),projectId:Type.String({format:"uuid"}),jobType:Type.String(),status:Type.Union([Type.Literal("QUEUED"),Type.Literal("RUNNING"),Type.Literal("COMPLETED"),Type.Literal("FAILED"),Type.Literal("CANCELLED")]),progress:Type.Integer({minimum:0,maximum:100}),message:Type.Union([Type.String(),Type.Null()]),createdAt:Type.String({format:"date-time"}),completedAt:Type.Union([Type.String(),Type.Null()])});
export const GenerationSchema=Type.Object({id:Type.String({format:"uuid"}),projectId:Type.String({format:"uuid"}),agentKey:Type.String(),provider:Type.String(),model:Type.String(),status:Type.String(),inputTokens:Type.Integer(),outputTokens:Type.Integer(),estimatedCost:Type.Number(),durationMs:Type.Integer(),createdAt:Type.String({format:"date-time"}),promptVersion:Type.Union([Type.String(),Type.Null()]),outputData:Type.Unknown(),artifactVersionId:Type.Union([Type.String({format:"uuid"}),Type.Null()]),versionNumber:Type.Union([Type.Integer(),Type.Null()])});
export type Job=Static<typeof JobSchema>;export type Generation=Static<typeof GenerationSchema>;

export const GeneratedFileSchema=Type.Object({id:Type.String({format:"uuid"}),projectId:Type.String({format:"uuid"}),artifactVersionId:Type.Union([Type.String({format:"uuid"}),Type.Null()]),fileRole:Type.String(),format:Type.String(),relativePath:Type.String(),checksum:Type.String(),bytes:Type.Integer({minimum:0}),createdAt:Type.String({format:"date-time"}),downloadUrl:Type.String()});
export type GeneratedFile=Static<typeof GeneratedFileSchema>;
export const EvidenceSnippetSchema=Type.Object({id:Type.String({format:"uuid"}),projectId:Type.String({format:"uuid"}),sourceId:Type.String({format:"uuid"}),commentId:Type.String({format:"uuid"}),quoteText:Type.String(),provenance:Type.Union([Type.Literal("EVIDENCE_BACKED"),Type.Literal("AI_INFERENCE")]),sourceTitle:Type.String(),author:Type.String()});
export type EvidenceSnippet=Static<typeof EvidenceSnippetSchema>;
