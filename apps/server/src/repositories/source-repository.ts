import type { Comment, CreateSourceInput, EvidenceSnippet, Source, SourceBundle } from "@our-platform/shared";
import type { StatementResultingChanges } from "node:sqlite";
import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database/database.js";
import type { YouTubeComment, YouTubeThread, YouTubeVideo } from "../integrations/youtube-adapter.js";
import type { YouTubeTranscriptResult } from "../integrations/youtube-transcript-client.js";

type SourceType = "youtube" | "manual" | "demo";

interface SourceRow {
  id: string; project_id: string; source_type: SourceType; title: string;
  url: string | null; status: string; include_in_analysis:number; metadata_json: string; created_at: string;
}
interface CommentRow {
  id: string; project_id: string; source_id: string; platform_comment_id: string;
  author: string; text: string; likes: number; published_at: string | null;
  thread_id: string | null; parent_comment_id: string | null; is_reply: number; is_demo: number; analysis_eligible:number;noise_reason:string|null;quality_score:number;
}
export interface VideoTranscript {
  readonly id:string; readonly projectId:string; readonly sourceId:string; readonly videoId:string;
  readonly language:string|null; readonly isGenerated:boolean|null; readonly provider:"youtube-transcript";
  readonly origin:"VIDEO_TRANSCRIPT"; readonly status:YouTubeTranscriptResult["status"]; readonly fingerprint:string|null;
  readonly retrievedAt:string; readonly errorCode:string|null; readonly errorMessage:string|null;
}
export interface VideoTranscriptSegment { readonly id:string; readonly transcriptId:string; readonly sourceId:string; readonly videoId:string; readonly segmentIndex:number; readonly startSeconds:number; readonly endSeconds:number; readonly text:string; readonly fingerprint:string; }

export interface SourceListFilter { query?: string; sourceType?: SourceType }
export interface CommentListFilter {
  query?: string; sourceId?: string; replies?: boolean; minLikes?: number; limit?: number; offset?: number;
}

const DEMO_COMMENTS = [
  ["Ana (DEMO)", "Tengo miles de fotos repetidas y nunca encuentro la que busco.", 42],
  ["Luis (DEMO)", "Me abruma empezar: están repartidas entre el móvil, discos y la nube.", 35],
  ["Carla (DEMO)", "Quiero un método sencillo para ordenar fotos sin pasar semanas haciéndolo.", 31],
  ["Miguel (DEMO)", "Ya probé carpetas por fecha, pero termino olvidando dónde guardé cada evento.", 24],
  ["Sofía (DEMO)", "Mi miedo es borrar recuerdos importantes al eliminar duplicados.", 22],
  ["Diego (DEMO)", "Necesito una rutina que pueda mantener cada mes, no otra organización temporal.", 19],
  ["Elena (DEMO)", "¿Cómo junto fotos de WhatsApp y la cámara sin perder la calidad original?", 17],
  ["Pablo (DEMO)", "Pagaría por una guía práctica que me diga qué conservar y qué respaldar.", 15],
  ["Marta (DEMO)", "Lo más frustrante es tener varias copias y no saber cuál es la mejor.", 13],
  ["Raúl (DEMO)", "Quiero compartir álbumes familiares sin exponer todas mis fotos privadas.", 11],
] as const;

function classifyComment(text:string,isReply:boolean):{eligible:boolean;reason:string|null;score:number}{
  const normalized=text.trim(),letters=normalized.replace(/[^\p{L}\p{N}]/gu,"");
  if(!letters)return{eligible:false,reason:"vacío o solo emojis",score:0};
  if(/^https?:\/\/\S+$/i.test(normalized))return{eligible:false,reason:"URL sin contexto",score:10};
  if(isReply&&letters.length<8)return{eligible:false,reason:"respuesta muy corta sin contexto",score:25};
  if(/^(.)\1{7,}$/u.test(letters))return{eligible:false,reason:"texto repetitivo",score:10};
  return{eligible:true,reason:null,score:Math.min(100,Math.max(55,70+Math.min(30,Math.floor(letters.length/12))))};
}

function parseMetadata(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}
const transcriptFingerprint=(value:string)=>createHash("sha256").update(value.normalize("NFKC").replace(/\s+/g," ").trim()).digest("hex");
const toTranscript=(row:Record<string,unknown>):VideoTranscript=>({id:String(row.id),projectId:String(row.project_id),sourceId:String(row.source_id),videoId:String(row.video_id),language:row.language as string|null,isGenerated:row.is_generated===null?null:Number(row.is_generated)===1,provider:"youtube-transcript",origin:"VIDEO_TRANSCRIPT",status:String(row.status) as YouTubeTranscriptResult["status"],fingerprint:row.fingerprint as string|null,retrievedAt:String(row.retrieved_at),errorCode:row.error_code as string|null,errorMessage:row.error_message as string|null});
const toTranscriptSegment=(row:Record<string,unknown>):VideoTranscriptSegment=>({id:String(row.id),transcriptId:String(row.transcript_id),sourceId:String(row.source_id),videoId:String(row.video_id),segmentIndex:Number(row.segment_index),startSeconds:Number(row.start_seconds),endSeconds:Number(row.end_seconds),text:String(row.text),fingerprint:String(row.text_fingerprint)});
function toSource(row: SourceRow): Source {
  return { id: row.id, projectId: row.project_id, sourceType: row.source_type, title: row.title,
    url: row.url, status: row.status, includeInAnalysis:row.include_in_analysis===1, metadata: parseMetadata(row.metadata_json), createdAt: row.created_at };
}
function toComment(row: CommentRow): Comment {
  return { id: row.id, projectId: row.project_id, sourceId: row.source_id,
    platformCommentId: row.platform_comment_id, author: row.author, text: row.text, likes: row.likes,
    publishedAt: row.published_at, threadId: row.thread_id, parentCommentId: row.parent_comment_id,
    isReply: row.is_reply === 1, isDemo: row.is_demo === 1,analysisEligible:row.analysis_eligible===1,noiseReason:row.noise_reason,qualityScore:row.quality_score };
}

export class SourceRepository {
  constructor(private readonly database: AppDatabase) {}

  projectExists(projectId: string): boolean {
    return this.database.connection.prepare("SELECT 1 FROM projects WHERE id=?").get(projectId) !== undefined;
  }

  list(projectId: string, filter: SourceListFilter = {}): Source[] {
    const clauses = ["project_id = ?"], values: Array<string> = [projectId];
    if (filter.sourceType) { clauses.push("source_type = ?"); values.push(filter.sourceType); }
    if (filter.query?.trim()) { clauses.push("(title LIKE ? OR COALESCE(url,'') LIKE ? OR COALESCE(raw_text,'') LIKE ?)"); const q=`%${filter.query.trim()}%`; values.push(q,q,q); }
    return (this.database.connection.prepare(`SELECT * FROM sources WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`).all(...values) as unknown as SourceRow[]).map(toSource);
  }

  get(projectId: string, sourceId: string): Source | undefined {
    const row=this.database.connection.prepare("SELECT * FROM sources WHERE project_id=? AND id=?").get(projectId,sourceId) as SourceRow|undefined;
    return row ? toSource(row) : undefined;
  }

  findYouTubeByVideoId(projectId:string,videoId:string):Source|undefined{
    const row=this.database.connection.prepare("SELECT * FROM sources WHERE project_id=? AND source_type='youtube' AND json_extract(metadata_json,'$.videoId')=? AND status NOT IN ('failed','cancelled') ORDER BY created_at LIMIT 1").get(projectId,videoId) as SourceRow|undefined;
    return row?toSource(row):undefined;
  }

  setIncludedInAnalysis(projectId: string, sourceId: string, included: boolean): Source | undefined {
    const current = this.get(projectId, sourceId);
    if (!current) return undefined;
    if (current.includeInAnalysis === included) return current;
    const now = new Date().toISOString();
    this.database.connection.exec("BEGIN IMMEDIATE");
    try {
      this.database.connection.prepare("UPDATE sources SET include_in_analysis=?,updated_at=? WHERE project_id=? AND id=?").run(included ? 1 : 0, now, projectId, sourceId);
      this.invalidateSourceArtifacts(projectId, "Se actualizó el conjunto de fuentes incluidas en análisis.", now);
      this.database.connection.exec("COMMIT");
    } catch (error) {
      this.database.connection.exec("ROLLBACK");
      throw error;
    }
    return this.get(projectId, sourceId);
  }

  analysisSet(projectId:string):Comment[]{return (this.database.connection.prepare(`SELECT c.* FROM comments c JOIN sources s ON s.id=c.source_id AND s.project_id=c.project_id WHERE c.project_id=? AND s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed') ORDER BY c.quality_score DESC,c.likes DESC,c.created_at`).all(projectId) as unknown as CommentRow[]).map(toComment);}

  getBundle(projectId: string, sourceId: string): SourceBundle | undefined {
    const source=this.get(projectId,sourceId); if(!source)return undefined;
    return {sources:[source],comments:this.listComments(projectId,{sourceId,limit:10_000})};
  }
  getEvidence(projectId:string,evidenceId:string):EvidenceSnippet|undefined{
    return this.database.connection.prepare(`SELECT e.id,e.project_id projectId,e.source_id sourceId,e.comment_id commentId,e.quote_text quoteText,e.provenance,s.title sourceTitle,c.author FROM evidence_snippets e JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id WHERE e.project_id=? AND e.id=?`).get(projectId,evidenceId) as EvidenceSnippet|undefined;
  }

  getVideoTranscript(projectId:string,sourceId:string):VideoTranscript|undefined{
    const row=this.database.connection.prepare("SELECT * FROM video_transcripts WHERE project_id=? AND source_id=?").get(projectId,sourceId) as Record<string,unknown>|undefined;
    return row?toTranscript(row):undefined;
  }
  listVideoTranscriptSegments(projectId:string,sourceId:string):VideoTranscriptSegment[]{
    return (this.database.connection.prepare(`SELECT s.* FROM video_transcript_segments s JOIN video_transcripts t ON t.id=s.transcript_id AND t.project_id=s.project_id WHERE s.project_id=? AND s.source_id=? ORDER BY s.segment_index`).all(projectId,sourceId) as Record<string,unknown>[]).map(toTranscriptSegment);
  }
  saveYouTubeTranscript(projectId:string,sourceId:string,result:YouTubeTranscriptResult,retrievedAt=new Date().toISOString()):VideoTranscript{
    const video=this.database.connection.prepare("SELECT id FROM videos WHERE project_id=? AND source_id=?").get(projectId,sourceId) as {id:string}|undefined;
    if(!video)throw new Error("youtube_video_not_found");
    const existing=this.getVideoTranscript(projectId,sourceId),id=existing?.id??uuidv7(),ready=result.status==="ready";
    const fingerprint=ready?transcriptFingerprint(result.segments.map(segment=>`${segment.startSeconds}:${segment.endSeconds}:${segment.text}`).join("\n")):(result.status==="temporary_error"||result.status==="rate_limited")?existing?.fingerprint??null:null;
    this.database.connection.exec("BEGIN IMMEDIATE");
    try{
      this.database.connection.prepare(`INSERT INTO video_transcripts(id,project_id,source_id,video_id,language,is_generated,provider,origin,status,fingerprint,retrieved_at,error_code,error_message,created_at,updated_at) VALUES(?,?,?,?,?,?, 'youtube-transcript','VIDEO_TRANSCRIPT',?,?,?,?,?,?,?) ON CONFLICT(project_id,source_id,video_id) DO UPDATE SET language=excluded.language,is_generated=excluded.is_generated,status=excluded.status,fingerprint=excluded.fingerprint,retrieved_at=excluded.retrieved_at,error_code=excluded.error_code,error_message=excluded.error_message,updated_at=excluded.updated_at`).run(id,projectId,sourceId,video.id,result.language,result.isGenerated===null?null:result.isGenerated?1:0,result.status,fingerprint,retrievedAt,ready?null:result.status,ready?null:result.reason??null,retrievedAt,retrievedAt);
      if(ready){
        this.database.connection.prepare("DELETE FROM video_transcript_segments WHERE project_id=? AND transcript_id=?").run(projectId,id);
        const insert=this.database.connection.prepare("INSERT INTO video_transcript_segments(id,project_id,transcript_id,source_id,video_id,segment_index,start_seconds,end_seconds,text,text_fingerprint,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
        result.segments.forEach((segment,index)=>insert.run(uuidv7(),projectId,id,sourceId,video.id,index,segment.startSeconds,segment.endSeconds,segment.text,transcriptFingerprint(segment.text),retrievedAt));
      }else if(result.status!=="temporary_error"&&result.status!=="rate_limited") this.database.connection.prepare("DELETE FROM video_transcript_segments WHERE project_id=? AND transcript_id=?").run(projectId,id);
      this.database.connection.exec("COMMIT");
    }catch(error){this.database.connection.exec("ROLLBACK");throw error;}
    return this.getVideoTranscript(projectId,sourceId)!;
  }

  createManual(projectId: string, input: CreateSourceInput): SourceBundle {
    const text=input.text?.trim(); if(!text)throw new Error("manual_text_required");
    const parts=text.split(/\r?\n\s*\r?\n/).map(part=>part.trim()).filter(Boolean);
    return this.insertBundle(projectId,{sourceType:"manual",title:input.title?.trim()||"Texto manual",url:null,rawText:text,
      metadata:{origin:"user",segmentCount:parts.length}},parts.map((part,index)=>({author:"Texto manual",text:part,likes:0,platformId:`manual-${index+1}`})),false);
  }

  createDemo(projectId: string, title?: string): SourceBundle {
    return this.insertBundle(projectId,{sourceType:"demo",title:title?.trim()||"Comentarios de demostración",url:null,rawText:null,
      metadata:{demo:true,fixtureVersion:"1.0",notice:"Datos sintéticos; no representan testimonios reales."}},
      DEMO_COMMENTS.map(([author,text,likes],index)=>({author,text,likes,platformId:`demo-${index+1}`})),true);
  }

  createPendingYouTube(projectId:string,title:string,url:string,videoId:string):Source {
    const id=uuidv7(),now=new Date().toISOString();
    this.database.connection.prepare(`INSERT INTO sources(id,project_id,source_type,title,url,status,metadata_json,created_at,updated_at) VALUES(?,?, 'youtube', ?, ?, 'pending', ?, ?, ?)`)
      .run(id,projectId,title,url,JSON.stringify({platform:"youtube",videoId}),now,now);
    return this.get(projectId,id)!;
  }

  finishYouTubeImport(projectId:string,sourceId:string,video:YouTubeVideo,threads:readonly YouTubeThread[],extraReplies:ReadonlyMap<string,readonly YouTubeComment[]>):number {
    const now=new Date().toISOString(),videoRowId=uuidv7();let saved=0;
    this.database.connection.exec("BEGIN IMMEDIATE");
    try {
      this.database.connection.prepare(`INSERT INTO videos(id,project_id,source_id,platform_video_id,title,channel_id,channel_title,published_at,comment_count,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,'{}',?) ON CONFLICT(source_id,platform_video_id) DO UPDATE SET title=excluded.title,channel_id=excluded.channel_id,channel_title=excluded.channel_title,published_at=excluded.published_at,comment_count=excluded.comment_count`)
        .run(videoRowId,projectId,sourceId,video.videoId,video.title,video.channelId,video.channelTitle,video.publishedAt,video.commentCount??null,now);
      const actualVideo=(this.database.connection.prepare("SELECT id FROM videos WHERE project_id=? AND source_id=? AND platform_video_id=?").get(projectId,sourceId,video.videoId) as {id:string}).id;
      const upsert=this.database.connection.prepare(`INSERT INTO comments(id,project_id,source_id,video_id,platform_comment_id,thread_id,parent_comment_id,author,text,likes,published_at,updated_at,is_reply,is_demo,analysis_eligible,noise_reason,quality_score,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,'{}',?) ON CONFLICT(source_id,platform_comment_id) DO UPDATE SET author=excluded.author,text=excluded.text,likes=excluded.likes,published_at=excluded.published_at,updated_at=excluded.updated_at,analysis_eligible=excluded.analysis_eligible,noise_reason=excluded.noise_reason,quality_score=excluded.quality_score`);
      const evidence=this.database.connection.prepare(`INSERT INTO evidence_snippets(id,project_id,source_id,comment_id,quote_text,provenance,created_at) VALUES(?,?,?,?,?,'EVIDENCE_BACKED',?) ON CONFLICT(project_id,comment_id) DO UPDATE SET quote_text=excluded.quote_text`);
      for(const thread of threads){
        const all=[thread.topLevelComment,...thread.embeddedReplies,...(extraReplies.get(thread.topLevelComment.commentId)??[])];
        const unique=new Map(all.map(comment=>[comment.commentId,comment]));
        const localIds=new Map<string,string>();for(const comment of unique.values()){const existing=this.database.connection.prepare("SELECT id FROM comments WHERE source_id=? AND platform_comment_id=?").get(sourceId,comment.commentId) as {id:string}|undefined;localIds.set(comment.commentId,existing?.id??uuidv7());}
        for(const comment of unique.values()){const id=localIds.get(comment.commentId)!,quality=classifyComment(comment.text,comment.isReply);upsert.run(id,projectId,sourceId,actualVideo,comment.commentId,thread.threadId,comment.parentCommentId?localIds.get(comment.parentCommentId)??null:null,comment.author,comment.text,comment.likes,comment.publishedAt,comment.updatedAt,comment.isReply?1:0,quality.eligible?1:0,quality.reason,quality.score,now);evidence.run(uuidv7(),projectId,sourceId,id,comment.text,now);saved++;}
      }
      this.database.connection.prepare(`UPDATE sources SET title=?,status='ready',metadata_json=?,error_code=NULL,error_message=NULL,updated_at=? WHERE project_id=? AND id=?`).run(video.title,JSON.stringify({platform:"youtube",videoId:video.videoId,channelId:video.channelId,channelTitle:video.channelTitle,reportedCommentCount:video.commentCount??null}),now,projectId,sourceId);
      this.database.connection.prepare(`UPDATE workflow_steps SET state='COMPLETED',stale_reason=NULL,updated_at=? WHERE project_id=? AND step_key='sources'`).run(now,projectId);
      this.database.connection.prepare(`UPDATE workflow_steps SET state=CASE WHEN state='PENDING' THEN 'READY' ELSE state END,updated_at=? WHERE project_id=? AND step_key='problems'`).run(now,projectId);
      this.invalidateSourceArtifacts(projectId,"Se completó o actualizó una fuente de evidencia.",now);
      this.database.connection.exec("COMMIT");
    }catch(error){this.database.connection.exec("ROLLBACK");throw error;}
    return saved;
  }

  markImportFailed(projectId:string,sourceId:string,code:string,message:string):void{this.database.connection.prepare("UPDATE sources SET status='failed',error_code=?,error_message=?,updated_at=? WHERE project_id=? AND id=?").run(code,message,new Date().toISOString(),projectId,sourceId);}
  markImportCancelled(projectId:string,sourceId:string):void{this.database.connection.prepare("UPDATE sources SET status='cancelled',updated_at=? WHERE project_id=? AND id=?").run(new Date().toISOString(),projectId,sourceId);}
  markImportPending(projectId:string,sourceId:string):void{this.database.connection.prepare("UPDATE sources SET status='pending',error_code=NULL,error_message=NULL,updated_at=? WHERE project_id=? AND id=?").run(new Date().toISOString(),projectId,sourceId);}

  delete(projectId:string,sourceId:string):boolean {
    this.database.connection.exec("BEGIN IMMEDIATE");
    try {
      this.database.connection.prepare(`DELETE FROM evidence_links WHERE project_id=? AND source_type='evidence_snippet' AND source_id IN (SELECT id FROM evidence_snippets WHERE project_id=? AND source_id=?)`).run(projectId,projectId,sourceId);
    const result=this.database.connection.prepare("DELETE FROM sources WHERE project_id=? AND id=?").run(projectId,sourceId) as StatementResultingChanges;
    if(result.changes===1)this.invalidateSourceArtifacts(projectId,"Se eliminó una fuente de evidencia.",new Date().toISOString());
      const deleted=result.changes===1;
      this.database.connection.exec("COMMIT");
      return deleted;
    }catch(error){this.database.connection.exec("ROLLBACK");throw error;}
  }

  listComments(projectId:string,filter:CommentListFilter={}):Comment[] {
    const clauses=["project_id = ?"], values:Array<string|number>=[projectId];
    if(filter.sourceId){clauses.push("source_id = ?");values.push(filter.sourceId);}
    if(filter.replies!==undefined){clauses.push("is_reply = ?");values.push(filter.replies?1:0);}
    if(filter.minLikes!==undefined){clauses.push("likes >= ?");values.push(filter.minLikes);}
    if(filter.query?.trim()){clauses.push("(text LIKE ? OR author LIKE ?)");const q=`%${filter.query.trim()}%`;values.push(q,q);}
    const limit=Math.min(Math.max(filter.limit??100,1),1000),offset=Math.max(filter.offset??0,0);values.push(limit,offset);
    return (this.database.connection.prepare(`SELECT * FROM comments WHERE ${clauses.join(" AND ")} ORDER BY likes DESC, created_at ASC LIMIT ? OFFSET ?`).all(...values) as unknown as CommentRow[]).map(toComment);
  }

  private insertBundle(projectId:string,sourceData:{sourceType:SourceType;title:string;url:string|null;rawText:string|null;metadata:Record<string,unknown>},comments:Array<{author:string;text:string;likes:number;platformId:string}>,isDemo:boolean):SourceBundle {
    if(!this.projectExists(projectId))throw new Error("project_not_found");
    const sourceId=uuidv7(),now=new Date().toISOString();
    this.database.connection.exec("BEGIN IMMEDIATE");
    try {
      this.database.connection.prepare(`INSERT INTO sources(id,project_id,source_type,title,url,status,raw_text,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,'ready',?,?,?,?)`)
        .run(sourceId,projectId,sourceData.sourceType,sourceData.title,sourceData.url,sourceData.rawText,JSON.stringify(sourceData.metadata),now,now);
      const insertComment=this.database.connection.prepare(`INSERT INTO comments(id,project_id,source_id,platform_comment_id,author,text,likes,is_reply,is_demo,analysis_eligible,noise_reason,quality_score,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,0,?,?,?,?, '{}',?)`);
      const insertEvidence=this.database.connection.prepare(`INSERT INTO evidence_snippets(id,project_id,source_id,comment_id,quote_text,provenance,created_at) VALUES(?,?,?,?,?,'EVIDENCE_BACKED',?)`);
      comments.forEach(comment=>{const id=uuidv7(),quality=classifyComment(comment.text,false);insertComment.run(id,projectId,sourceId,comment.platformId,comment.author,comment.text,comment.likes,isDemo?1:0,quality.eligible?1:0,quality.reason,quality.score,now);insertEvidence.run(uuidv7(),projectId,sourceId,id,comment.text,now);});
      this.database.connection.prepare(`UPDATE workflow_steps SET state='COMPLETED',stale_reason=NULL,updated_at=? WHERE project_id=? AND step_key='sources'`).run(now,projectId);
      this.database.connection.prepare(`UPDATE workflow_steps SET state=CASE WHEN state='PENDING' THEN 'READY' ELSE state END,updated_at=? WHERE project_id=? AND step_key='problems'`).run(now,projectId);
      this.invalidateSourceArtifacts(projectId,"Se añadió una fuente de evidencia.",now);
      this.database.connection.exec("COMMIT");
    } catch(error){this.database.connection.exec("ROLLBACK");throw error;}
    return this.getBundle(projectId,sourceId)!;
  }

  private invalidateSourceArtifacts(projectId:string,reason:string,now:string):void{
    const root=this.database.connection.prepare("SELECT active_version_id id FROM artifacts WHERE project_id=? AND artifact_type='sources' AND active_version_id IS NOT NULL ORDER BY created_at LIMIT 1").get(projectId) as {id:string}|undefined;
    if(!root)return;
    const versions=this.database.connection.prepare(`WITH RECURSIVE affected(id) AS (SELECT ? UNION SELECT le.child_version_id FROM lineage_edges le JOIN affected a ON le.parent_version_id=a.id WHERE le.project_id=?) SELECT id FROM affected`).all(root.id,projectId) as unknown as Array<{id:string}>;
    const update=this.database.connection.prepare("UPDATE artifact_versions SET freshness='stale',stale_reason=? WHERE project_id=? AND id=?");
    for(const version of versions)update.run(reason,projectId,version.id);
    this.database.connection.prepare(`UPDATE workflow_steps SET state='STALE',stale_reason=?,updated_at=? WHERE project_id=? AND step_key IN (SELECT DISTINCT a.artifact_type FROM artifacts a JOIN artifact_versions v ON v.artifact_id=a.id WHERE v.id IN (${versions.map(()=>"?").join(",")}))`).run(reason,now,projectId,...versions.map(v=>v.id));
  }
}
