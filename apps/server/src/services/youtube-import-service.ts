import type { Job, Source } from "@our-platform/shared";
import type { JobRecord, JobRepository } from "../repositories/job-repository.js";
import type { SourceRepository } from "../repositories/source-repository.js";
import { IntegrationError } from "../integrations/integration-error.js";
import { YouTubeAdapter, extractYouTubeVideoId, type YouTubeComment } from "../integrations/youtube-adapter.js";
import { scoreYouTubeResearch, type ResearchScoredVideo } from "./youtube-research-score.js";

export { extractYouTubeVideoId } from "../integrations/youtube-adapter.js";

export class YouTubeImportError extends Error {
  constructor(readonly code:"youtube_not_configured"|"invalid_youtube_url"|"duplicate_youtube_source",message:string){super(message);}
}

export class YouTubeImportService {
  static readonly DEFAULT_TOP_LEVEL_COMMENTS = 500;
  static readonly MAX_TOP_LEVEL_COMMENTS = 2_000;
  private readonly adapter:YouTubeAdapter;
  private closed=false;
  constructor(private readonly sources:SourceRepository,private readonly jobs:JobRepository,apiKey:string|undefined=process.env.YOUTUBE_API_KEY,adapter?:YouTubeAdapter){this.adapter=adapter??new YouTubeAdapter(apiKey===undefined?{}:{apiKey});}
  isConfigured():boolean{return this.adapter.configured;}
  close():void{this.closed=true;}
  async search(query:string,pageToken?:string):Promise<{items:ResearchScoredVideo[];nextPageToken?:string}>{
    if(!this.isConfigured())throw new YouTubeImportError("youtube_not_configured","YouTube no está configurado.");
    const hits=await this.adapter.searchVideos(query,pageToken),metadata=await this.adapter.getVideos(hits.items.map(hit=>hit.videoId));
    const byId=new Map(metadata.map(video=>[video.videoId,video]));const deduped=new Map<string,ResearchScoredVideo>();
    for(const hit of hits.items){const video=byId.get(hit.videoId);if(video){const thumb=video.thumbnailUrl??hit.thumbnailUrl;deduped.set(video.videoId,scoreYouTubeResearch(query,{...video,description:video.description??hit.description,...(thumb?{thumbnailUrl:thumb}:{})}));}}
    return {items:[...deduped.values()],...(hits.nextPageToken?{nextPageToken:hits.nextPageToken}:{})};
  }
  queue(projectId:string,url:string,title?:string,topLevelLimit=YouTubeImportService.DEFAULT_TOP_LEVEL_COMMENTS):{source:Source;job:Job}{
    if(!this.isConfigured())throw new YouTubeImportError("youtube_not_configured","YouTube no está configurado. Añade YOUTUBE_API_KEY o usa Demo.");
    const videoId=extractYouTubeVideoId(url);if(!videoId)throw new YouTubeImportError("invalid_youtube_url","La URL no identifica un video público de YouTube.");
    if(this.sources.findYouTubeByVideoId(projectId,videoId))throw new YouTubeImportError("duplicate_youtube_source","Este video de YouTube ya fue añadido al proyecto.");
    const limit=Math.max(1,Math.min(YouTubeImportService.MAX_TOP_LEVEL_COMMENTS,Math.floor(topLevelLimit)));
    const source=this.sources.createPendingYouTube(projectId,title?.trim()||`YouTube ${videoId}`,url,videoId),job=this.jobs.createYouTube(projectId,source.id,url,limit);
    this.schedule(projectId,job.id);
    return {source,job};
  }

  cancel(projectId:string,jobId:string):Job|undefined{const record=this.jobs.getRecord(projectId,jobId);const job=this.jobs.cancel(projectId,jobId);if(job?.status==="CANCELLED"&&record?.sourceId)this.sources.markImportCancelled(projectId,record.sourceId);return job;}
  retry(projectId:string,jobId:string):Job|undefined{const record=this.jobs.getRecord(projectId,jobId),job=this.jobs.retry(projectId,jobId);if(job?.status==="QUEUED"&&record?.sourceId&&(record.status==="FAILED"||record.status==="CANCELLED")){this.sources.markImportPending(projectId,record.sourceId);this.schedule(projectId,jobId);}return job;}
  resumePending():void{const pending=this.jobs.recoverYouTubeImports();if(!this.isConfigured()){this.jobs.failPendingYouTubeWithoutProvider();return;}for(const job of pending)this.schedule(job.projectId,job.jobId);}

  private schedule(projectId:string,jobId:string):void{queueMicrotask(()=>{void this.run(projectId,jobId);});}
  private async run(projectId:string,jobId:string):Promise<void>{
    if(this.closed)return;
    if(this.jobs.get(projectId,jobId)?.status!=="QUEUED")return;
    this.jobs.start(projectId,jobId,"Consultando metadata de YouTube");const job=this.jobs.getRecord(projectId,jobId);if(!job?.sourceId||job.status!=="RUNNING")return;
    const videoId=typeof job.payload.url==="string"?extractYouTubeVideoId(job.payload.url):undefined;
    if(!videoId){this.fail(projectId,jobId,job.sourceId,"invalid_youtube_url","La URL del job dejó de ser válida.");return;}
    try{
      const video=await this.adapter.getVideo(videoId);if(this.superseded(job))return;if(!video)throw new IntegrationError("invalid_response","El video no existe, no es público o no está disponible.");
      let token=typeof job.payload.pageToken==="string"?job.payload.pageToken:undefined,pageCount=typeof job.payload.pageCount==="number"?job.payload.pageCount:0,savedCount=typeof job.payload.savedCount==="number"?job.payload.savedCount:0,threadCount=typeof job.payload.threadCount==="number"?job.payload.threadCount:0;
      const limit=typeof job.payload.topLevelLimit==="number"?Math.max(1,Math.min(YouTubeImportService.MAX_TOP_LEVEL_COMMENTS,job.payload.topLevelLimit)):YouTubeImportService.DEFAULT_TOP_LEVEL_COMMENTS;
      const seenPages=new Set<string>();
      while(threadCount<limit){
        if(this.superseded(job))return;
        this.claimPage(seenPages,token);
        const remaining=limit-threadCount;
        const page=await this.adapter.listCommentThreads({videoId,maxResults:Math.min(100,remaining),order:"relevance",...(token===undefined?{}:{pageToken:token})});if(this.superseded(job))return;pageCount++;const threads=page.items.slice(0,remaining),extraReplies=new Map<string,YouTubeComment[]>();
        for(const thread of threads){
          if(thread.totalReplyCount<=thread.embeddedReplies.length)continue;
          let replyToken:string|undefined;const replies:YouTubeComment[]=[],seenReplyPages=new Set<string>();
          do{
            if(this.superseded(job))return;
            this.claimPage(seenReplyPages,replyToken);
            const replyPage=await this.adapter.listReplies({parentCommentId:thread.topLevelComment.commentId,maxResults:100,...(replyToken===undefined?{}:{pageToken:replyToken})});
            if(this.superseded(job))return;
            replies.push(...replyPage.items);replyToken=replyPage.nextPageToken;
          }while(replyToken);
          extraReplies.set(thread.topLevelComment.commentId,replies);
        }
        savedCount+=this.sources.finishYouTubeImport(projectId,job.sourceId,video,threads,extraReplies);threadCount+=threads.length;token=threadCount<limit?page.nextPageToken:undefined;
        this.jobs.checkpoint(projectId,jobId,{url:job.payload.url,topLevelLimit:limit,...(token?{pageToken:token}:{}),pageCount,savedCount,threadCount},Math.min(95,10+pageCount*7),`${threadCount} / ${limit} comentarios`);
        if(!token)break;
      }
      if(!this.superseded(job))this.jobs.complete(projectId,jobId,{videoId,count:savedCount,threadCount});
    }catch(error){if(this.superseded(job))return;const code=error instanceof IntegrationError?error.code:"database_error",message=error instanceof Error?error.message:"La importación falló.";this.fail(projectId,jobId,job.sourceId,code,message);}
  }
  private superseded(attempt:JobRecord):boolean{
    if(this.closed)return true;
    const current=this.jobs.getRecord(attempt.projectId,attempt.id);
    // Cancellation can be cleared by a retry while the old HTTP request is pending.
    // Only the current running attempt may save evidence or update job/source state.
    return !current||current.status!=="RUNNING"||current.cancelRequested||current.attempts!==attempt.attempts||current.sourceId!==attempt.sourceId;
  }
  private claimPage(seen:Set<string>,token:string|undefined):void{
    if(token===undefined)return;
    if(seen.has(token))throw new IntegrationError("invalid_response","YouTube repitió una página de comentarios; se detuvo la importación para proteger la cuota.");
    seen.add(token);
  }
  private fail(projectId:string,jobId:string,sourceId:string,code:string,message:string):void{this.sources.markImportFailed(projectId,sourceId,code,message);this.jobs.fail(projectId,jobId,code,message);}
}
