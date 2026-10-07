import { ApiErrorSchema, CommentSchema, CreateSourceSchema, EvidenceSnippetSchema, GenerationSchema, GenerationVersionMetadataSchema, JobSchema, ModuleKeySchema, SourceBundleSchema, SourceSchema,
  type ApiError,type Comment,type CreateSourceInput,type EvidenceSnippet,type Generation,type GenerationVersionMetadata,type Job,type ModuleKey,type Source,type SourceBundle } from "@our-platform/shared";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { JobRepository } from "../repositories/job-repository.js";
import type { SourceRepository } from "../repositories/source-repository.js";
import { YouTubeImportError, type YouTubeImportService } from "../services/youtube-import-service.js";
import { ProductStudioConflictError, type ProductStudioService } from "../services/product-studio-service.js";

const ProjectParams=Type.Object({id:Type.String({format:"uuid"})});
const GenerationVersionMetadataQuery=Type.Object({moduleKey:ModuleKeySchema});
const SourceParams=Type.Object({id:Type.String({format:"uuid"}),sourceId:Type.String({format:"uuid"})});
const JobParams=Type.Object({id:Type.String({format:"uuid"}),jobId:Type.String({format:"uuid"})});
const SourceListQuery=Type.Object({query:Type.Optional(Type.String({maxLength:300})),sourceType:Type.Optional(Type.Union([Type.Literal("youtube"),Type.Literal("manual"),Type.Literal("demo")]))});
const CommentListQuery=Type.Object({query:Type.Optional(Type.String({maxLength:300})),sourceId:Type.Optional(Type.String({format:"uuid"})),replies:Type.Optional(Type.Boolean()),minLikes:Type.Optional(Type.Integer({minimum:0})),analysis:Type.Optional(Type.Union([Type.Literal("all"),Type.Literal("included"),Type.Literal("excluded")])),limit:Type.Optional(Type.Integer({minimum:1,maximum:1000})),offset:Type.Optional(Type.Integer({minimum:0}))});
const SourcesResponse=Type.Object({sources:Type.Array(SourceSchema)}),AnalysisSetResponse=Type.Object({comments:Type.Array(CommentSchema)}),CommentsResponse=Type.Object({comments:Type.Array(CommentSchema),total:Type.Integer({minimum:0}),eligibleIncluded:Type.Integer({minimum:0})}),JobsResponse=Type.Object({jobs:Type.Array(JobSchema)}),GenerationsResponse=Type.Object({generations:Type.Array(GenerationSchema)}),GenerationVersionMetadataResponse=Type.Object({generations:Type.Array(GenerationVersionMetadataSchema)});
const YouTubeQueuedResponse=Type.Object({source:SourceSchema,job:JobSchema});
const EvidenceParams=Type.Object({id:Type.String({format:"uuid"}),evidenceId:Type.String({format:"uuid"})});
const YouTubeSearchQuery=Type.Object({q:Type.String({minLength:2,maxLength:300}),pageToken:Type.Optional(Type.String({maxLength:500}))});
const YouTubeImportBody=Type.Object({videoId:Type.String({minLength:11,maxLength:32}),title:Type.String({minLength:1,maxLength:300}),topLevelLimit:Type.Integer({minimum:1,maximum:2000})});
const IncludeAnalysisBody=Type.Object({included:Type.Boolean()});

type SourceListQueryType={query?:string;sourceType?:"youtube"|"manual"|"demo"};
type CommentListQueryType={query?:string;sourceId?:string;replies?:boolean;minLikes?:number;analysis?:"all"|"included"|"excluded";limit?:number;offset?:number};
const missing=(message:string):ApiError=>({error:"not_found",message});

export function registerSourceRoutes(app:FastifyInstance,sources:SourceRepository,jobs:JobRepository,youtube:YouTubeImportService,studio:ProductStudioService):void {
  app.get<{Reply:{configured:boolean}}>('/api/integrations/youtube/status',{schema:{response:{200:Type.Object({configured:Type.Boolean()})}}},async()=>({configured:youtube.isConfigured()}));
  app.get<{Params:{id:string};Querystring:{q:string;pageToken?:string};Reply:unknown|ApiError}>("/api/projects/:id/youtube/search",{schema:{params:ProjectParams,querystring:YouTubeSearchQuery}},async(req,reply)=>{
    if(!sources.projectExists(req.params.id))return reply.code(404).send(missing("El proyecto no existe."));
    if(req.query.q.trim().length<2)return reply.code(400).send({error:"invalid_youtube_query",message:"La búsqueda debe tener al menos dos caracteres."});
    try{const result=await youtube.search(req.query.q.trim(),req.query.pageToken);return {...result,items:result.items.map(item=>({...item,alreadyImported:sources.findYouTubeByVideoId(req.params.id,item.videoId)!==undefined}))};}
    catch(error){if(error instanceof YouTubeImportError)return reply.code(503).send({error:error.code,message:error.message});throw error;}
  });
  app.post<{Params:{id:string};Body:{videoId:string;title:string;topLevelLimit:number};Reply:{source:Source;job:Job}|ApiError}>("/api/projects/:id/youtube/import",{schema:{params:ProjectParams,body:YouTubeImportBody}},async(req,reply)=>{
    if(!sources.projectExists(req.params.id))return reply.code(404).send(missing("El proyecto no existe."));
    try{return reply.code(202).send(youtube.queue(req.params.id,`https://www.youtube.com/watch?v=${req.body.videoId}`,req.body.title,req.body.topLevelLimit));}
    catch(error){if(error instanceof YouTubeImportError)return reply.code(error.code==="youtube_not_configured"?503:400).send({error:error.code,message:error.message});throw error;}
  });
  app.get<{Params:{id:string};Querystring:SourceListQueryType;Reply:{sources:Source[]}}>("/api/projects/:id/sources",{schema:{params:ProjectParams,querystring:SourceListQuery,response:{200:SourcesResponse}}},async(req)=>({sources:sources.list(req.params.id,req.query)}));
  app.get<{Params:{id:string;sourceId:string};Reply:SourceBundle|ApiError}>("/api/projects/:id/sources/:sourceId",{schema:{params:SourceParams,response:{200:SourceBundleSchema,404:ApiErrorSchema}}},async(req,reply)=>sources.getBundle(req.params.id,req.params.sourceId)??reply.code(404).send(missing("La fuente no existe en este proyecto.")));
  app.post<{Params:{id:string};Body:CreateSourceInput;Reply:SourceBundle|{source:Source;job:Job}|ApiError}>("/api/projects/:id/sources",{schema:{params:ProjectParams,body:CreateSourceSchema,response:{201:SourceBundleSchema,202:YouTubeQueuedResponse,400:ApiErrorSchema,404:ApiErrorSchema,503:ApiErrorSchema}}},async(req,reply)=>{
    if(!sources.projectExists(req.params.id))return reply.code(404).send(missing("El proyecto no existe."));
    try {
      if(req.body.sourceType==="demo")return reply.code(201).send(sources.createDemo(req.params.id,req.body.title));
      if(req.body.sourceType==="manual")return reply.code(201).send(sources.createManual(req.params.id,req.body));
      if(!req.body.url?.trim())return reply.code(400).send({error:"youtube_url_required",message:"La URL de YouTube es obligatoria."});
      return reply.code(202).send(youtube.queue(req.params.id,req.body.url,req.body.title));
    } catch(error) {
      if(error instanceof YouTubeImportError)return reply.code(error.code==="youtube_not_configured"?503:400).send({error:error.code,message:error.message});
      if(error instanceof Error&&error.message==="manual_text_required")return reply.code(400).send({error:"manual_text_required",message:"El texto manual es obligatorio."});
      throw error;
    }
  });
  app.delete<{Params:{id:string;sourceId:string};Reply:{deleted:true}|ApiError}>("/api/projects/:id/sources/:sourceId",{schema:{params:SourceParams}},async(req,reply)=>sources.delete(req.params.id,req.params.sourceId)?{deleted:true as const}:reply.code(404).send(missing("La fuente no existe en este proyecto.")));
  app.put<{Params:{id:string;sourceId:string};Body:{included:boolean};Reply:Source|ApiError}>("/api/projects/:id/sources/:sourceId/analysis",{schema:{params:SourceParams,body:IncludeAnalysisBody}},async(req,reply)=>sources.setIncludedInAnalysis(req.params.id,req.params.sourceId,req.body.included)??reply.code(404).send(missing("La fuente no existe en este proyecto.")));
  app.get<{Params:{id:string};Reply:{comments:Comment[]}}>("/api/projects/:id/analysis-set",{schema:{params:ProjectParams,response:{200:AnalysisSetResponse}}},async(req)=>({comments:sources.analysisSet(req.params.id)}));
  app.get<{Params:{id:string};Querystring:CommentListQueryType;Reply:{comments:Comment[];total:number;eligibleIncluded:number}}>("/api/projects/:id/comments",{schema:{params:ProjectParams,querystring:CommentListQuery,response:{200:CommentsResponse}}},async(req)=>({...sources.listCommentsPage(req.params.id,req.query),...sources.commentSummary(req.params.id)}));
  app.get<{Params:{id:string};Reply:{jobs:Job[]}}>("/api/projects/:id/jobs",{schema:{params:ProjectParams,response:{200:JobsResponse}}},async(req)=>({jobs:jobs.list(req.params.id)}));
  app.get<{Params:{id:string;jobId:string};Reply:Job|ApiError}>("/api/projects/:id/jobs/:jobId",{schema:{params:JobParams,response:{200:JobSchema,404:ApiErrorSchema}}},async(req,reply)=>jobs.get(req.params.id,req.params.jobId)??reply.code(404).send(missing("El trabajo no existe en este proyecto.")));
  app.post<{Params:{id:string;jobId:string};Reply:Job|ApiError}>("/api/projects/:id/jobs/:jobId/cancel",{schema:{params:JobParams,response:{200:JobSchema,404:ApiErrorSchema}}},async(req,reply)=>youtube.cancel(req.params.id,req.params.jobId)??reply.code(404).send(missing("El trabajo no existe en este proyecto.")));
  app.post<{Params:{id:string;jobId:string};Reply:Job|ApiError}>("/api/projects/:id/jobs/:jobId/retry",{schema:{params:JobParams,response:{200:JobSchema,404:ApiErrorSchema,409:ApiErrorSchema,422:ApiErrorSchema}}},async(req,reply)=>{
    const job=jobs.get(req.params.id,req.params.jobId);
    if(!job)return reply.code(404).send(missing("El trabajo no existe en este proyecto."));
    if(job.jobType==="youtube_import")return youtube.retry(req.params.id,req.params.jobId)!;
    if(job.jobType!=="product_chapters")return reply.code(409).send({error:"unsupported_job_type",message:"Este trabajo no admite reintentos."});
    try{
      await studio.resumeBatch(req.params.id,req.params.jobId);
      return jobs.get(req.params.id,req.params.jobId)!;
    }catch(error){
      const conflict=error instanceof ProductStudioConflictError;
      return reply.code(conflict?409:422).send({error:conflict?"version_conflict":"product_studio_error",message:error instanceof Error?error.message:"No se pudo reanudar el trabajo."});
    }
  });
  app.get<{Params:{id:string};Reply:{generations:Generation[]}}>("/api/projects/:id/generations",{schema:{params:ProjectParams,response:{200:GenerationsResponse}}},async(req)=>({generations:jobs.listGenerations(req.params.id)}));
  app.get<{Params:{id:string};Querystring:{moduleKey:ModuleKey};Reply:{generations:GenerationVersionMetadata[]}|ApiError}>("/api/projects/:id/generation-version-metadata",{schema:{params:ProjectParams,querystring:GenerationVersionMetadataQuery,response:{200:GenerationVersionMetadataResponse,404:ApiErrorSchema}}},async(req,reply)=>{
    if(!sources.projectExists(req.params.id))return reply.code(404).send(missing("El proyecto no existe."));
    return {generations:jobs.listGenerationVersionMetadata(req.params.id,req.query.moduleKey)};
  });
  app.get<{Params:{id:string;evidenceId:string};Reply:EvidenceSnippet|ApiError}>("/api/projects/:id/evidence/:evidenceId",{schema:{params:EvidenceParams,response:{200:EvidenceSnippetSchema,404:ApiErrorSchema}}},async(req,reply)=>sources.getEvidence(req.params.id,req.params.evidenceId)??reply.code(404).send(missing("La evidencia no existe en este proyecto.")));
}
