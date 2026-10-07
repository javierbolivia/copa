import type { Generation, GenerationHistory, GenerationVersionMetadata, Job, ModuleKey } from "@our-platform/shared";
import { v7 as uuidv7 } from "uuid";
import type { AppDatabase } from "../database/database.js";

interface JobRow {id:string;project_id:string;job_type:string;status:Job["status"];progress:number;message:string|null;created_at:string;completed_at:string|null}
export interface JobRecord extends Job {sourceId:string|null;payload:Record<string,unknown>;attempts:number;maxAttempts:number;cancelRequested:boolean}
interface GenerationRow {id:string;project_id:string;agent_key:string;provider:string;model:string;status:string;input_tokens:number;output_tokens:number;estimated_cost:number;cost_status:Generation["costStatus"];duration_ms:number;created_at:string;prompt_version:string|null;output_data:string|null;artifact_version_id:string|null;version_number:number|null;error_code:string|null}
const toJob=(r:JobRow):Job=>({id:r.id,projectId:r.project_id,jobType:r.job_type,status:r.status,progress:r.progress,message:r.message,createdAt:r.created_at,completedAt:r.completed_at});
const toGeneration=(r:GenerationRow):Generation=>({id:r.id,projectId:r.project_id,agentKey:r.agent_key,provider:r.provider,model:r.model,status:r.status,inputTokens:r.input_tokens,outputTokens:r.output_tokens,estimatedCost:r.estimated_cost,costStatus:r.cost_status,durationMs:r.duration_ms,createdAt:r.created_at,promptVersion:r.prompt_version,outputData:parseJson(r.output_data),artifactVersionId:r.artifact_version_id,versionNumber:r.version_number,errorCode:r.error_code});

export class JobRepository {
  constructor(private readonly database:AppDatabase){}
  createGeneric(projectId:string,jobType:string,payload:Record<string,unknown>,message="Esperando procesamiento"):Job {const id=uuidv7(),now=new Date().toISOString();this.database.connection.prepare(`INSERT INTO jobs(id,project_id,job_type,status,progress,message,payload_json,created_at,updated_at) VALUES(?,?,?,'QUEUED',0,?,?,?,?)`).run(id,projectId,jobType,message,JSON.stringify(payload),now,now);return this.get(projectId,id)!;}
  createYouTube(projectId:string,sourceId:string,url:string,topLevelLimit=500):Job {const id=uuidv7(),now=new Date().toISOString();this.database.connection.prepare(`INSERT INTO jobs(id,project_id,source_id,job_type,status,progress,message,payload_json,created_at,updated_at) VALUES(?,?,?,'youtube_import','QUEUED',0,'Esperando importación',?,?,?)`).run(id,projectId,sourceId,JSON.stringify({url,topLevelLimit}),now,now);return this.get(projectId,id)!;}
  list(projectId:string):Job[]{return (this.database.connection.prepare("SELECT * FROM jobs WHERE project_id=? ORDER BY created_at DESC").all(projectId) as unknown as JobRow[]).map(toJob);}
  get(projectId:string,id:string):Job|undefined{const r=this.database.connection.prepare("SELECT * FROM jobs WHERE project_id=? AND id=?").get(projectId,id) as JobRow|undefined;return r?toJob(r):undefined;}
  getRecord(projectId:string,id:string):JobRecord|undefined{const r=this.database.connection.prepare("SELECT * FROM jobs WHERE project_id=? AND id=?").get(projectId,id) as (JobRow&{source_id:string|null;payload_json:string;attempts:number;max_attempts:number;cancel_requested:number})|undefined;if(!r)return undefined;let payload:Record<string,unknown>={};try{payload=JSON.parse(r.payload_json) as Record<string,unknown>;}catch{}return {...toJob(r),sourceId:r.source_id,payload,attempts:r.attempts,maxAttempts:r.max_attempts,cancelRequested:r.cancel_requested===1};}
  start(projectId:string,id:string,message="Procesando"):Job|undefined{const now=new Date().toISOString();this.database.connection.prepare(`UPDATE jobs SET status='RUNNING',progress=1,message=?,attempts=attempts+1,started_at=COALESCE(started_at,?),completed_at=NULL,updated_at=? WHERE project_id=? AND id=? AND status='QUEUED'`).run(message,now,now,projectId,id);return this.get(projectId,id);}
  progress(projectId:string,id:string,value:number,message:string):Job|undefined{this.database.connection.prepare("UPDATE jobs SET progress=?,message=?,updated_at=? WHERE project_id=? AND id=? AND status='RUNNING'").run(Math.max(1,Math.min(99,value)),message,new Date().toISOString(),projectId,id);return this.get(projectId,id);}
  updateProgress(projectId:string,id:string,value:number,message:string):void{this.progress(projectId,id,value,message);}
  checkpoint(projectId:string,id:string,payload:Record<string,unknown>,progress:number,message:string):void{this.database.connection.prepare("UPDATE jobs SET payload_json=?,progress=?,message=?,updated_at=? WHERE project_id=? AND id=? AND status='RUNNING'").run(JSON.stringify(payload),Math.max(1,Math.min(99,progress)),message,new Date().toISOString(),projectId,id);}
  complete(projectId:string,id:string,result:unknown):Job|undefined{const now=new Date().toISOString();this.database.connection.prepare(`UPDATE jobs SET status='COMPLETED',progress=100,message='Completado',result_json=?,completed_at=?,updated_at=? WHERE project_id=? AND id=?`).run(JSON.stringify(result),now,now,projectId,id);return this.get(projectId,id);}
  fail(projectId:string,id:string,code:string,message:string):Job|undefined{const now=new Date().toISOString();this.database.connection.prepare(`UPDATE jobs SET status='FAILED',message=?,error_code=?,error_message=?,completed_at=?,updated_at=? WHERE project_id=? AND id=? AND status IN ('QUEUED','RUNNING')`).run(message,code,message,now,now,projectId,id);return this.get(projectId,id);}
  cancel(projectId:string,id:string):Job|undefined{const now=new Date().toISOString();this.database.connection.prepare(`UPDATE jobs SET status='CANCELLED',cancel_requested=1,message='Cancelado por el usuario',completed_at=?,updated_at=? WHERE project_id=? AND id=? AND status IN ('QUEUED','RUNNING')`).run(now,now,projectId,id);return this.get(projectId,id);}
  retry(projectId:string,id:string):Job|undefined{const now=new Date().toISOString();this.database.connection.prepare(`UPDATE jobs SET status='QUEUED',progress=0,message='Reintento en cola',error_code=NULL,error_message=NULL,cancel_requested=0,completed_at=NULL,updated_at=? WHERE project_id=? AND id=? AND status IN ('FAILED','CANCELLED') AND attempts < max_attempts`).run(now,projectId,id);return this.get(projectId,id);}
  isCancelled(projectId:string,id:string):boolean{return (this.database.connection.prepare("SELECT cancel_requested FROM jobs WHERE project_id=? AND id=?").get(projectId,id) as {cancel_requested:number}|undefined)?.cancel_requested===1;}
  isCancellationRequested(projectId:string,id:string):boolean{return this.isCancelled(projectId,id);}
  recoverYouTubeImports():Array<{projectId:string;jobId:string}>{
    this.failYouTubeImports("retry_exhausted");
    this.database.connection.prepare(`UPDATE jobs SET status='QUEUED',progress=0,message='Recuperado después de reiniciar la aplicación',updated_at=? WHERE job_type='youtube_import' AND status='RUNNING' AND attempts<max_attempts`).run(new Date().toISOString());
    return this.database.connection.prepare(`SELECT project_id projectId,id jobId FROM jobs WHERE job_type='youtube_import' AND status='QUEUED' AND attempts<max_attempts`).all() as unknown as Array<{projectId:string;jobId:string}>;
  }
  failPendingYouTubeWithoutProvider():void{this.failYouTubeImports("youtube_not_configured");}
  private failYouTubeImports(code:"retry_exhausted"|"youtube_not_configured"):void{
    const exhausted=code==="retry_exhausted",now=new Date().toISOString();
    const message=exhausted?"Se agotaron los reintentos después de una interrupción":"YouTube no está configurado después del reinicio";
    const detail=exhausted?message:"Añade YOUTUBE_API_KEY y reintenta el job.";
    const condition=exhausted?"status='RUNNING' AND attempts>=max_attempts":"status='QUEUED'";
    const db=this.database.connection;
    db.exec("BEGIN IMMEDIATE");
    try{
      const failed=db.prepare(`UPDATE jobs SET status='FAILED',message=?,error_code=?,error_message=?,completed_at=?,updated_at=? WHERE job_type='youtube_import' AND ${condition} RETURNING project_id,source_id`).all(message,code,detail,now,now) as Array<{project_id:string;source_id:string|null}>;
      const updateSource=db.prepare("UPDATE sources SET status='failed',error_code=?,error_message=?,updated_at=? WHERE project_id=? AND id=?");
      for(const job of failed)if(job.source_id!==null)updateSource.run(code,detail,now,job.project_id,job.source_id);
      db.exec("COMMIT");
    }catch(error){
      if(db.isTransaction)db.exec("ROLLBACK");
      throw error;
    }
  }
  listGenerations(projectId:string):Generation[]{return (this.database.connection.prepare(`SELECT g.*,
    CASE WHEN g.provider IN ('mock','local') THEN 'not_applicable'
      WHEN usage.id IS NULL THEN CASE WHEN g.input_tokens>0 OR g.output_tokens>0 OR g.estimated_cost>0 THEN 'estimated' ELSE 'unknown' END
      WHEN usage.is_estimate=0 THEN 'reported'
      WHEN usage.input_tokens=0 AND usage.output_tokens=0 AND usage.estimated_cost=0 THEN 'unknown'
      ELSE 'estimated' END cost_status,
    (SELECT v.id FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.project_id=g.project_id AND a.artifact_type=json_extract(g.input_snapshot,'$.moduleKey') AND (json_extract(v.input_snapshot,'$.generationId')=g.id OR (json_extract(v.input_snapshot,'$.generationId') IS NULL AND v.output_data=g.output_data AND v.status<>'draft')) ORDER BY v.version_number DESC LIMIT 1) artifact_version_id,
    (SELECT v.version_number FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.project_id=g.project_id AND a.artifact_type=json_extract(g.input_snapshot,'$.moduleKey') AND (json_extract(v.input_snapshot,'$.generationId')=g.id OR (json_extract(v.input_snapshot,'$.generationId') IS NULL AND v.output_data=g.output_data AND v.status<>'draft')) ORDER BY v.version_number DESC LIMIT 1) version_number
    FROM generations g LEFT JOIN llm_usage usage ON usage.project_id=g.project_id AND usage.generation_id=g.id WHERE g.project_id=? ORDER BY g.created_at DESC`).all(projectId) as unknown as GenerationRow[]).map(toGeneration);}
  listGenerationVersionMetadata(projectId:string,moduleKey:ModuleKey):GenerationVersionMetadata[]{
    const rows=this.database.connection.prepare(`SELECT g.provider,g.model,
      (SELECT v.id FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id
        WHERE v.project_id=g.project_id AND a.artifact_type=json_extract(g.input_snapshot,'$.moduleKey')
          AND (json_extract(v.input_snapshot,'$.generationId')=g.id OR (json_extract(v.input_snapshot,'$.generationId') IS NULL AND v.output_data=g.output_data AND v.status<>'draft'))
        ORDER BY v.version_number DESC LIMIT 1) artifact_version_id
      FROM generations g WHERE g.project_id=? AND json_extract(g.input_snapshot,'$.moduleKey')=? ORDER BY g.created_at DESC`).all(projectId,moduleKey) as Array<{provider:string;model:string;artifact_version_id:string|null}>;
    return rows.filter((row):row is typeof row&{artifact_version_id:string}=>typeof row.artifact_version_id==="string")
      .map(row=>({provider:row.provider,model:row.model,artifactVersionId:row.artifact_version_id}));
  }
  listGenerationHistory(projectId:string):GenerationHistory[]{
    return this.listGenerations(projectId).map(generation=>({
      id:generation.id,projectId:generation.projectId,agentKey:generation.agentKey,provider:generation.provider,model:generation.model,
      status:generation.status,inputTokens:generation.inputTokens,outputTokens:generation.outputTokens,estimatedCost:generation.estimatedCost,
      costStatus:generation.costStatus,durationMs:generation.durationMs,createdAt:generation.createdAt,artifactVersionId:generation.artifactVersionId,
      versionNumber:generation.versionNumber,errorCode:generation.errorCode??null,result:generationHistoryPreview(generation.outputData,generation.agentKey),
    }));
  }
}

function parseJson(value:string|null):unknown{if(value===null)return null;try{return JSON.parse(value) as unknown;}catch{return null;}}
function generationHistoryPreview(value:unknown,agentKey:string):GenerationHistory["result"]{
  const title=humanize(agentKey);
  if(!isRecord(value))return{title,summary:"No hay una vista previa estructurada disponible para esta ejecución.",fields:[]};
  const fields=Object.entries(value).slice(0,8).map(([key,item])=>({label:humanize(key),value:previewValue(item)}));
  return{title,summary:`${fields.length} campos estructurados en esta generación.`,fields};
}
function previewValue(value:unknown):string{if(Array.isArray(value))return `${value.length} elementos`;if(isRecord(value))return Object.keys(value).slice(0,5).map(humanize).join(", ")||"Objeto vacío";if(value===null||value===undefined)return"—";return String(value).slice(0,240);}
function humanize(value:string):string{return value.replace(/([a-z])([A-Z])/g,"$1 $2").replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
